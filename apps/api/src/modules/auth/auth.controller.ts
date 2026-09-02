import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { signupEnabled, type AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { AuthService } from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './cookie.js';
import { CredentialThrottleGuard } from './credential-throttle.guard.js';
import { registrationSchema } from './registration.js';
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
  // Ahead of the local strategy on purpose: a rejected request should cost the server nothing,
  // and the strategy's first act is a bcrypt comparison.
  @UseGuards(CredentialThrottleGuard, AuthGuard('local'))
  @Throttle({ credentials: { ttl: 60_000, limit: 10 } })
  @Post('login')
  public async login(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const user = this.require(request);
    setSessionCookie(response, { token: await this.auth.issue(user), config: this.config });
    return user;
  }

  /**
   * Whether this deployment has a registration route, so the sign-in screen can offer it or
   * stay a login. Public and anonymous by necessity — the form has to know before anyone signs
   * in — and it says only that the door exists, never what the code is.
   */
  @Public()
  @Get('registration')
  public registration(): { enabled: boolean } {
    return { enabled: signupEnabled(this.config) };
  }

  /**
   * Signing up signs you in: the alternative is a screen that congratulates you and then asks
   * for the password you typed a second ago. The session comes back the same way login's does,
   * in the cookie and never in the body.
   */
  @Public()
  @UseGuards(CredentialThrottleGuard)
  // Tighter than login, and over a longer window: a person creates an account roughly once,
  // so anything above this is someone working through the invite codes rather than typing one.
  @Throttle({ credentials: { ttl: 15 * 60_000, limit: 5 } })
  @Post('register')
  public async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const user = await this.auth.register(parsed.data);
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
