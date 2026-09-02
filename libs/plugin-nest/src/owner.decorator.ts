import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from './request.js';

/**
 * The signed-in user's id, which is also the tenancy key. A handler that takes this and asks
 * for a workspace or a scope by it cannot reach anyone else's data — the id never comes from a
 * path parameter or a body, so there is nothing for a caller to tamper with.
 */
export const Owner = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  const id = request.user?.id;
  if (id === undefined) throw new UnauthorizedException('Not signed in.');
  return id;
});
