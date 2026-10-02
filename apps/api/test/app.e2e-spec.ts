import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { memoryReconstruction, type MemoryClientLevel } from '@axia/engine';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);
let app: INestApplication;
let gameId: string;

type Agent = ReturnType<typeof request.agent>;

async function login(email: string, birthYear?: number): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/dev-login').send({ email, name: 'Test Player' }).expect(200);
  if (birthYear) await agent.patch('/api/me/onboarding').send({ birthYear }).expect(200);
  return agent;
}

/** Pretend the player took long enough to have actually watched the objects. */
async function age(sessionId: string, ms: number) {
  const s = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  await prisma.gameSession.update({ where: { id: sessionId }, data: { startedAt: new Date(s.startedAt.getTime() - ms) } });
}

function perfect(level: MemoryClientLevel) {
  return { rounds: level.rounds.map((r) => ({ placements: r.placements, recallMs: 2000 })) };
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "GameSession","Challenge","DifficultyPreset","Game","AnalyticsEvent","AuditLog","User" CASCADE',
  );
  await redis.flushdb();
  const game = await prisma.game.create({
    data: {
      slug: 'memory',
      name: 'Memory',
      description: 'test',
      templateKey: memoryReconstruction.key,
      status: 'LIVE',
      ageModes: ['ADULT', 'TEEN'],
      attemptsPerDay: 3,
      presets: {
        create: [
          { key: 'easy', label: 'Easy', isDefault: true, params: { ...memoryReconstruction.defaultParams, rounds: 1, showDurationMs: 1000 } },
        ],
      },
    },
  });
  gameId = game.id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('auth & onboarding', () => {
  it('returns null user when signed out and 401 on protected routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/me').expect(200);
    expect(res.body.user).toBeNull();
    await request(app.getHttpServer()).post('/api/games/memory/sessions').send({}).expect(401);
  });

  it('requires onboarding before playing and blocks under-14s', async () => {
    const agent = await login('kid@test.local');
    await agent.post('/api/games/memory/sessions').send({}).expect(403);
    const res = await agent.patch('/api/me/onboarding').send({ birthYear: new Date().getFullYear() - 10 }).expect(403);
    expect(res.body.code).toBe('UNDER_AGE');
  });

  it('assigns TEEN and ADULT modes', async () => {
    const teen = await login('teen@test.local');
    const t = await teen.patch('/api/me/onboarding').send({ birthYear: new Date().getFullYear() - 16 }).expect(200);
    expect(t.body.ageMode).toBe('TEEN');
    const adult = await login('adult@test.local');
    const a = await adult.patch('/api/me/onboarding').send({ birthYear: 1995 }).expect(200);
    expect(a.body.ageMode).toBe('ADULT');
  });

  it('rejects Google login when no client ID is configured', async () => {
    await request(app.getHttpServer()).post('/api/auth/google').send({ idToken: 'x' }).expect(401);
  });
});

describe('play → score → leaderboard', () => {
  let player: Agent;

  beforeAll(async () => {
    player = await login('player@test.local', 1998);
  });

  it('plays a full session with server-side scoring, rank and percentile', async () => {
    const start = await player.post('/api/games/memory/sessions').send({}).expect(201);
    expect(start.body.level.rounds).toHaveLength(1);
    expect(start.body.attemptsLeft).toBe(2);
    await age(start.body.sessionId, 5_000);

    const res = await player
      .post(`/api/sessions/${start.body.sessionId}/submit`)
      .send({ submission: perfect(start.body.level) })
      .expect(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.score).toBeGreaterThan(90);
    expect(res.body.leaderboard).toMatchObject({ rank: 1, total: 1, topPercent: 100 });

    const board = await player.get('/api/leaderboards/memory?period=daily').expect(200);
    expect(board.body.entries[0]).toMatchObject({ rank: 1, isMe: true });

    const share = await request(app.getHttpServer()).get(`/api/share/${start.body.sessionId}`).expect(200);
    expect(share.body).toMatchObject({ player: 'Test', score: res.body.score });
  });

  it('ignores a client-claimed score: a wrong answer scores low', async () => {
    const start = await player.post('/api/games/memory/sessions').send({}).expect(201);
    await age(start.body.sessionId, 5_000);
    const res = await player
      .post(`/api/sessions/${start.body.sessionId}/submit`)
      .send({ submission: { rounds: [{ placements: [], recallMs: 0 }], score: 100 } })
      .expect(201);
    expect(res.body.score).toBe(0);
  });

  it('rejects a double submit', async () => {
    const start = await player.post('/api/games/memory/sessions').send({}).expect(201);
    await age(start.body.sessionId, 5_000);
    const body = { submission: perfect(start.body.level) };
    await player.post(`/api/sessions/${start.body.sessionId}/submit`).send(body).expect(201);
    await player.post(`/api/sessions/${start.body.sessionId}/submit`).send(body).expect(409);
  });

  it('enforces the daily attempt limit', async () => {
    const res = await player.post('/api/games/memory/sessions').send({}).expect(429);
    expect(res.body.code).toBe('ATTEMPTS_EXHAUSTED');
  });

  it('flags impossibly fast submissions and keeps them off the leaderboard', async () => {
    const cheat = await login('cheat@test.local', 1990);
    const start = await cheat.post('/api/games/memory/sessions').send({}).expect(201);
    const res = await cheat
      .post(`/api/sessions/${start.body.sessionId}/submit`)
      .send({ submission: perfect(start.body.level) })
      .expect(201);
    expect(res.body.status).toBe('FLAGGED');
    expect(res.body.fraudFlags).toContain('too_fast');
    expect(res.body.leaderboard).toBeNull();
  });

  it("does not let a player submit someone else's session", async () => {
    const a = await login('a@test.local', 1990);
    const b = await login('b@test.local', 1990);
    const start = await a.post('/api/games/memory/sessions').send({}).expect(201);
    await b.post(`/api/sessions/${start.body.sessionId}/submit`).send({ submission: { rounds: [] } }).expect(404);
  });
});

