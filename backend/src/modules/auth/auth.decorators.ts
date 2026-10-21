import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../common/interfaces/auth.interface';

export const IS_PUBLIC = 'isPublic';

/** Marks a route as reachable without a token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/** Injects the authenticated user (set by AuthGuard). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.user) throw new Error('CurrentUser used on an unauthenticated route');
  return req.user;
});
