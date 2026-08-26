import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

/**
 * The agent endpoints write into the store, so they are gated even on localhost — a stray page
 * in a browser must not be able to post signals. Leaving the token unset disables the check,
 * which is the right default for a single-user machine.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  public constructor(@Inject(Tokens.Config) private readonly config: AppConfig) {}

  public canActivate(context: ExecutionContext): boolean {
    const expected = this.config.OPEN_LOOPS_AGENT_TOKEN;
    if (expected === undefined || expected.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const presented = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (presented !== expected) throw new UnauthorizedException('Bad agent token.');
    return true;
  }
}
