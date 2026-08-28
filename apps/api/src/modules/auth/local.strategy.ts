import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService, type AuthenticatedUser } from './auth.service.js';

/**
 * Username and password on the login route. Passport's default field names already match the
 * body this client sends, so there is nothing to configure.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  public constructor(private readonly auth: AuthService) {
    super();
  }

  public async validate(username: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.auth.validate({ username, password });
    if (user === undefined) throw new UnauthorizedException('Wrong username or password.');
    return user;
  }
}
