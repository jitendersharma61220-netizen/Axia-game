import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { AdminChallengesController } from './admin-challenges.controller';
import { AdminGamesController } from './admin-games.controller';
import { AdminInvitesController } from './admin-invites.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminUsersController } from './admin-users.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [GamesModule],
  providers: [AuditService],
  controllers: [AdminGamesController, AdminChallengesController, AdminUsersController, AdminInvitesController, AdminAnalyticsController],
})
export class AdminModule {}
