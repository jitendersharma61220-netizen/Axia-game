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
const packs: Record<string, string> = {};

type Agent = ReturnType<typeof request.agent>;

async function login(email: string, birthYear = 1995): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/dev-login').send({ email }).expect(200);
  await agent.patch('/api/me/onboarding').send({ birthYear }).expect(200);
  return agent;
}
const teenYear = new Date().getFullYear() - 15;

async function balanceOf(email: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).coins;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "CoinLedger","Purchase","UserItem","ShopItem","CoinPack","GameSession","Challenge","DifficultyPreset","Game","AnalyticsEvent","AuditLog","User" CASCADE',
  );
  await redis.flushdb();
  for (const p of [
    { key: 'value', label: 'Value', pricePaise: 9900, coins: 100, bonusCoins: 10 },
    { key: 'small', label: 'Small', pricePaise: 4900, coins: 50 },
  ]) {
    packs[p.key] = (await prisma.coinPack.create({ data: p })).id;
  }
  for (const [key, price] of [
    ['ship-a', 40],
    ['ship-b', 40],
  ] as const) {
    await prisma.shopItem.create({ data: { key, label: key, gameSlug: 'arcade', priceCoins: price, data: { core: 1, glow: 2, trail: 3 } } });
  }
  await prisma.game.create({
    data: {
      slug: 'arcade',
      name: 'Arcade',
      description: 't',
      templateKey: memoryReconstruction.key,
      status: 'LIVE',
      ageModes: ['ADULT', 'TEEN'],
      attemptsPerDay: 1,
      extraTryCoins: 10,
      presets: { create: { key: 'normal', label: 'Normal', isDefault: true, params: memoryReconstruction.defaultParams } },
    },
  });
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

