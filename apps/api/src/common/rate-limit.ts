import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { config } from '../config';
import { RedisService } from '../redis/redis.service';

export const RATE_LIMIT = 'rateLimit';

export interface RateLimitOptions {
  /** Bucket name, so different routes don't share a counter. */
  key: string;
  limit: number;
  windowSeconds: number;
}

/** Fixed-window limit per client IP, e.g. @RateLimit({ key: 'auth', limit: 20, windowSeconds: 60 }). */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT, opts);

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);
    if (!opts) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (config.rateLimitAllowlist.has(clientIp(req))) return true;
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `rl:${opts.key}:${clientIp(req)}:${window}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, opts.windowSeconds);
    if (count > opts.limit) {
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
