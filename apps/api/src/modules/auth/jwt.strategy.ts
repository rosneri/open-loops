import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { PrismaUserRepository } from '@open-loops/persistence';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { SESSION_COOKIE } from './cookie.js';
import { type AuthenticatedUser } from '@open-loops/plugin-nest';

/** What we put in the token. `ver` is the row's `tokenVersion` at the time it was issued. */
export interface SessionPayload {
  readonly sub: string;
  readonly username: string;
  readonly ver: number;
}

/**
 * The token arrives in a cookie rather than an `Authorization` header, so the extractor is a
 * custom one — `fromAuthHeaderAsBearerToken` would never find it. Signature, expiry and shape
 * are Passport's problem; the only thing left to check here is that the session has not been
 * revoked since it was issued.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  public constructor(
    @Inject(Tokens.Config) config: AppConfig,
    @Inject(Tokens.UserRepository) private readonly users: PrismaUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromSessionCookie]),
      ignoreExpiration: false,
      secretOrKey: config.AUTH_JWT_SECRET,
    });
  }

  public async validate(payload: SessionPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub);
    // A password change bumps `tokenVersion`, which is what makes it end every existing session.
    if (user?.tokenVersion !== payload.ver) throw new UnauthorizedException('Session expired.');
    return { id: user.id, username: user.username };
  }
}

/** `cookie-parser` types the jar as `any`, so the value is narrowed before it is trusted. */
const fromSessionCookie = (request: Request): string | null => {
  const value: unknown = request.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' ? value : null;
};
