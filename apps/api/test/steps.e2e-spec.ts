import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { memoryReconstruction, neuralBoss, pileFor, ruleShift } from '@axia/engine';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let app: INestApplication;

type Agent = ReturnType<typeof request.agent>;

async function player(email: string): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
  await agent.patch('/api/me/onboarding').send({ birthYear: 1995 }).expect(200);
  return agent;
}

/** What the server knows: regenerate the level from the stored seed + params. */
async function serverLevel<T>(sessionId: string, template: { generateLevel(p: never, seed: string): T }) {
  const s = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  return template.generateLevel(s.paramsSnapshot as never, s.seed);
}

async function age(sessionId: string, ms: number) {
  const s = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  await prisma.gameSession.update({ where: { id: sessionId }, data: { startedAt: new Date(s.startedAt.getTime() - ms) } });
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Feedback","InviteCode","GameSession","Challenge","DifficultyPreset","Game","AnalyticsEvent","AuditLog","User" CASCADE',
  );
  await redis.flushdb();
  const games = [
    { slug: 'rs', template: ruleShift, params: { ...ruleShift.defaultParams, trials: 8, minRun: 3, maxRun: 4 } },
    { slug: 'nb', template: neuralBoss, params: { ...neuralBoss.defaultParams, bossHp: 30, playerHp: 2, maxQuestions: 10 } },
    { slug: 'mem', template: memoryReconstruction, params: memoryReconstruction.defaultParams },
  ];
  for (const g of games) {
    await prisma.game.create({
      data: {
        slug: g.slug,
        name: g.slug,
        description: 't',
        templateKey: g.template.key,
        status: 'LIVE',
        ageModes: ['ADULT'],
        attemptsPerDay: 50,
        presets: { create: { key: 'normal', label: 'Normal', isDefault: true, params: g.params } },
      },
    });
  }
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

describe('Rule Shift: answers are judged on the server', () => {
  it('never sends the hidden rule to the browser', async () => {
    const p = await player('rs-hidden@test.local');
    const start = await p.post('/api/games/rs/sessions').send({}).expect(201);
    expect(JSON.stringify(start.body.level)).not.toContain('"rule"');
  });

  it('judges each sort, scores only recorded moves, and ignores a forged submission', async () => {
    const p = await player('rs-play@test.local');
    const start = await p.post('/api/games/rs/sessions').send({}).expect(201);
    const id = start.body.sessionId;
    const level = await serverLevel(id, ruleShift);

    const correctPile = (i: number) => pileFor(level.trials[i], level.trials[i].rule);
    for (let i = 0; i < level.trials.length; i++) {
      const pile = i === 2 ? (correctPile(i) + 1) % 4 : correctPile(i); // one deliberate mistake
      const res = await p.post(`/api/sessions/${id}/steps`).send({ index: i, step: { pile, ms: 600 } }).expect(200);
      expect(res.body).toMatchObject({ index: i, correct: i !== 2, done: i === level.trials.length - 1 });
      if (i === 3) {
        // Replaying or skipping ahead is refused.
        await p.post(`/api/sessions/${id}/steps`).send({ index: 3, step: { pile, ms: 600 } }).expect(409);
        await p.post(`/api/sessions/${id}/steps`).send({ index: 6, step: { pile, ms: 600 } }).expect(409);
      }
      await sleep(160);
    }
    await p.post(`/api/sessions/${id}/steps`).send({ index: 8, step: { pile: 0, ms: 600 } }).expect(409);

    await age(id, 10_000);
    const forged = { answers: level.trials.map((_, i) => ({ pile: correctPile(i), ms: 1 })) };
    const res = await p.post(`/api/sessions/${id}/submit`).send({ submission: forged }).expect(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.breakdown.correct).toBe(level.trials.length - 1);
    expect(res.body.score).toBeLessThan(100);
  });

  it('flags moves that arrive faster than a human can play', async () => {
    const p = await player('rs-bot@test.local');
    const start = await p.post('/api/games/rs/sessions').send({}).expect(201);
    const id = start.body.sessionId;
    const level = await serverLevel(id, ruleShift);
    for (let i = 0; i < level.trials.length; i++) {
      await p.post(`/api/sessions/${id}/steps`).send({ index: i, step: { pile: pileFor(level.trials[i], level.trials[i].rule), ms: 300 } }).expect(200);
    }
    await age(id, 10_000);
    const res = await p.post(`/api/sessions/${id}/submit`).send({ submission: {} }).expect(201);
    expect(res.body.status).toBe('FLAGGED');
    expect(res.body.fraudFlags).toContain('too_fast_steps');
    expect(res.body.leaderboard).toBeNull();
  });

  it("rejects moves on someone else's session and on non-interactive games", async () => {
    const a = await player('rs-a@test.local');
    const b = await player('rs-b@test.local');
    const start = await a.post('/api/games/rs/sessions').send({}).expect(201);
    await b.post(`/api/sessions/${start.body.sessionId}/steps`).send({ index: 0, step: { pile: 0, ms: 500 } }).expect(404);
    await a.post(`/api/sessions/${start.body.sessionId}/steps`).send({ index: 0, step: { pile: 9, ms: 500 } }).expect(400);

    const mem = await a.post('/api/games/mem/sessions').send({}).expect(201);
    const res = await a.post(`/api/sessions/${mem.body.sessionId}/steps`).send({ index: 0, step: {} }).expect(400);
    expect(res.body.code).toBe('NOT_INTERACTIVE');
  });
});

describe('Neural Boss: the fight is judged on the server', () => {
  it('hides answers, reveals each one after it is played, and stops accepting moves when the fight ends', async () => {
    const p = await player('nb@test.local');
    const start = await p.post('/api/games/nb/sessions').send({}).expect(201);
    const id = start.body.sessionId;
    expect(JSON.stringify(start.body.level)).not.toContain('"answer"');
    const level = await serverLevel(id, neuralBoss);

    let i = 0;
    let last: { done: boolean; hit: boolean; answer: number; state: { bossHp: number; playerHp: number; won: boolean } };
    do {
      const q = level.questions[i];
      const choice = i === 1 ? (q.answer + 1) % 4 : q.answer;
      last = (await p.post(`/api/sessions/${id}/steps`).send({ index: i, step: { choice, ms: 900 } }).expect(200)).body;
      expect(last.hit).toBe(i !== 1);
      expect(last.answer).toBe(q.answer);
      i++;
      await sleep(160);
    } while (!last.done);
    expect(last.state).toMatchObject({ won: true, bossHp: 0, playerHp: 1 });

    const after = await p.post(`/api/sessions/${id}/steps`).send({ index: i, step: { choice: 0, ms: 500 } }).expect(409);
    expect(after.body.code).toBe('GAME_OVER');

    await age(id, 10_000);
    const res = await p.post(`/api/sessions/${id}/submit`).send({ submission: {} }).expect(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.breakdown).toMatchObject({ won: 1, livesLeft: 1, hits: 3 });
    // Recorded moves are cleaned up after scoring.
    expect(await redis.exists(`steps:${id}`)).toBe(0);
  });
});
