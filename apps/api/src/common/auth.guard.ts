import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC, ROLES } from './decorators';

/** Global guard: resolves the user from the auth cookie, then enforces @Public and @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);

    const token: string | undefined = req.cookies?.[config.authCookie];
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (user && !user.banned) req.user = user;
      } catch {
        // Invalid or expired token: treat as signed out.
      }
    }

    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Sign in required');
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException('Not allowed');
    return true;
  }
}