describe('daily challenge', () => {
  it('gives everyone the same level and allows one attempt', async () => {
    const preset = await prisma.difficultyPreset.findFirstOrThrow({ where: { gameId } });
    const challenge = await prisma.challenge.create({
      data: {
        gameId,
        presetId: preset.id,
        type: 'DAILY',
        title: 'Daily',
        seed: 'fixed-seed',
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
      },
    });
    const p1 = await login('c1@test.local', 1990);
    const p2 = await login('c2@test.local', 1990);
    const s1 = await p1.post('/api/games/memory/sessions').send({ challengeId: challenge.id }).expect(201);
    const s2 = await p2.post('/api/games/memory/sessions').send({ challengeId: challenge.id }).expect(201);
    expect(s1.body.level).toEqual(s2.body.level);
    await p1.post('/api/games/memory/sessions').send({ challengeId: challenge.id }).expect(409);

    const today = await p1.get('/api/challenges/today').expect(200);
    expect(today.body.find((c: { id: string }) => c.id === challenge.id).mySession).not.toBeNull();
  });
});

describe('admin control center', () => {
  let admin: Agent;

  beforeAll(async () => {
    admin = await login('admin@test.local', 1990);
  });

  it('blocks non-admins', async () => {
    const user = await login('notadmin@test.local', 1990);
    await user.get('/api/admin/games').expect(403);
    await request(app.getHttpServer()).get('/api/admin/games').expect(401);
  });

  it('changes game difficulty live: the next session uses the new params without a restart', async () => {
    const game = await admin.get(`/api/admin/games/${gameId}`).expect(200);
    const preset = game.body.presets[0];
    await admin
      .patch(`/api/admin/presets/${preset.id}`)
      .send({ params: { ...preset.params, gridRows: 5, gridCols: 5, objectCount: 9 } })
      .expect(200);

    const player = await login('live@test.local', 1990);
    const start = await player.post('/api/games/memory/sessions').send({}).expect(201);
    expect(start.body.level.rows).toBe(5);
    expect(start.body.level.rounds[0].placements).toHaveLength(9);
  });

  it('rejects invalid params with field errors', async () => {
    const game = await admin.get(`/api/admin/games/${gameId}`).expect(200);
    const res = await admin
      .patch(`/api/admin/presets/${game.body.presets[0].id}`)
      .send({ params: { gridRows: 2, gridCols: 2, objectCount: 9 } })
      .expect(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('objectCount');
  });

  it('can raise the attempt limit and disable a game instantly', async () => {
    await admin.patch(`/api/admin/games/${gameId}`).send({ attemptsPerDay: 50 }).expect(200);
    const player = await login('player@test.local');
    await player.post('/api/games/memory/sessions').send({}).expect(201);

    await admin.patch(`/api/admin/games/${gameId}`).send({ status: 'DISABLED' }).expect(200);
    await player.get('/api/games/memory').expect(404);
    await admin.patch(`/api/admin/games/${gameId}`).send({ status: 'LIVE' }).expect(200);
  });

  it('previews a level for unsaved params', async () => {
    const res = await admin
      .post(`/api/admin/games/${gameId}/preview`)
      .send({ params: { gridRows: 6, gridCols: 6, objectCount: 12 }, seed: 's' })
      .expect(201);
    expect(res.body.level.rows).toBe(6);
  });

  it('records every change in the audit log', async () => {
    const res = await admin.get('/api/admin/audit').expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
    expect(res.body.items[0]).toMatchObject({ actor: 'admin@test.local' });
  });

  it('serves template JSON schemas for the editor and a dashboard', async () => {
    const t = await admin.get('/api/admin/templates').expect(200);
    expect(t.body[0].paramsJsonSchema.properties.objectCount).toBeDefined();
    const d = await admin.get('/api/admin/dashboard').expect(200);
    expect(d.body.today.sessions).toBeGreaterThan(0);
    expect(d.body.today.flagged).toBeGreaterThan(0);
  });

  it('creates a game with a default preset', async () => {
    const res = await admin
      .post('/api/admin/games')
      .send({ slug: 'memory-2', name: 'Memory 2', description: 'x', templateKey: 'memory-reconstruction' })
      .expect(201);
    expect(res.body.presets).toHaveLength(1);
    await admin
      .post('/api/admin/games')
      .send({ slug: 'memory-2', name: 'Dup', description: 'x', templateKey: 'memory-reconstruction' })
      .expect(409);
    await admin
      .post('/api/admin/games')
      .send({ slug: 'bad', name: 'Bad', description: 'x', templateKey: 'not-a-template' })
      .expect(400);
  });
});
