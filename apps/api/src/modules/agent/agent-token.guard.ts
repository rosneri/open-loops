import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { AppConfig } from '../../config/env.js';
import { isLocalMode } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

/**
 * Machine access. These endpoints are called by the local agent and by Vercel Cron, neither of
 * which can hold a login cookie, so they present a shared secret instead. Two are accepted:
 * `OPEN_LOOPS_AGENT_TOKEN` for the agent, and `CRON_SECRET` — the header Vercel Cron sends on
 * its own schedule — for the tick.
 *
 * An unset token disables the check on a single-user machine, which is the whole point of LOCAL
 * mode. A hosted deployment is reachable by anyone, so there the absence of a secret closes the
 * endpoint rather than opening it.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  public constructor(@Inject(Tokens.Config) private readonly config: AppConfig) {}

  public canActivate(context: ExecutionContext): boolean {
    const accepted = [this.config.OPEN_LOOPS_AGENT_TOKEN, this.config.CRON_SECRET].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );

    if (accepted.length === 0) {
      if (isLocalMode(this.config)) return true;
      throw new UnauthorizedException(
        'Set OPEN_LOOPS_AGENT_TOKEN or CRON_SECRET to use this endpoint in hosted mode.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const presented = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!accepted.some((expected) => matches(presented, expected))) {
      throw new UnauthorizedException('Bad agent token.');
    }
    return true;
  }
}

const matches = (presented: string, expected: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
