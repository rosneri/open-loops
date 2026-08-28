import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { AuthService, type AuthenticatedUser } from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './cookie.js';
import { Public } from './public.decorator.js';
import type { RequestWithUser } from './session.guard.js';

const credentials = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(1024),
});

@Controller('api/auth')
export class AuthController {
  public constructor(
    private readonly auth: AuthService,
    @Inject(Tokens.Config) private readonly config: AppConfig,
  ) {}

  /**
   * The token goes back as a cookie and is never included in the body, so no script on the page
   * can read it and no client is tempted to store a copy of its own.
   */
  @Public()
  @Post('login')
  public async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const parsed = credentials.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Username and password are required.');

    const { user, token } = await this.auth.login(parsed.data);
    setSessionCookie(response, { token, config: this.config });
    return user;
  }

  @Public()
  @Post('logout')
  public logout(@Res({ passthrough: true }) response: Response): { ok: true } {
    clearSessionCookie(response, this.config);
    return { ok: true };
  }

  /**
   * How the client decides whether to render the app or the sign-in form on a cold load. The
   * global guard has already rejected anyone without a session, so the throw below is
   * unreachable — it is here because narrowing the type honestly beats asserting it away.
   */
  @Get('me')
  public me(@Req() request: RequestWithUser): AuthenticatedUser {
    const { user } = request;
    if (user === undefined) throw new UnauthorizedException('Not signed in.');
    return user;
  }
}
