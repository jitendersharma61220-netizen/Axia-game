/** Repopulates the Redis leaderboards from Postgres (the source of truth). */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { LeaderboardsService } from '../leaderboards/leaderboards.module';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

async function main() {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const boards = new LeaderboardsService(redis as RedisService, prisma as PrismaService);
  for (const game of await prisma.game.findMany()) {
    const n = await boards.rebuild(game.id);
    console.log(`${game.slug}: ${n} sessions`);
  }
  await prisma.$disconnect();
  redis.disconnect();
}

void main();
