import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { memoryReconstruction } from '@axia/engine';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);
let app: INestApplication;
let gameId: string;
let presetId: string;

type Agent = ReturnType<typeof request.agent>;

const devLogin = (agent: Agent, body: Record<string, unknown>) => agent.post('/api/auth/dev-login').send(body);
const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

async function admin(): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await devLogin(agent, { email: 'admin@test.local' }).expect(200);
  return agent;
}

async function completedSession(userId: string, startedAt = new Date()) {
  return prisma.gameSession.create({
    data: { userId, gameId, presetId, seed: 's', paramsSnapshot: {}, status: 'COMPLETED', score: 50, maxScore: 100, startedAt, completedAt: startedAt },
  });
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Feedback","InviteCode","GameSession","Challenge","DifficultyPreset","Game","AnalyticsEvent","AuditLog","User" CASCADE',
  );
  await redis.flushdb();
  const game = await prisma.game.create({
    data: {
      slug: 'memory',
      name: 'Memory',
      description: 'test',
      templateKey: memoryReconstruction.key,
      status: 'LIVE',
      presets: { create: { key: 'easy', label: 'Easy', isDefault: true, params: memoryReconstruction.defaultParams } },
    },
    include: { presets: true },
  });
  gameId = game.id;
  presetId = game.presets[0].id;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  process.env.SIGNUP_MODE = 'open';
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('closed beta: invite-only signup', () => {
  beforeAll(() => {
    process.env.SIGNUP_MODE = 'invite';
  });
  afterAll(() => {
    process.env.SIGNUP_MODE = 'open';
  });

  it('rejects a new user without an invite', async () => {
    const res = await devLogin(request.agent(app.getHttpServer()), { email: 'nobody@test.local' }).expect(403);
    expect(res.body.code).toBe('INVITE_REQUIRED');
    expect(await prisma.user.count({ where: { email: 'nobody@test.local' } })).toBe(0);
  });

  it('lets admins in without a code', async () => {
    await admin();
  });

  it('accepts a valid code (case-insensitive), counts uses, and stops at maxUses', async () => {
    const a = await admin();
    await a.post('/api/admin/invites').send({ code: 'college-1', label: 'College group', maxUses: 1 }).expect(201);
    await a.post('/api/admin/invites').send({ code: 'COLLEGE-1', label: 'dup' }).expect(409);

    const first = await devLogin(request.agent(app.getHttpServer()), {
      email: 'first@test.local',
      inviteCode: 'college-1',
      utmSource: 'instagram',
      utmCampaign: 'beta-week1',
    }).expect(200);
    expect(first.body.isNew).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'first@test.local' }, include: { inviteCode: true } });
    expect(user.inviteCode?.code).toBe('COLLEGE-1');
    expect(user.utmSource).toBe('instagram');
    expect(user.utmCampaign).toBe('beta-week1');

    const second = await devLogin(request.agent(app.getHttpServer()), { email: 'second@test.local', inviteCode: 'COLLEGE-1' }).expect(403);
    expect(second.body.code).toBe('INVITE_EXHAUSTED');

    const list = await a.get('/api/admin/invites').expect(200);
    expect(list.body.find((c: { code: string }) => c.code === 'COLLEGE-1')).toMatchObject({ uses: 1, maxUses: 1 });
  });

  it('rejects unknown and deactivated codes with a clear reason', async () => {
    const a = await admin();
    const res = await devLogin(request.agent(app.getHttpServer()), { email: 'bogus@test.local', inviteCode: 'NOPE' }).expect(403);
    expect(res.body.code).toBe('INVITE_INVALID');

    const created = await a.post('/api/admin/invites').send({ code: 'OLDCODE', label: 'old' }).expect(201);
    await a.patch(`/api/admin/invites/${created.body.id}`).send({ active: false }).expect(200);
    const off = await devLogin(request.agent(app.getHttpServer()), { email: 'late@test.local', inviteCode: 'OLDCODE' }).expect(403);
    expect(off.body.code).toBe('INVITE_INVALID');
  });

  it('never asks existing users for a code', async () => {
    const res = await devLogin(request.agent(app.getHttpServer()), { email: 'first@test.local' }).expect(200);
    expect(res.body.isNew).toBe(false);
  });

  it("treats a friend's challenge link as an invite", async () => {
    const friend = await prisma.user.findUniqueOrThrow({ where: { email: 'first@test.local' } });
    const session = await completedSession(friend.id);
    await devLogin(request.agent(app.getHttpServer()), { email: 'viral@test.local', ref: session.id }).expect(200);
    const viral = await prisma.user.findUniqueOrThrow({ where: { email: 'viral@test.local' } });
    expect(viral.referredBySessionId).toBe(session.id);

    // A made-up ref is not an invite.
    await devLogin(request.agent(app.getHttpServer()), { email: 'fake-ref@test.local', ref: 'not-a-session' }).expect(403);
  });
});

