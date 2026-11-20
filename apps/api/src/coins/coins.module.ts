import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AgeMode, CoinReason, Prisma, PurchaseStatus, Role, type User } from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, NotEquals } from 'class-validator';
import { config } from '../config';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { RateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuditService } from '../admin/audit.service';

/*
 * Coins are a spend-only virtual currency. They are bought (or granted by an admin)
 * and spent on extra plays and cosmetics. They are never won, never paid out, have
 * no cash value and can't be transferred. Keep it that way: paying in with an
 * expectation of winning money or prizes would make Axia an "online money game",
 * which the Online Gaming Act 2025 bans.
 */

type Db = Prisma.TransactionClient;

export class NotEnoughCoinsException extends HttpException {
  constructor(needed: number) {
    super({ code: 'NOT_ENOUGH_COINS', message: `You need ${needed} coins for this.` }, HttpStatus.PAYMENT_REQUIRED);
  }
}

@Injectable()
export class CoinsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Coins are for adults only: teens get the free experience. */
  assertCanUseCoins(user: User) {
    if (user.ageMode !== AgeMode.ADULT) {
      throw new ForbiddenException({ code: 'ADULTS_ONLY', message: 'Coins are available to players aged 19 and over.' });
    }
  }

  private inTx<T>(tx: Db | undefined, fn: (db: Db) => Promise<T>) {
    return tx ? fn(tx) : this.prisma.$transaction(fn);
  }

  /** Adds coins and records why. Returns the new balance. */
  credit(userId: string, amount: number, reason: CoinReason, ref: string | null, extra: { actorId?: string; note?: string } = {}, tx?: Db) {
    return this.inTx(tx, async (db) => {
      const u = await db.user.update({ where: { id: userId }, data: { coins: { increment: amount } }, select: { coins: true } });
      await db.coinLedger.create({ data: { userId, delta: amount, reason, ref, balanceAfter: u.coins, ...extra } });
      return u.coins;
    });
  }

  /**
   * Takes coins if the balance covers them, atomically (a conditional update, so two
   * concurrent spends can never overdraw). Returns the new balance.
   */
  debit(userId: string, amount: number, reason: CoinReason, ref: string | null, extra: { actorId?: string; note?: string } = {}, tx?: Db) {
    return this.inTx(tx, async (db) => {
      const { count } = await db.user.updateMany({ where: { id: userId, coins: { gte: amount } }, data: { coins: { decrement: amount } } });
      if (!count) throw new NotEnoughCoinsException(amount);
      const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
      await db.coinLedger.create({ data: { userId, delta: -amount, reason, ref, balanceAfter: u.coins, ...extra } });
      return u.coins;
    });
  }
}

class PurchaseDto {
  @IsString()
  packId: string;
}

class AdjustCoinsDto {
  @IsInt() @Min(-100_000) @Max(100_000) @NotEquals(0)
  delta: number;

  @IsString() @MinLength(3) @MaxLength(200)
  note: string;
}

class CreatePackDto {
  @IsString() @Matches(/^[a-z0-9-]+$/)
  key: string;

  @IsString() @MinLength(1) @MaxLength(60)
  label: string;

  @IsInt() @Min(100) @Max(10_000_000)
  pricePaise: number;

  @IsInt() @Min(1) @Max(1_000_000)
  coins: number;

  @IsOptional() @IsInt() @Min(0) @Max(1_000_000)
  bonusCoins?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}
class UpdatePackDto extends PartialType(CreatePackDto) {}

class CreateItemDto {
  @IsString() @Matches(/^[a-z0-9-]+$/)
  key: string;

  @IsString() @Matches(/^[a-z0-9-]+$/)
  gameSlug: string;

  @IsString() @MinLength(1) @MaxLength(60)
  label: string;

  @IsInt() @Min(1) @Max(1_000_000)
  priceCoins: number;

  /** Ship skin: { core, glow, trail } as 0xRRGGBB numbers. */
  @IsObject()
  data: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}
class UpdateItemDto extends PartialType(CreateItemDto) {}

const LEDGER_PAGE = 50;

