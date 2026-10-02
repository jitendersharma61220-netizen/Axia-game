import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Prisma, Role, type User } from '@prisma/client';
import { getTemplate, listTemplates, validateParams } from '@axia/engine';
import { randomUUID } from 'node:crypto';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from '../games/games.module';
import { AuditService } from './audit.service';
import { CreateGameDto, CreatePresetDto, PreviewDto, UpdateGameDto, UpdatePresetDto } from './dto';

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminGamesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly audit: AuditService,
  ) {}

  @Get('templates')
  templates() {
    return listTemplates();
  }

  @Get('games')
  list() {
    return this.prisma.game.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { sessions: true, presets: true } } },
    });
  }

  @Get('games/:id')
  async get(@Param('id') id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: {
        presets: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] },
        challenges: { orderBy: { startsAt: 'desc' }, take: 50, include: { preset: { select: { key: true, label: true } } } },
      },
    });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  @Post('games')
  async create(@CurrentUser() actor: User, @Body() dto: CreateGameDto) {
    const template = getTemplate(dto.templateKey)!;
    const game = await this.unique(() =>
      this.prisma.game.create({
        data: {
          ...gameData(dto),
          slug: dto.slug,
          name: dto.name,
          description: dto.description,
          templateKey: dto.templateKey,
          // Every game starts with one playable preset using the template defaults.
          presets: {
            create: { key: 'normal', label: 'Normal', isDefault: true, params: template.defaultParams as Prisma.InputJsonObject },
          },
        },
        include: { presets: true },
      }),
    );
    await this.audit.log(actor.id, 'create', 'game', game.id, undefined, game);
    await this.games.invalidate();
    return game;
  }

  @Patch('games/:id')
  async update(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateGameDto) {
    const before = await this.prisma.game.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Game not found');
    const after = await this.unique(() => this.prisma.game.update({ where: { id }, data: gameData(dto) }));
    await this.audit.log(actor.id, 'update', 'game', id, before, after);
    await this.games.invalidate();
    return after;
  }

  /** Renders a level from (unsaved) params so admins can see the effect of a change before saving. */
  @Post('games/:id/preview')
  async preview(@Param('id') id: string, @Body() dto: PreviewDto) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');
    const v = validateParams(game.templateKey, dto.params ?? {});
    if (!v.ok) throw new BadRequestException({ code: 'INVALID_PARAMS', errors: v.errors });
    const template = getTemplate(game.templateKey)!;
    const seed = dto.seed ?? randomUUID();
    return {
      seed,
      params: v.params,
      timingBounds: template.timingBounds(v.params),
      level: template.toClientLevel(template.generateLevel(v.params, seed), v.params),
    };
  }

  @Post('games/:id/presets')
  async createPreset(@CurrentUser() actor: User, @Param('id') gameId: string, @Body() dto: CreatePresetDto) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    const params = this.validParams(game.templateKey, dto.params);
    const preset = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.difficultyPreset.updateMany({ where: { gameId }, data: { isDefault: false } });
      return this.unique(() =>
        tx.difficultyPreset.create({
          data: { gameId, key: dto.key, label: dto.label, params, isDefault: dto.isDefault ?? false, sortOrder: dto.sortOrder ?? 0 },
        }),
      );
    });
    await this.audit.log(actor.id, 'create', 'preset', preset.id, undefined, preset);
    await this.games.invalidate();
    return preset;
  }

  @Patch('presets/:id')
  async updatePreset(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdatePresetDto) {
    const before = await this.prisma.difficultyPreset.findUnique({ where: { id }, include: { game: true } });
    if (!before) throw new NotFoundException('Preset not found');
    const params = dto.params ? this.validParams(before.game.templateKey, dto.params) : undefined;
    const after = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.difficultyPreset.updateMany({ where: { gameId: before.gameId }, data: { isDefault: false } });
      return tx.difficultyPreset.update({
        where: { id },
        data: { label: dto.label, params, isDefault: dto.isDefault, sortOrder: dto.sortOrder },
      });
    });
    const { game: _game, ...beforePreset } = before;
    await this.audit.log(actor.id, 'update', 'preset', id, beforePreset, after);
    await this.games.invalidate();
    return after;
  }

  @Delete('presets/:id')
  async deletePreset(@CurrentUser() actor: User, @Param('id') id: string) {
    const before = await this.prisma.difficultyPreset.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Preset not found');
    if (before.isDefault) throw new ConflictException('Make another preset the default before deleting this one');
    try {
      await this.prisma.difficultyPreset.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException('Preset has been played or is used by a challenge; it cannot be deleted');
      }
      throw err;
    }
    await this.audit.log(actor.id, 'delete', 'preset', id, before);
    await this.games.invalidate();
    return { ok: true };
  }

  private validParams(templateKey: string, params: unknown): Prisma.InputJsonObject {
    const v = validateParams(templateKey, params ?? {});
    if (!v.ok) throw new BadRequestException({ code: 'INVALID_PARAMS', message: 'Invalid game parameters', errors: v.errors });
    return v.params as Prisma.InputJsonObject;
  }

  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That slug or key is already taken');
      }
      throw err;
    }
  }
}

function gameData(dto: UpdateGameDto) {
  const date = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
  return {
    slug: dto.slug,
    name: dto.name,
    description: dto.description,
    status: dto.status,
    ageModes: dto.ageModes,
    estMinutes: dto.estMinutes,
    attemptsPerDay: dto.attemptsPerDay,
    availableFrom: date(dto.availableFrom),
    availableTo: date(dto.availableTo),
    sortOrder: dto.sortOrder,
  } as const;
}
