import { Controller, Get, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { AuthService } from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './cookie.js';
import { Public, type RequestWithUser, type AuthenticatedUser } from '@open-loops/plugin-nest';

@Controller('api/auth')
export class AuthController {
  public constructor(
    private readonly auth: AuthService,
    @Inject(Tokens.Config) private readonly config: AppConfig,
  ) {}

  /**
   * The local strategy has already checked the credentials and rejected the request if they
   * were wrong, so by the time this runs there is a user. The token goes back as a cookie and
   * never appears in the body, so no script on the page can read it and no client is tempted
   * to keep a copy of its own.
   */
  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  public async login(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const user = this.require(request);
    setSessionCookie(response, { token: await this.auth.issue(user), config: this.config });
    return user;
  }

  @Public()
  @Post('logout')
  public logout(@Res({ passthrough: true }) response: Response): { ok: true } {
    clearSessionCookie(response, this.config);
    return { ok: true };
  }

  /** How the client decides whether to render the app or the sign-in form on a cold load. */
  @Get('me')
  public me(@Req() request: RequestWithUser): AuthenticatedUser {
    return this.require(request);
  }

  /** Both callers are already behind a guard; narrowing honestly beats asserting it away. */
  private require(request: RequestWithUser): AuthenticatedUser {
    const { user } = request;
    if (user === undefined) throw new UnauthorizedException('Not signed in.');
    return user;
  }
}
