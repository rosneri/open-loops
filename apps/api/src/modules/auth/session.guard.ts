import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, type AuthenticatedUser } from './auth.service.js';
import { readSessionCookie } from './cookie.js';
import { PUBLIC_ROUTE } from './public.decorator.js';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Registered globally, so a new controller is protected the moment it is written rather than
 * the moment someone remembers to guard it. Anything genuinely open has to say `@Public()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  public constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readSessionCookie(request);

    // Resolved even on a public route, so a handler can tell a signed-in caller from a stranger
    // without every one of them repeating the cookie dance. Only enforcement is conditional.
    if (token !== undefined) {
      const user = await this.auth.authenticate(token);
      if (user !== undefined) request.user = user;
    }

    if (isPublic) return true;
    if (token === undefined) throw new UnauthorizedException('Not signed in.');
    if (request.user === undefined) throw new UnauthorizedException('Session expired.');
    return true;
  }
}
