import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service.js';
import { type AuthenticatedUser } from '@open-loops/plugin-nest';

/**
 * Email address and password on the login route. Passport calls the first field `username`
 * whatever it holds, so the field name is configured here rather than the body being bent to
 * suit it — the client sends `email`, which is what the account actually is.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  public constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email' });
  }

  public async validate(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.auth.validate({ email, password });
    if (user === undefined) throw new UnauthorizedException('Wrong email or password.');
    return user;
  }
}
