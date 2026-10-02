import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { CreateChallengeDto, UpdateChallengeDto } from './dto';

@Roles(Role.ADMIN)
@Controller('admin/challenges')
export class AdminChallengesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query('gameId') gameId?: string) {
    return this.prisma.challenge.findMany({
      where: gameId ? { gameId } : undefined,
      orderBy: { startsAt: 'desc' },
      take: 100,
      include: {
        game: { select: { id: true, slug: true, name: true } },
        preset: { select: { id: true, key: true, label: true } },
        _count: { select: { sessions: true } },
      },
    });
  }

  @Post()
  async create(@CurrentUser() actor: User, @Body() dto: CreateChallengeDto) {
    await this.checkPreset(dto.gameId, dto.presetId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    checkWindow(startsAt, endsAt);
    const challenge = await this.prisma.challenge.create({
      data: { ...dto, seed: dto.seed ?? randomUUID(), startsAt, endsAt },
    });
    await this.audit.log(actor.id, 'create', 'challenge', challenge.id, undefined, challenge);
    return challenge;
  }

  @Patch(':id')
  async update(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateChallengeDto) {
    const before = await this.prisma.challenge.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Challenge not found');
    if (dto.presetId) await this.checkPreset(before.gameId, dto.presetId);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : before.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : before.endsAt;
    checkWindow(startsAt, endsAt);
    const after = await this.prisma.challenge.update({ where: { id }, data: { ...dto, startsAt, endsAt } });
    await this.audit.log(actor.id, 'update', 'challenge', id, before, after);
    return after;
  }

  @Delete(':id')
  async remove(@CurrentUser() actor: User, @Param('id') id: string) {
    const before = await this.prisma.challenge.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Challenge not found');
    await this.prisma.challenge.delete({ where: { id } });
    await this.audit.log(actor.id, 'delete', 'challenge', id, before);
    return { ok: true };
  }

  private async checkPreset(gameId: string, presetId: string) {
    const preset = await this.prisma.difficultyPreset.findUnique({ where: { id: presetId } });
    if (!preset || preset.gameId !== gameId) throw new BadRequestException('Preset does not belong to this game');
  }
}

function checkWindow(startsAt: Date, endsAt: Date) {
  if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
}

