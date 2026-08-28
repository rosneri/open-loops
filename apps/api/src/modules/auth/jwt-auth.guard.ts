import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.service.js';
import { PUBLIC_ROUTE } from './public.decorator.js';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Registered globally, so a route is protected the moment it is written rather than the moment
 * someone remembers to guard it. Anything genuinely open has to say `@Public()`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  public constructor(private readonly reflector: Reflector) {
    super();
  }

  public override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return (await super.canActivate(context)) === true;

    // Public, but still worth resolving: a handler can then tell a signed-in caller from a
    // stranger without repeating the work, and an absent or stale cookie is simply anonymous.
    try {
      await super.canActivate(context);
    } catch {
      /* anonymous is a valid outcome on a public route */
    }
    return true;
  }
}
