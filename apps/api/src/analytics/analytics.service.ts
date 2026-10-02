import { BadRequestException, Body, Controller, Global, Injectable, Logger, Module, Post } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser, Public } from '../common/decorators';
import { RateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';

/** Events the browser may record. Server-side events (game_start, game_complete…) are emitted directly. */
const CLIENT_EVENTS = new Set(['page_view', 'share_click', 'share_open', 'challenge_accept']);

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: analytics must never break gameplay. */
  track(name: string, userId: string | null, props?: Prisma.InputJsonObject) {
    this.prisma.analyticsEvent
      .create({ data: { name, userId, props } })
      .catch((err) => this.logger.warn(`Failed to record ${name}: ${err}`));
  }
}

class TrackEventDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}

@Controller('events')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @RateLimit({ key: 'events', limit: 120, windowSeconds: 60 })
  @Post()
  track(@Body() dto: TrackEventDto, @CurrentUser() user?: User) {
    if (!CLIENT_EVENTS.has(dto.name)) throw new BadRequestException(`Unknown event "${dto.name}"`);
    this.analytics.track(dto.name, user?.id ?? null, dto.props as Prisma.InputJsonObject);
    return { ok: true };
  }
}

@Global()
@Module({ providers: [AnalyticsService], controllers: [AnalyticsController], exports: [AnalyticsService] })
export class AnalyticsModule {}
