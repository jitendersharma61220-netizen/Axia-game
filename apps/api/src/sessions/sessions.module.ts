import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  GoneException,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CoinReason, Prisma, SessionStatus, type Challenge, type User } from '@prisma/client';
import { getTemplate, validateParams } from '@axia/engine';
import { randomUUID } from 'node:crypto';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GamesModule, GamesService } from '../games/games.module';
import { LeaderboardsModule, LeaderboardsService, type RankInfo } from '../leaderboards/leaderboards.module';
import { AnalyticsService } from '../analytics/analytics.service';
import { CoinsModule, CoinsService } from '../coins/coins.module';

class StartSessionDto {
  /** Difficulty preset key; defaults to the game's default preset. */
  @IsOptional()
  @IsString()
  difficulty?: string;

  /** Play an active daily/weekly challenge instead of a random level. */
  @IsOptional()
  @IsString()
  challengeId?: string;

  /** Pay the game's extraTryCoins for one more play once today's free plays are used. */
  @IsOptional()
  @IsBoolean()
  useCoins?: boolean;
}

const stepsKey = (sessionId: string) => `steps:${sessionId}`;
const doneKey = (sessionId: string) => `steps:${sessionId}:done`;

/** Moves arriving faster than a human can see, decide and tap (incl. network) point to a bot. */
export const MIN_HUMAN_STEP_GAP_MS = 150;
function hasInhumanGap(times: number[]) {
  return times.some((t, i) => i > 0 && t - times[i - 1] < MIN_HUMAN_STEP_GAP_MS);
}

/**
 * Real-time games (InteractiveSpec.stepPlayMs): each move must arrive about as long
 * after the previous one as the play it covers. Faster means the run was simulated,
 * not played; much slower means it was paused or rewound and replayed.
 */
export const PACE = { minRatio: 0.85, minSlackMs: 500, maxRatio: 1.35, maxSlackMs: 5000, firstStepExtraMs: 20_000 };
export function isOffPace(times: number[], startedAt: number, playMs: number[]) {
  return times.some((t, i) => {
    const gap = t - (i === 0 ? startedAt : times[i - 1]);
    const extra = i === 0 ? PACE.firstStepExtraMs : 0;
    return gap < playMs[i] * PACE.minRatio - PACE.minSlackMs || gap > playMs[i] * PACE.maxRatio + PACE.maxSlackMs + extra;
  });
}

class StepDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  index: number;

  @IsObject()
  step: Record<string, unknown>;
}

