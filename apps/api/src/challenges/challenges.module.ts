import { Controller, Get, Injectable, Module } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { GamesModule, GamesService } from '../games/games.module';

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  async active(user?: User, now = new Date()) {
    const challenges = await this.prisma.challenge.findMany({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: [{ type: 'asc' }, { startsAt: 'asc' }],
      include: { game: true, preset: { select: { key: true, label: true } } },
    });
    const visible = challenges.filter((c) => this.games.isPlayableBy(c.game, user));
    const played = user
      ? await this.prisma.gameSession.findMany({
          where: { userId: user.id, challengeId: { in: visible.map((c) => c.id) } },
          select: { id: true, challengeId: true, status: true, score: true },
        })
      : [];
    const playedBy = new Map(played.map((s) => [s.challengeId, s]));
    return visible.map((c) => {
      const mine = playedBy.get(c.id);
      return {
        id: c.id,
        type: c.type,
        title: c.title,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        game: { slug: c.game.slug, name: c.game.name, estMinutes: c.game.estMinutes },
        difficulty: c.preset.label,
        mySession: mine ? { id: mine.id, status: mine.status, score: mine.score } : null,
      };
    });
  }
}

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Public()
  @Get('today')
  today(@CurrentUser() user?: User) {
    return this.challenges.active(user);
  }
}

@Module({ imports: [GamesModule], providers: [ChallengesService], controllers: [ChallengesController] })
export class ChallengesModule {}
