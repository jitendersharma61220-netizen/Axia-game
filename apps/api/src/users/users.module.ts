import { Body, Controller, ForbiddenException, Get, Injectable, Module, Patch } from '@nestjs/common';
import { SessionStatus, type User } from '@prisma/client';
import { IsInt, Max, Min } from 'class-validator';
import { ageModeForBirthYear } from '../common/age';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

export function toPublicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    ageMode: u.ageMode,
    onboarded: u.ageMode !== null,
    coins: u.coins,
    createdAt: u.createdAt,
  };
}

class OnboardingDto {
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  birthYear: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async onboard(user: User, birthYear: number) {
    const ageMode = ageModeForBirthYear(birthYear);
    if (!ageMode) throw new ForbiddenException({ code: 'UNDER_AGE', message: 'Axia is available for ages 14 and above.' });
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { birthYear, ageMode } });
    this.analytics.track('onboarding_complete', user.id, { ageMode });
    return toPublicUser(updated);
  }

  /** Skill profile: per-game stats and recent sessions. */
  async profile(user: User) {
    const scored = [SessionStatus.COMPLETED];
    const [perGame, recent] = await Promise.all([
      this.prisma.gameSession.groupBy({
        by: ['gameId'],
        where: { userId: user.id, status: { in: scored } },
        _count: { _all: true },
        _max: { score: true },
        _avg: { score: true },
      }),
      this.prisma.gameSession.findMany({
        where: { userId: user.id, status: { not: SessionStatus.STARTED } },
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: { game: { select: { slug: true, name: true } }, preset: { select: { label: true } } },
      }),
    ]);
    const games = await this.prisma.game.findMany({
      where: { id: { in: perGame.map((g) => g.gameId) } },
      select: { id: true, slug: true, name: true },
    });
    const byId = new Map(games.map((g) => [g.id, g]));
    return {
      user: toPublicUser(user),
      totals: {
        plays: perGame.reduce((n, g) => n + g._count._all, 0),
        gamesPlayed: perGame.length,
      },
      games: perGame.map((g) => ({
        game: byId.get(g.gameId),
        plays: g._count._all,
        best: g._max.score,
        average: g._avg.score === null ? null : Math.round(g._avg.score),
      })),
      recent: recent.map((s) => ({
        id: s.id,
        game: s.game,
        difficulty: s.preset.label,
        status: s.status,
        score: s.score,
        maxScore: s.maxScore,
        startedAt: s.startedAt,
        challengeId: s.challengeId,
      })),
    };
  }
}

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get()
  me(@CurrentUser() user?: User) {
    return { user: user ? toPublicUser(user) : null };
  }

  @Patch('onboarding')
  onboard(@CurrentUser() user: User, @Body() dto: OnboardingDto) {
    return this.users.onboard(user, dto.birthYear);
  }

  @Get('profile')
  profile(@CurrentUser() user: User) {
    return this.users.profile(user);
  }
}

@Module({ providers: [UsersService], controllers: [UsersController] })
export class UsersModule {}
