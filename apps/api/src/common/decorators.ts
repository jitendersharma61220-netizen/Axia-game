import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role, User } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
/** Route works without a signed-in user (the user is still attached if present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User | undefined => {
  return ctx.switchToHttp().getRequest().user;
});
