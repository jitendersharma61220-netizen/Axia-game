import { Controller, Get, Injectable, Module, NotFoundException, Param } from '@nestjs/common';
import { GameStatus, Role, type DifficultyPreset, type Game, type User } from '@prisma/client';
import { getTemplate } from '@axia/engine';
import { dayKey } from '../common/time';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type GameWithPresets = Game & { presets: DifficultyPreset[] };

const CACHE_KEY = 'cache:games:v1';
const CACHE_TTL_S = 300;

/**
 * Read side for game configuration. Everything is cached in Redis and the
 * admin module invalidates the cache on every write, so admin edits take
 * effect on the very next request without a redeploy or restart.
 */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async all(): Promise<GameWithPresets[]> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) return reviveGames(JSON.parse(cached));
    const games = await this.prisma.game.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { presets: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } },
    });
    await this.redis.set(CACHE_KEY, JSON.stringify(games), 'EX', CACHE_TTL_S);
    return games;
  }

  async invalidate() {
    await this.redis.del(CACHE_KEY);
  }

  async bySlug(slug: string): Promise<GameWithPresets | undefined> {
    return (await this.all()).find((g) => g.slug === slug);
  }

  isAvailable(game: Game, now = new Date()) {
    if (game.status !== GameStatus.LIVE) return false;
    if (game.availableFrom && now < game.availableFrom) return false;
    if (game.availableTo && now >= game.availableTo) return false;
    return true;
  }

  /** Whether a user may see/play the game. Admins can test DRAFT games. */
  isPlayableBy(game: Game, user?: User) {
    if (user?.role === Role.ADMIN && game.status !== GameStatus.DISABLED) return true;
    if (!this.isAvailable(game)) return false;
    return !user?.ageMode || game.ageModes.includes(user.ageMode);
  }

  attemptsKey(userId: string, gameId: string) {
    return `attempts:${userId}:${gameId}:${dayKey()}`;
  }

  async attemptsUsed(userId: string, gameId: string) {
    return Number((await this.redis.get(this.attemptsKey(userId, gameId))) ?? 0);
  }

  async toPublic(game: GameWithPresets, user?: User) {
    return {
      slug: game.slug,
      name: game.name,
      description: game.description,
      templateKey: game.templateKey,
      howToPlay: getTemplate(game.templateKey)?.howToPlay ?? [],
      estMinutes: game.estMinutes,
      attemptsPerDay: game.attemptsPerDay,
      attemptsLeft: user ? Math.max(0, game.attemptsPerDay - (await this.attemptsUsed(user.id, game.id))) : null,
      status: game.status,
      presets: game.presets.map((p) => ({ key: p.key, label: p.label, isDefault: p.isDefault })),
    };
  }
}

function reviveGames(raw: GameWithPresets[]): GameWithPresets[] {
  const d = (v: unknown) => (v ? new Date(v as string) : null);
  return raw.map((g) => ({
    ...g,
    availableFrom: d(g.availableFrom),
    availableTo: d(g.availableTo),
    createdAt: new Date(g.createdAt),
    updatedAt: new Date(g.updatedAt),
    presets: g.presets.map((p) => ({ ...p, createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt) })),
  }));
}

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Public()
  @Get()
  async list(@CurrentUser() user?: User) {
    const games = (await this.games.all()).filter((g) => this.games.isPlayableBy(g, user));
    return Promise.all(games.map((g) => this.games.toPublic(g, user)));
  }

  @Public()
  @Get(':slug')
  async get(@Param('slug') slug: string, @CurrentUser() user?: User) {
    const game = await this.games.bySlug(slug);
    if (!game || !this.games.isPlayableBy(game, user)) throw new NotFoundException('Game not found');
    return this.games.toPublic(game, user);
  }
}


@Module({ providers: [GamesService], controllers: [GamesController], exports: [GamesService] })
export class GamesModule {}
