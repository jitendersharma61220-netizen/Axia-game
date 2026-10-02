import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Prisma, SessionStatus, type Challenge, type User } from '@prisma/client';
import { getTemplate, validateParams } from '@axia/engine';
import { randomUUID } from 'node:crypto';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GamesModule, GamesService } from '../games/games.module';
import { LeaderboardsModule, LeaderboardsService, type RankInfo } from '../leaderboards/leaderboards.module';
import { AnalyticsService } from '../analytics/analytics.service';

class StartSessionDto {
  /** Difficulty preset key; defaults to the game's default preset. */
  @IsOptional()
  @IsString()
  difficulty?: string;

  /** Play an active daily/weekly challenge instead of a random level. */
  @IsOptional()
  @IsString()
  challengeId?: string;
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
    if (used > game.attemptsPerDay) {
      await this.redis.decr(attemptsKey);
      throw new HttpException(
        { code: 'ATTEMPTS_EXHAUSTED', message: `Daily limit of ${game.attemptsPerDay} plays reached. Come back tomorrow!` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
      throw err;
    }
    this.analytics.track('game_start', user.id, { game: game.slug, difficulty: preset.key, challengeId: challenge?.id ?? null });

    return {
      sessionId: session.id,
      game: { slug: game.slug, name: game.name, templateKey: game.templateKey },
      difficulty: { key: preset.key, label: preset.label },
      challenge: challenge ? { id: challenge.id, title: challenge.title, type: challenge.type } : null,
      attemptsLeft: game.attemptsPerDay - used,
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
    const parsed = template.submissionSchema.safeParse(rawSubmission);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_SUBMISSION', issues: parsed.error.issues });

    const now = new Date();
    const durationMs = now.getTime() - session.startedAt.getTime();
    const bounds = template.timingBounds(params);
    if (durationMs > bounds.maxMs) {
      await this.prisma.gameSession.updateMany({
        where: { id: session.id, status: SessionStatus.STARTED },
        data: { status: SessionStatus.EXPIRED, completedAt: now, durationMs },
      });
      throw new GoneException({ code: 'SESSION_EXPIRED', message: 'This session expired' });
    }

    // Server-authoritative scoring: regenerate the level from the seed and re-score.
    const level = template.generateLevel(params, session.seed);
    const result = template.score(level, parsed.data, { durationMs }, params);
    const fraudFlags: string[] = [];
    if (durationMs < bounds.minMs) fraudFlags.push('too_fast');
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
}

@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('games/:slug/sessions')
  start(@CurrentUser() user: User, @Param('slug') slug: string, @Body() dto: StartSessionDto) {
    return this.sessions.start(user, slug, dto);
  }

  @Post('sessions/:id/submit')
  submit(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: SubmitDto) {
    return this.sessions.submit(user, id, dto.submission);
  }
}

@Module({ imports: [GamesModule, LeaderboardsModule], providers: [SessionsService], controllers: [SessionsController] })
export class SessionsModule {}
