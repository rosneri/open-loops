import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AgentTokenGuard } from '../agent/agent-token.guard.js';
import type { RequestWithUser } from './session.guard.js';

/**
 * For the one endpoint with two legitimate callers: the "Run check now" button in the browser,
 * which has a session, and Vercel Cron, which has a shared secret and no cookie. Requiring
 * either separately would have meant closing the button or opening the endpoint.
 *
 * The global session guard has already resolved any cookie by the time this runs, so a signed-in
 * request costs nothing extra here.
 */
@Injectable()
export class SessionOrTokenGuard implements CanActivate {
  public constructor(private readonly tokens: AgentTokenGuard) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user !== undefined) return true;

    try {
      return this.tokens.canActivate(context);
    } catch {
      throw new UnauthorizedException('Sign in, or present the agent token.');
    }
  }
}
