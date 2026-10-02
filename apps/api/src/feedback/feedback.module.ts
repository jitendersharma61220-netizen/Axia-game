import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { RateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

class FeedbackDto {
  @IsString() @MinLength(2) @MaxLength(2000)
  message: string;

  @IsString() @MaxLength(200)
  page: string;

  @IsOptional() @IsInt() @Min(1) @Max(5)
  rating?: number;
}

const PAGE_SIZE = 50;

@Controller()
export class FeedbackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Beta feedback from any page. Signed-in users are attached automatically. */
  @Public()
  @RateLimit({ key: 'feedback', limit: 5, windowSeconds: 600 })
  @Post('feedback')
  async create(@Body() dto: FeedbackDto, @CurrentUser() user?: User) {
    const row = await this.prisma.feedback.create({
      data: { message: dto.message.trim(), page: dto.page, rating: dto.rating, userId: user?.id },
    });
    this.analytics.track('feedback', user?.id ?? null, { rating: dto.rating ?? null, page: dto.page });
    return { ok: true, id: row.id };
  }

  @Roles(Role.ADMIN)
  @Get('admin/feedback')
  async list(@Query('page') page = '1') {
    const p = Math.max(1, Number(page) || 1);
    const [total, items, avg] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: { email: true, name: true } } },
      }),
      this.prisma.feedback.aggregate({ _avg: { rating: true }, _count: { rating: true } }),
    ]);
    return {
      total,
      page: p,
      pageSize: PAGE_SIZE,
      averageRating: avg._avg.rating === null ? null : Math.round(avg._avg.rating * 10) / 10,
      ratings: avg._count.rating,
      items,
    };
  }
}

@Module({ controllers: [FeedbackController] })
export class FeedbackModule {}
