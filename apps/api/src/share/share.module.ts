import { Controller, Get, Module, NotFoundException, Param } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Public data behind a "Jitender scored 92. Can you beat them?" challenge link. */
@Controller('share')
export class ShareController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':sessionId')
  async get(@Param('sessionId') sessionId: string) {
    const s = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { name: true } },
        game: { select: { slug: true, name: true, description: true, estMinutes: true } },
        preset: { select: { key: true, label: true } },
        challenge: { select: { id: true, title: true, endsAt: true } },
      },
    });
    if (!s || s.status !== SessionStatus.COMPLETED) throw new NotFoundException('Score not found');
    const now = new Date();
    return {
      player: s.user.name.trim().split(/\s+/)[0],
      score: s.score,
      maxScore: s.maxScore,
      game: s.game,
      difficulty: s.preset,
      challenge: s.challenge && s.challenge.endsAt > now ? { id: s.challenge.id, title: s.challenge.title } : null,
      playedAt: s.completedAt,
    };
  }
}

@Module({ controllers: [ShareController] })
export class ShareModule {}
