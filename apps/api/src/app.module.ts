import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { config } from './config';
import { AuthGuard } from './common/auth.guard';
import { RateLimitGuard } from './common/rate-limit';
import { PrismaModule } from './prisma/prisma.service';
import { RedisModule } from './redis/redis.service';
import { AnalyticsModule } from './analytics/analytics.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { SessionsModule } from './sessions/sessions.module';
import { ChallengesModule } from './challenges/challenges.module';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { ShareModule } from './share/share.module';
import { AdminModule } from './admin/admin.module';
import { FeedbackModule } from './feedback/feedback.module';
import { CoinsModule } from './coins/coins.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: config.jwtSecret }) }),
    PrismaModule,
    RedisModule,
    AnalyticsModule,
    AuthModule,
    UsersModule,
    GamesModule,
    SessionsModule,
    ChallengesModule,
    LeaderboardsModule,
    ShareModule,
    AdminModule,
    FeedbackModule,
    CoinsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
