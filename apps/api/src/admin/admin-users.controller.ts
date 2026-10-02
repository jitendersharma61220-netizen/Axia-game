import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Query } from '@nestjs/common';
import { Prisma, Role, SessionStatus, type User } from '@prisma/client';
import { startOfDay } from '../common/time';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { UpdateUserDto } from './dto';

const PAGE_SIZE = 50;

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const today = startOfDay();
    const since = { gte: today };
    const [usersTotal, usersToday, sessionsToday, completedToday, flaggedToday, activeToday, perGame, events, flagged] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: since } }),
        this.prisma.gameSession.count({ where: { startedAt: since } }),
        this.prisma.gameSession.count({ where: { startedAt: since, status: SessionStatus.COMPLETED } }),
        this.prisma.gameSession.count({ where: { startedAt: since, status: SessionStatus.FLAGGED } }),
        this.prisma.gameSession.groupBy({ by: ['userId'], where: { startedAt: since } }),
        this.prisma.gameSession.groupBy({
          by: ['gameId', 'status'],
          where: { startedAt: since },
          _count: { _all: true },
          _avg: { score: true },
        }),
        this.prisma.analyticsEvent.groupBy({ by: ['name'], where: { createdAt: since }, _count: { _all: true } }),
        this.prisma.gameSession.findMany({
          where: { status: SessionStatus.FLAGGED },
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: { user: { select: { email: true } }, game: { select: { name: true } } },
        }),
      ]);
    const games = await this.prisma.game.findMany({ select: { id: true, name: true, slug: true } });
    const gameStats = games.map((g) => {
      const rows = perGame.filter((r) => r.gameId === g.id);
      const completed = rows.find((r) => r.status === SessionStatus.COMPLETED);
      const started = rows.reduce((n, r) => n + r._count._all, 0);
      return {
        game: g,
        started,
        completed: completed?._count._all ?? 0,
        completionRate: started ? Math.round(((completed?._count._all ?? 0) / started) * 100) : null,
        avgScore: completed?._avg.score == null ? null : Math.round(completed._avg.score),
      };
    });
    return {
      today: {
        newUsers: usersToday,
        activeUsers: activeToday.length,
        sessions: sessionsToday,
        completed: completedToday,
        flagged: flaggedToday,
      },
      usersTotal,
      games: gameStats,
      events: Object.fromEntries(events.map((e) => [e.name, e._count._all])),
      recentFlagged: flagged.map((s) => ({
        id: s.id,
        user: s.user.email,
        game: s.game.name,
        score: s.score,
        durationMs: s.durationMs,
        flags: s.fraudFlags,
        startedAt: s.startedAt,
      })),
    };
  }

  @Get('users')
  async users(@Query('q') q?: string, @Query('page') page = '1') {
    const where: Prisma.UserWhereInput | undefined = q
      ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
      : undefined;
    const p = Math.max(1, Number(page) || 1);
    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { _count: { select: { sessions: true } } },
      }),
    ]);
    return { total, page: p, pageSize: PAGE_SIZE, items };
  }

  @Patch('users/:id')
  async updateUser(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (id === actor.id) throw new BadRequestException('You cannot change your own role or ban yourself');
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    const after = await this.prisma.user.update({ where: { id }, data: dto });
    await this.audit.log(actor.id, 'update', 'user', id, pick(before), pick(after));
    return after;
  }

  @Get('audit')
  async auditLog(@Query('entity') entity?: string, @Query('page') page = '1') {
    const p = Math.max(1, Number(page) || 1);
    const where = entity ? { entity } : undefined;
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    ]);
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.actorId))] } },
      select: { id: true, email: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a.email]));
    return { total, page: p, pageSize: PAGE_SIZE, items: items.map((i) => ({ ...i, actor: byId.get(i.actorId) ?? i.actorId })) };
  }
}

function pick(u: User) {
  return { role: u.role, banned: u.banned };
}
