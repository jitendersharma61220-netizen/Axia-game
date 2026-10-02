import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    super(config.redisUrl, { maxRetriesPerRequest: 3 });
  }

  async onModuleDestroy() {
    await this.quit();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