class SubmitDto {
  @IsObject()
  submission: Record<string, unknown>;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly games: GamesService,
    private readonly boards: LeaderboardsService,
    private readonly analytics: AnalyticsService,
    private readonly coins: CoinsService,
  ) {}

  async start(user: User, slug: string, dto: StartSessionDto) {
    if (!user.ageMode) throw new ForbiddenException({ code: 'ONBOARDING_REQUIRED', message: 'Complete onboarding first' });
    const game = await this.games.bySlug(slug);
    if (!game || !this.games.isPlayableBy(game, user)) throw new NotFoundException('Game not found');
    const template = getTemplate(game.templateKey);
    if (!template) throw new InternalServerErrorException(`Template ${game.templateKey} is not installed`);

    let challenge: Challenge | null = null;
    if (dto.challengeId) {
      const now = new Date();
      challenge = await this.prisma.challenge.findFirst({
        where: { id: dto.challengeId, gameId: game.id, startsAt: { lte: now }, endsAt: { gt: now } },
      });
      if (!challenge) throw new NotFoundException('Challenge not active');
      const already = await this.prisma.gameSession.count({ where: { userId: user.id, challengeId: challenge.id } });
      if (already) throw new ConflictException({ code: 'CHALLENGE_PLAYED', message: 'You already played this challenge' });
    }

    const preset = challenge
      ? game.presets.find((p) => p.id === challenge.presetId)
      : dto.difficulty
        ? game.presets.find((p) => p.key === dto.difficulty)
        : (game.presets.find((p) => p.isDefault) ?? game.presets[0]);
    if (!preset) throw new BadRequestException('Unknown difficulty');

    const validation = validateParams(game.templateKey, preset.params);
    if (!validation.ok) throw new InternalServerErrorException('Difficulty preset is misconfigured');
    const params = validation.params;

    // Daily attempt limit, reserved atomically in Redis.
    const attemptsKey = this.games.attemptsKey(user.id, game.id);
    const used = await this.redis.incr(attemptsKey);
    await this.redis.expire(attemptsKey, 2 * 86_400);
    // Past the free plays, an adult may buy one more play with coins (never for challenges,
    // which stay one attempt each for everyone).
    let paidCoins = 0;
    if (used > game.attemptsPerDay) {
      const canBuy = dto.useCoins && !challenge && typeof game.extraTryCoins === 'number';
      if (!canBuy) {
        await this.redis.decr(attemptsKey);
        if (dto.useCoins) {
          throw new ConflictException({ code: 'EXTRA_TRY_UNAVAILABLE', message: 'Extra plays can’t be bought for this game.' });
        }
        throw new HttpException(
          {
            code: 'ATTEMPTS_EXHAUSTED',
            message: `Daily limit of ${game.attemptsPerDay} plays reached. Come back tomorrow!`,
            extraTryCoins: challenge ? null : game.extraTryCoins,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      try {
        this.coins.assertCanUseCoins(user);
        await this.coins.debit(user.id, game.extraTryCoins!, CoinReason.EXTRA_TRY, game.slug);
      } catch (err) {
        await this.redis.decr(attemptsKey);
        throw err;
      }
      paidCoins = game.extraTryCoins!;
    }

    const seed = challenge?.seed ?? randomUUID();
    const level = template.generateLevel(params, seed);
    let session;
    try {
      session = await this.prisma.gameSession.create({
        data: {
          userId: user.id,
          gameId: game.id,
          presetId: preset.id,
          challengeId: challenge?.id,
          seed,
          paramsSnapshot: params as Prisma.InputJsonObject,
        },
      });
    } catch (err) {
      await this.redis.decr(attemptsKey);
      if (paidCoins) await this.coins.credit(user.id, paidCoins, CoinReason.EXTRA_TRY_REFUND, game.slug);
      throw err;
    }
    this.analytics.track('game_start', user.id, {
      game: game.slug,
      difficulty: preset.key,
      challengeId: challenge?.id ?? null,
      ...(paidCoins ? { paidCoins } : {}),
    });

    return {
      sessionId: session.id,
      game: { slug: game.slug, name: game.name, templateKey: game.templateKey },
      difficulty: { key: preset.key, label: preset.label },
      challenge: challenge ? { id: challenge.id, title: challenge.title, type: challenge.type } : null,
      attemptsLeft: Math.max(0, game.attemptsPerDay - used),
      paidCoins,
      level: template.toClientLevel(level, params),
    };
  }

  async submit(user: User, sessionId: string, rawSubmission: unknown) {
    const session = await this.prisma.gameSession.findUnique({ where: { id: sessionId }, include: { game: true } });
    if (!session || session.userId !== user.id) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.STARTED) throw new ConflictException({ code: 'ALREADY_SUBMITTED', message: 'Session already finished' });

    const template = getTemplate(session.game.templateKey);
    if (!template) throw new InternalServerErrorException(`Template ${session.game.templateKey} is not installed`);
    const params = session.paramsSnapshot as unknown;
    // Instant-feedback games: the browser's submission is ignored; only moves the
    // server judged one by one (POST /sessions/:id/steps) count.
    const recorded = template.interactive ? await this.recordedSteps(session.id) : null;
    const parsed = template.submissionSchema.safeParse(
      recorded ? template.interactive!.toSubmission(recorded.map((r) => r.step)) : rawSubmission,
    );
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_SUBMISSION', issues: parsed.error.issues });

    const now = new Date();
    const durationMs = now.getTime() - session.startedAt.getTime();
    const bounds = template.timingBounds(params);
    if (durationMs > bounds.maxMs) await this.expire(session.id, now, durationMs);

    // Server-authoritative scoring: regenerate the level from the seed and re-score.
    const level = template.generateLevel(params, session.seed);
    const result = template.score(level, parsed.data, { durationMs }, params);
    const fraudFlags: string[] = [];
    if (durationMs < bounds.minMs) fraudFlags.push('too_fast');
    const playMs = template.interactive?.stepPlayMs;
    if (recorded && playMs) {
      const covered = recorded.map((r) => playMs(r.step, params));
      if (isOffPace(recorded.map((r) => r.at), session.startedAt.getTime(), covered)) fraudFlags.push('off_pace');
    } else if (recorded && hasInhumanGap(recorded.map((r) => r.at))) {
      fraudFlags.push('too_fast_steps');
    }
    const status = fraudFlags.length ? SessionStatus.FLAGGED : SessionStatus.COMPLETED;

    // Conditional update guards against double submits racing each other.
    const { count } = await this.prisma.gameSession.updateMany({
      where: { id: session.id, status: SessionStatus.STARTED },
      data: {
        status,
        completedAt: now,
        durationMs,
        score: result.score,
        maxScore: result.maxScore,
        submission: parsed.data as Prisma.InputJsonObject,
        breakdown: result.breakdown,
        fraudFlags,
      },
    });
    if (!count) throw new ConflictException({ code: 'ALREADY_SUBMITTED', message: 'Session already finished' });
    if (recorded) await this.redis.del(stepsKey(session.id), doneKey(session.id));

    let rank: RankInfo | null = null;
    let challengeRank: RankInfo | null = null;
    if (status === SessionStatus.COMPLETED) {
      await this.boards.record(session.gameId, user.id, result.score, session.challengeId, now);
      rank = await this.boards.rank(this.boards.key(session.gameId, 'all', now), user.id);
      if (session.challengeId) challengeRank = await this.boards.rank(this.boards.challengeKey(session.challengeId), user.id);
    }
    this.analytics.track('game_complete', user.id, {
      game: session.game.slug,
      score: result.score,
      durationMs,
      status,
      challengeId: session.challengeId,
    });

    return {
      sessionId: session.id,
      status,
      score: result.score,
      maxScore: result.maxScore,
      breakdown: result.breakdown,
      highlights: result.highlights,
      notes: result.notes ?? [],
      durationMs,
      fraudFlags,
      leaderboard: rank,
      challengeLeaderboard: challengeRank,
      isPersonalBest: rank ? rank.best === result.score : false,
    };
  }

  /** Judges one move of an instant-feedback game and records it. Moves must arrive in order, once each. */
  async step(user: User, sessionId: string, index: number, rawStep: unknown) {
    const session = await this.prisma.gameSession.findUnique({ where: { id: sessionId }, include: { game: true } });
    if (!session || session.userId !== user.id) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.STARTED) throw new ConflictException({ code: 'ALREADY_SUBMITTED', message: 'Session already finished' });
    const template = getTemplate(session.game.templateKey);
    if (!template?.interactive) throw new BadRequestException({ code: 'NOT_INTERACTIVE', message: 'This game does not use step checking' });

    const params = session.paramsSnapshot as unknown;
    const now = new Date();
    const durationMs = now.getTime() - session.startedAt.getTime();
    if (durationMs > template.timingBounds(params).maxMs) await this.expire(session.id, now, durationMs);

    const parsed = template.interactive.stepSchema.safeParse(rawStep);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_STEP', issues: parsed.error.issues });

    if (await this.redis.exists(doneKey(session.id))) throw new ConflictException({ code: 'GAME_OVER', message: 'No more moves in this game' });
    const recorded = await this.recordedSteps(session.id);
    if (index !== recorded.length) {
      throw new ConflictException({ code: 'OUT_OF_ORDER', message: `Expected move ${recorded.length}, got ${index}` });
    }

    const level = template.generateLevel(params, session.seed);
    const verdict = template.interactive.check(level, params, index, parsed.data, recorded.map((r) => r.step));

    // HSETNX makes each move write-once, even if two requests race for the same index.
    const ttl = Math.ceil(template.timingBounds(params).maxMs / 1000) + 3600;
    const stored = await this.redis.hsetnx(stepsKey(session.id), String(index), JSON.stringify({ step: parsed.data, at: now.getTime() }));
    if (!stored) throw new ConflictException({ code: 'OUT_OF_ORDER', message: `Move ${index} was already recorded` });
    await this.redis.expire(stepsKey(session.id), ttl);
    if (verdict.done) await this.redis.set(doneKey(session.id), '1', 'EX', ttl);

    return { index, done: verdict.done, ...verdict.feedback };
  }

  private async recordedSteps(sessionId: string): Promise<{ step: unknown; at: number }[]> {
    const all = await this.redis.hgetall(stepsKey(sessionId));
    return Object.entries(all)
      .map(([i, v]) => ({ i: Number(i), ...(JSON.parse(v) as { step: unknown; at: number }) }))
      .sort((a, b) => a.i - b.i)
      .map(({ step, at }) => ({ step, at }));
  }

  private async expire(sessionId: string, now: Date, durationMs: number): Promise<never> {
    await this.prisma.gameSession.updateMany({
      where: { id: sessionId, status: SessionStatus.STARTED },
      data: { status: SessionStatus.EXPIRED, completedAt: now, durationMs },
    });
    throw new GoneException({ code: 'SESSION_EXPIRED', message: 'This session expired' });
  }
}

@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('games/:slug/sessions')
  start(@CurrentUser() user: User, @Param('slug') slug: string, @Body() dto: StartSessionDto) {
    return this.sessions.start(user, slug, dto);
  }

  @Post('sessions/:id/steps')
  @HttpCode(200)
  step(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: StepDto) {
    return this.sessions.step(user, id, dto.index, dto.step);
  }

  @Post('sessions/:id/submit')
  submit(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: SubmitDto) {
    return this.sessions.submit(user, id, dto.submission);
  }
}

@Module({ imports: [GamesModule, LeaderboardsModule, CoinsModule], providers: [SessionsService], controllers: [SessionsController] })
export class SessionsModule {}
