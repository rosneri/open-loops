import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from './jwt-auth.guard.js';

/**
 * The signed-in user's id, which is also the tenancy key. A handler that takes this and asks
 * `WorkspaceFactory` for it cannot reach anyone else's data — the id never comes from a path
 * parameter or a body, so there is nothing for a caller to tamper with.
 */
export const Owner = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  const id = request.user?.id;
  if (id === undefined) throw new UnauthorizedException('Not signed in.');
  return id;
});
