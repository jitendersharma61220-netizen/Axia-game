import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { SessionStatus, type User } from '@prisma/client';
import { dayKey, weekKey } from '../common/time';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GamesModule, GamesService } from '../games/games.module';

export const PERIODS = ['daily', 'weekly', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export interface RankInfo {
  rank: number;
  total: number;
  /** "TOP 8%": share of players who scored at least as well as this one. */
  topPercent: number;
  best: number;
}

/**
 * Leaderboards are Redis sorted sets holding each player's best score.
 * Postgres (GameSession) stays the source of truth; `rebuild` repopulates Redis.
 */
@Injectable()
export class LeaderboardsService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  key(gameId: string, period: Period, at = new Date()) {
    if (period === 'daily') return `lb:${gameId}:daily:${dayKey(at)}`;
    if (period === 'weekly') return `lb:${gameId}:weekly:${weekKey(at)}`;
    return `lb:${gameId}:all`;
  }

  challengeKey(challengeId: string) {
    return `lb:challenge:${challengeId}`;
  }

  async record(gameId: string, userId: string, score: number, challengeId?: string | null, at = new Date()) {
    const multi = this.redis.multi();
    const keys: [string, number | null][] = [
      [this.key(gameId, 'all', at), null],
      [this.key(gameId, 'daily', at), 8 * 86_400],
      [this.key(gameId, 'weekly', at), 35 * 86_400],
    ];
    if (challengeId) keys.push([this.challengeKey(challengeId), 60 * 86_400]);
    for (const [key, ttl] of keys) {
      multi.zadd(key, 'GT', score, userId);
      if (ttl) multi.expire(key, ttl);
    }
    await multi.exec();
  }

  async rank(key: string, userId: string): Promise<RankInfo | null> {
    const best = await this.redis.zscore(key, userId);
    if (best === null) return null;
    const [better, total] = await Promise.all([this.redis.zcount(key, `(${best}`, '+inf'), this.redis.zcard(key)]);
    const rank = better + 1;
    return { rank, total, topPercent: Math.max(1, Math.ceil((rank / total) * 100)), best: Number(best) };
  }

  async top(key: string, limit = 20) {
    const raw = await this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    const entries: { userId: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) entries.push({ userId: raw[i], score: Number(raw[i + 1]) });
    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((e) => e.userId) } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    let lastScore = Infinity;
    let lastRank = 0;
    return entries.map((e, i) => {
      if (e.score < lastScore) {
        lastRank = i + 1;
        lastScore = e.score;
      }
      const u = byId.get(e.userId);
      return { rank: lastRank, score: e.score, name: displayName(u?.name), avatarUrl: u?.avatarUrl ?? null, userId: e.userId };
    });
  }

  /** Rebuild all boards for a game from Postgres. */
  async rebuild(gameId: string) {
    const sessions = await this.prisma.gameSession.findMany({
      where: { gameId, status: SessionStatus.COMPLETED, score: { not: null } },
      select: { userId: true, score: true, completedAt: true, challengeId: true },
    });
    const existing = await this.redis.keys(`lb:${gameId}:*`);
    if (existing.length) await this.redis.del(...existing);
    for (const s of sessions) await this.record(gameId, s.userId, s.score!, s.challengeId, s.completedAt ?? new Date());
    return sessions.length;
  }
}

/** Public boards show first name + last initial only. */
export function displayName(name?: string | null) {
  if (!name) return 'Player';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(
    private readonly boards: LeaderboardsService,
    private readonly games: GamesService,
  ) {}

  @Public()
  @Get(':slug')
  async get(@Param('slug') slug: string, @Query('period') period: string = 'all', @CurrentUser() user?: User) {
    if (!PERIODS.includes(period as Period)) throw new BadRequestException(`period must be one of ${PERIODS.join(', ')}`);
    const game = await this.games.bySlug(slug);
    if (!game) throw new NotFoundException('Game not found');
    const key = this.boards.key(game.id, period as Period);
    const [top, me] = await Promise.all([this.boards.top(key), user ? this.boards.rank(key, user.id) : null]);
    return {
      game: { slug: game.slug, name: game.name },
      period,
      entries: top.map(({ userId, ...e }) => ({ ...e, isMe: userId === user?.id })),
      me,
    };
  }

  @Public()
  @Get('challenge/:challengeId')
  async challenge(@Param('challengeId') challengeId: string, @CurrentUser() user?: User) {
    const key = this.boards.challengeKey(challengeId);
    const [top, me] = await Promise.all([this.boards.top(key), user ? this.boards.rank(key, user.id) : null]);
    return { entries: top.map(({ userId, ...e }) => ({ ...e, isMe: userId === user?.id })), me };
  }
}

@Module({
  imports: [GamesModule],
  providers: [LeaderboardsService],
  controllers: [LeaderboardsController],
  exports: [LeaderboardsService],
})
export class LeaderboardsModule {}
