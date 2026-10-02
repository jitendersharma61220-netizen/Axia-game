import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { AdminChallengesController } from './admin-challenges.controller';
import { AdminGamesController } from './admin-games.controller';
import { AdminUsersController } from './admin-users.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [GamesModule],
  providers: [AuditService],
  controllers: [AdminGamesController, AdminChallengesController, AdminUsersController],
})
export class AdminModule {}