describe('rate limiting', () => {
  it('throttles sign-in attempts per client IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/dev-login')
        .set('X-Forwarded-For', '203.0.113.9')
        .send({ email: 'first@test.local' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    // A different client is unaffected.
    await request(app.getHttpServer()).post('/api/auth/dev-login').set('X-Forwarded-For', '203.0.113.10').send({ email: 'first@test.local' }).expect(200);
  });
});

describe('beta feedback', () => {
  it('accepts feedback from players and lists it for admins', async () => {
    const player = request.agent(app.getHttpServer());
    await devLogin(player, { email: 'first@test.local' }).expect(200);
    await player.post('/api/feedback').send({ message: 'Rule Shift was confusing at first', page: '/games/rule-shift', rating: 4 }).expect(201);
    await request(app.getHttpServer()).post('/api/feedback').send({ message: 'Love it', page: '/' }).expect(201);
    await request(app.getHttpServer()).post('/api/feedback').send({ message: 'x', page: '/' }).expect(400);

    const a = await admin();
    const list = await a.get('/api/admin/feedback').expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.averageRating).toBe(4);
    expect(list.body.items.find((f: { rating: number | null }) => f.rating === 4).user.email).toBe('first@test.local');
    await request(app.getHttpServer()).get('/api/admin/feedback').expect(401);
  });

  it('limits feedback spam', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer()).post('/api/feedback').set('X-Forwarded-For', '198.51.100.7').send({ message: `spam ${i}`, page: '/' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});

describe('analytics dashboard', () => {
  it('computes D1/D7 retention for a signup cohort', async () => {
    const day0 = new Date(Date.now() - 10 * 86_400_000);
    const users = await Promise.all(
      [1, 2, 3, 4].map((i) => prisma.user.create({ data: { email: `cohort${i}@test.local`, name: `C${i}`, createdAt: day0, ageMode: 'ADULT' } })),
    );
    await completedSession(users[0].id, day0); // played on signup day
    await completedSession(users[0].id, new Date(day0.getTime() + 86_400_000)); // D1
    await completedSession(users[1].id, new Date(day0.getTime() + 86_400_000)); // D1
    await completedSession(users[0].id, new Date(day0.getTime() + 7 * 86_400_000)); // D7

    const a = await admin();
    const res = await a.get('/api/admin/analytics?days=30').expect(200);
    const cohort = res.body.retention.cohorts.find((c: { day: string }) => c.day === istDay(day0));
    expect(cohort).toMatchObject({ size: 4, d1: 50, d7: 25, d30: null });
    expect(res.body.retention.overall.d1).not.toBeNull();
  });

  it('returns a daily series, funnel, per-game table and acquisition breakdown', async () => {
    const a = await admin();
    const { body } = await a.get('/api/admin/analytics?days=14').expect(200);
    expect(body.daily).toHaveLength(14);
    expect(body.daily.at(-1).day).toBe(istDay(new Date()));
    expect(body.funnel.map((s: { label: string }) => s.label)).toEqual([
      'Signed up',
      'Onboarded',
      'Started a game',
      'Completed a game',
      'Shared a challenge',
    ]);
    expect(body.funnel[0].percent).toBe(100);
    const memory = body.games.find((g: { game: { slug: string } }) => g.game.slug === 'memory');
    expect(memory).toMatchObject({ completionRate: 100 });
    expect(memory.firstGamePlayers).toBeGreaterThan(0);
    expect(body.acquisition.byInvite).toEqual([{ code: 'COLLEGE-1', label: 'College group', signups: 1 }]);
    expect(body.acquisition.byUtm[0]).toMatchObject({ source: 'instagram', campaign: 'beta-week1', signups: 1 });
    expect(body.acquisition.viaChallenge).toBe(1);
  });

  it('is admin-only', async () => {
    const player = request.agent(app.getHttpServer());
    await devLogin(player, { email: 'first@test.local' }).expect(200);
    await player.get('/api/admin/analytics').expect(403);
  });
});