@Controller()
export class ShopController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Coin packs and cosmetics. Anyone can browse; buying needs an adult account. */
  @Public()
  @Get('shop')
  async shop(@CurrentUser() user?: User) {
    const [packs, items, owned] = await Promise.all([
      this.prisma.coinPack.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { pricePaise: 'asc' }] }),
      this.prisma.shopItem.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { priceCoins: 'asc' }] }),
      user ? this.prisma.userItem.findMany({ where: { userId: user.id } }) : Promise.resolve([]),
    ]);
    const mine = new Map(owned.map((o) => [o.itemId, o]));
    return {
      balance: user?.coins ?? null,
      canBuy: user?.ageMode === AgeMode.ADULT,
      payments: { enabled: config.paymentsProvider !== 'none', testMode: config.paymentsProvider === 'dev' },
      packs: packs.map((p) => ({ id: p.id, key: p.key, label: p.label, pricePaise: p.pricePaise, coins: p.coins, bonusCoins: p.bonusCoins })),
      items: items.map((i) => ({
        key: i.key,
        kind: i.kind,
        gameSlug: i.gameSlug,
        label: i.label,
        priceCoins: i.priceCoins,
        data: i.data,
        owned: mine.has(i.id),
        equipped: mine.get(i.id)?.equipped ?? false,
      })),
    };
  }

  @RateLimit({ key: 'shop', limit: 20, windowSeconds: 60 })
  @Post('shop/purchases')
  async purchase(@CurrentUser() user: User, @Body() dto: PurchaseDto) {
    this.coins.assertCanUseCoins(user);
    if (config.paymentsProvider === 'none') {
      throw new ServiceUnavailableException({ code: 'PAYMENTS_UNAVAILABLE', message: 'Payments are coming soon.' });
    }
    const pack = await this.prisma.coinPack.findFirst({ where: { id: dto.packId, active: true } });
    if (!pack) throw new NotFoundException('Coin pack not found');
    const total = pack.coins + pack.bonusCoins;
    // Test mode: the "payment" succeeds immediately. A real gateway would create the
    // purchase as CREATED here and credit the coins from its verified callback.
    const { purchase, balance } = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          userId: user.id,
          packId: pack.id,
          amountPaise: pack.pricePaise,
          coins: total,
          provider: config.paymentsProvider,
          status: PurchaseStatus.PAID,
          paidAt: new Date(),
        },
      });
      const balance = await this.coins.credit(user.id, total, CoinReason.PURCHASE, purchase.id, {}, tx);
      return { purchase, balance };
    });
    this.analytics.track('coin_purchase', user.id, { pack: pack.key, amountPaise: pack.pricePaise, coins: total, provider: purchase.provider });
    return { purchaseId: purchase.id, status: purchase.status, coins: total, balance, testMode: purchase.provider === 'dev' };
  }

  @RateLimit({ key: 'shop', limit: 20, windowSeconds: 60 })
  @Post('shop/items/:key/buy')
  async buy(@CurrentUser() user: User, @Param('key') key: string) {
    this.coins.assertCanUseCoins(user);
    const item = await this.prisma.shopItem.findFirst({ where: { key, active: true } });
    if (!item) throw new NotFoundException('Item not found');
    const owned = await this.prisma.userItem.findUnique({ where: { userId_itemId: { userId: user.id, itemId: item.id } } });
    if (owned) return { key, owned: true, equipped: owned.equipped, balance: user.coins, charged: 0 };
    let balance: number;
    try {
      balance = await this.prisma.$transaction(async (tx) => {
        const b = await this.coins.debit(user.id, item.priceCoins, CoinReason.SKIN, item.key, {}, tx);
        await tx.userItem.updateMany({ where: { userId: user.id, item: { gameSlug: item.gameSlug } }, data: { equipped: false } });
        // Unique (userId, itemId): a double-click race fails here and rolls the charge back.
        await tx.userItem.create({ data: { userId: user.id, itemId: item.id, equipped: true } });
        return b;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_OWNED', message: 'You already own this item.' });
      }
      throw err;
    }
    this.analytics.track('item_buy', user.id, { item: item.key, coins: item.priceCoins });
    return { key, owned: true, equipped: true, balance, charged: item.priceCoins };
  }

  /** Equips an owned item, or with `default` goes back to the game's standard look. */
  @HttpCode(200)
  @Post('shop/equip/:gameSlug/:key')
  async equip(@CurrentUser() user: User, @Param('gameSlug') gameSlug: string, @Param('key') key: string) {
    const item = key === 'default' ? null : await this.prisma.shopItem.findFirst({ where: { key, gameSlug } });
    if (key !== 'default') {
      const owned = item && (await this.prisma.userItem.findUnique({ where: { userId_itemId: { userId: user.id, itemId: item.id } } }));
      if (!owned) throw new NotFoundException('You don’t own this item');
    }
    await this.prisma.$transaction([
      this.prisma.userItem.updateMany({ where: { userId: user.id, item: { gameSlug } }, data: { equipped: false } }),
      ...(item ? [this.prisma.userItem.updateMany({ where: { userId: user.id, itemId: item.id }, data: { equipped: true } })] : []),
    ]);
    return { gameSlug, equipped: item?.key ?? null };
  }

  /** The cosmetics a player has equipped for one game (purely visual). */
  @Public()
  @Get('shop/equipped/:gameSlug')
  async equipped(@Param('gameSlug') gameSlug: string, @CurrentUser() user?: User) {
    if (!user) return { items: [] };
    const rows = await this.prisma.userItem.findMany({ where: { userId: user.id, equipped: true, item: { gameSlug } }, include: { item: true } });
    return { items: rows.map((r) => ({ key: r.item.key, kind: r.item.kind, data: r.item.data })) };
  }

  @Get('me/coins')
  async ledger(@CurrentUser() user: User) {
    const rows = await this.prisma.coinLedger.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: LEDGER_PAGE });
    return {
      balance: user.coins,
      history: rows.map((r) => ({ id: r.id, delta: r.delta, reason: r.reason, ref: r.ref, balanceAfter: r.balanceAfter, createdAt: r.createdAt })),
    };
  }
}

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminShopController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly audit: AuditService,
  ) {}

  @Get('shop')
  async overview() {
    const now = Date.now();
    const since30 = new Date(now - 30 * 86_400_000);
    const sinceToday = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(new Date())}T00:00:00+05:30`);
    const paid = (since: Date, testMode: boolean) => ({
      status: PurchaseStatus.PAID,
      paidAt: { gte: since },
      provider: testMode ? 'dev' : { not: 'dev' },
    });
    const [packs, items, purchases, today, month, testMonth, buyers, spent, outstanding] = await Promise.all([
      this.prisma.coinPack.findMany({ orderBy: [{ sortOrder: 'asc' }, { pricePaise: 'asc' }], include: { _count: { select: { purchases: true } } } }),
      this.prisma.shopItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceCoins: 'asc' }], include: { _count: { select: { owners: true } } } }),
      this.prisma.purchase.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { email: true, name: true } }, pack: { select: { label: true } } },
      }),
      this.prisma.purchase.aggregate({ where: paid(sinceToday, false), _sum: { amountPaise: true }, _count: true }),
      this.prisma.purchase.aggregate({ where: paid(since30, false), _sum: { amountPaise: true }, _count: true }),
      this.prisma.purchase.aggregate({ where: paid(since30, true), _sum: { amountPaise: true }, _count: true }),
      this.prisma.purchase.findMany({ where: paid(since30, false), distinct: ['userId'], select: { userId: true } }),
      this.prisma.coinLedger.groupBy({ by: ['reason'], where: { createdAt: { gte: since30 }, delta: { lt: 0 } }, _sum: { delta: true } }),
      this.prisma.user.aggregate({ _sum: { coins: true } }),
    ]);
    return {
      stats: {
        revenueTodayPaise: today._sum.amountPaise ?? 0,
        purchasesToday: today._count,
        revenue30dPaise: month._sum.amountPaise ?? 0,
        purchases30d: month._count,
        testPurchases30d: testMonth._count,
        testRevenue30dPaise: testMonth._sum.amountPaise ?? 0,
        buyers30d: buyers.length,
        coinsSpent30d: Object.fromEntries(spent.map((s) => [s.reason, -(s._sum.delta ?? 0)])),
        coinsOutstanding: outstanding._sum.coins ?? 0,
      },
      paymentsProvider: config.paymentsProvider,
      packs: packs.map(({ _count, ...p }) => ({ ...p, sold: _count.purchases })),
      items: items.map(({ _count, ...i }) => ({ ...i, owners: _count.owners })),
      purchases: purchases.map((p) => ({
        id: p.id,
        user: p.user,
        pack: p.pack.label,
        amountPaise: p.amountPaise,
        coins: p.coins,
        provider: p.provider,
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  @Post('shop/packs')
  async createPack(@CurrentUser() actor: User, @Body() dto: CreatePackDto) {
    const pack = await this.unique(() => this.prisma.coinPack.create({ data: dto }));
    await this.audit.log(actor.id, 'create', 'coinPack', pack.id, undefined, pack);
    return pack;
  }

  @Patch('shop/packs/:id')
  async updatePack(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdatePackDto) {
    const before = await this.prisma.coinPack.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Pack not found');
    const after = await this.unique(() => this.prisma.coinPack.update({ where: { id }, data: dto }));
    await this.audit.log(actor.id, 'update', 'coinPack', id, before, after);
    return after;
  }

  @Post('shop/items')
  async createItem(@CurrentUser() actor: User, @Body() dto: CreateItemDto) {
    const item = await this.unique(() => this.prisma.shopItem.create({ data: { ...dto, data: dto.data as Prisma.InputJsonObject } }));
    await this.audit.log(actor.id, 'create', 'shopItem', item.id, undefined, item);
    return item;
  }

  @Patch('shop/items/:id')
  async updateItem(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    const before = await this.prisma.shopItem.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Item not found');
    const after = await this.unique(() =>
      this.prisma.shopItem.update({ where: { id }, data: { ...dto, data: dto.data as Prisma.InputJsonObject | undefined } }),
    );
    await this.audit.log(actor.id, 'update', 'shopItem', id, before, after);
    return after;
  }

  /** Grant (support, goodwill) or deduct (reversals) coins. Always audited and visible in the player's history. */
  @HttpCode(200)
  @Post('users/:id/coins')
  async adjust(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: AdjustCoinsDto) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const extra = { actorId: actor.id, note: dto.note };
    const balance =
      dto.delta > 0
        ? await this.coins.credit(id, dto.delta, CoinReason.ADMIN_GRANT, null, extra)
        : await this.coins.debit(id, -dto.delta, CoinReason.ADMIN_DEDUCT, null, extra);
    await this.audit.log(actor.id, dto.delta > 0 ? 'grant_coins' : 'deduct_coins', 'user', id, { coins: target.coins }, { coins: balance, note: dto.note });
    return { balance };
  }

  private async unique<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That key is already used');
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new NotFoundException();
      throw new BadRequestException((err as Error).message);
    }
  }
}

@Module({
  providers: [CoinsService, AuditService],
  controllers: [ShopController, AdminShopController],
  exports: [CoinsService],
})
export class CoinsModule {}