describe('coins', () => {
  it('lets an adult buy a pack (test mode) and records it in their history', async () => {
    const p = await login('buyer@test.local');
    const shop = await p.get('/api/shop').expect(200);
    expect(shop.body).toMatchObject({ balance: 0, canBuy: true, payments: { enabled: true, testMode: true } });
    const res = await p.post('/api/shop/purchases').send({ packId: packs.value }).expect(201);
    expect(res.body).toMatchObject({ status: 'PAID', coins: 110, balance: 110, testMode: true });
    const me = await p.get('/api/me').expect(200);
    expect(me.body.user.coins).toBe(110);
    const history = await p.get('/api/me/coins').expect(200);
    expect(history.body.history[0]).toMatchObject({ delta: 110, reason: 'PURCHASE', balanceAfter: 110, ref: res.body.purchaseId });
  });

  it('never lets teens buy or spend coins', async () => {
    const t = await login('teen@test.local', teenYear);
    const shop = await t.get('/api/shop').expect(200);
    expect(shop.body.canBuy).toBe(false);
    const res = await t.post('/api/shop/purchases').send({ packId: packs.small }).expect(403);
    expect(res.body.code).toBe('ADULTS_ONLY');
    await t.post('/api/shop/items/ship-a/buy').expect(403);
  });

  it('refuses purchases when no payment provider is configured', async () => {
    const p = await login('nopay@test.local');
    process.env.PAYMENTS_PROVIDER = 'none';
    try {
      const res = await p.post('/api/shop/purchases').send({ packId: packs.small }).expect(503);
      expect(res.body.code).toBe('PAYMENTS_UNAVAILABLE');
      expect((await p.get('/api/shop')).body.payments.enabled).toBe(false);
    } finally {
      delete process.env.PAYMENTS_PROVIDER;
    }
  });

  it('buys, equips and re-buys a skin without double charging', async () => {
    const p = await login('skins@test.local');
    await p.post('/api/shop/purchases').send({ packId: packs.value }).expect(201);
    const a = await p.post('/api/shop/items/ship-a/buy').expect(201);
    expect(a.body).toMatchObject({ owned: true, equipped: true, charged: 40, balance: 70 });
    const again = await p.post('/api/shop/items/ship-a/buy').expect(201);
    expect(again.body).toMatchObject({ charged: 0, balance: 70 });
    await p.post('/api/shop/items/ship-b/buy').expect(201);
    let eq = await p.get('/api/shop/equipped/arcade').expect(200);
    expect(eq.body.items.map((i: { key: string }) => i.key)).toEqual(['ship-b']);
    await p.post('/api/shop/equip/arcade/ship-a').expect(200);
    eq = await p.get('/api/shop/equipped/arcade').expect(200);
    expect(eq.body.items).toEqual([{ key: 'ship-a', kind: 'SKIN', data: { core: 1, glow: 2, trail: 3 } }]);
    await p.post('/api/shop/equip/arcade/default').expect(200);
    expect((await p.get('/api/shop/equipped/arcade')).body.items).toEqual([]);
    expect(await balanceOf('skins@test.local')).toBe(30);
  });

  it('never overdraws, even when two purchases race', async () => {
    const p = await login('race@test.local');
    await p.post('/api/shop/purchases').send({ packId: packs.small }).expect(201);
    const results = await Promise.all([p.post('/api/shop/items/ship-a/buy'), p.post('/api/shop/items/ship-b/buy')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 402]);
    expect(await balanceOf('race@test.local')).toBe(10);
    const ledger = await prisma.coinLedger.findMany({ where: { user: { email: 'race@test.local' } } });
    expect(ledger.reduce((n, r) => n + r.delta, 0)).toBe(10);
  });

  it('sells one more play after the free plays, but never for a challenge', async () => {
    const p = await login('extra@test.local');
    await p.post('/api/games/arcade/sessions').send({}).expect(201);
    const out = await p.post('/api/games/arcade/sessions').send({}).expect(429);
    expect(out.body).toMatchObject({ code: 'ATTEMPTS_EXHAUSTED', extraTryCoins: 10 });

    const broke = await p.post('/api/games/arcade/sessions').send({ useCoins: true }).expect(402);
    expect(broke.body.code).toBe('NOT_ENOUGH_COINS');

    await p.post('/api/shop/purchases').send({ packId: packs.small }).expect(201);
    const paid = await p.post('/api/games/arcade/sessions').send({ useCoins: true }).expect(201);
    expect(paid.body.paidCoins).toBe(10);
    expect(await balanceOf('extra@test.local')).toBe(40);
    const spent = await prisma.coinLedger.findFirst({ where: { user: { email: 'extra@test.local' }, reason: 'EXTRA_TRY' } });
    expect(spent).toMatchObject({ delta: -10, ref: 'arcade' });

    const game = await prisma.game.findUniqueOrThrow({ where: { slug: 'arcade' }, include: { presets: true } });
    const now = Date.now();
    const challenge = await prisma.challenge.create({
      data: {
        gameId: game.id,
        presetId: game.presets[0].id,
        type: 'DAILY',
        title: 'Daily',
        seed: 'c',
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now + 3_600_000),
      },
    });
    const res = await p.post('/api/games/arcade/sessions').send({ challengeId: challenge.id, useCoins: true }).expect(409);
    expect(res.body.code).toBe('EXTRA_TRY_UNAVAILABLE');
    expect(await balanceOf('extra@test.local')).toBe(40);
  });

  it('lets admins grant and deduct coins, audited, and only admins', async () => {
    const p = await login('support@test.local');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'support@test.local' } });
    await p.post(`/api/admin/users/${user.id}/coins`).send({ delta: 50, note: 'try' }).expect(403);

    const admin = await login('admin@test.local');
    const res = await admin.post(`/api/admin/users/${user.id}/coins`).send({ delta: 25, note: 'Sorry about the outage' }).expect(200);
    expect(res.body.balance).toBe(25);
    await admin.post(`/api/admin/users/${user.id}/coins`).send({ delta: -100, note: 'Reversal' }).expect(402);
    await admin.post(`/api/admin/users/${user.id}/coins`).send({ delta: -5, note: 'Reversal' }).expect(200);
    expect(await balanceOf('support@test.local')).toBe(20);
    const rows = await prisma.coinLedger.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.reason, r.delta, r.note])).toEqual([
      ['ADMIN_GRANT', 25, 'Sorry about the outage'],
      ['ADMIN_DEDUCT', -5, 'Reversal'],
    ]);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: { in: ['grant_coins', 'deduct_coins'] } } })).toBe(2);

    const overview = await admin.get('/api/admin/shop').expect(200);
    expect(overview.body.stats.testPurchases30d).toBeGreaterThan(0);
    expect(overview.body.stats.revenue30dPaise).toBe(0);
    expect(overview.body.packs.find((x: { key: string }) => x.key === 'value').sold).toBeGreaterThan(0);
  });
});
