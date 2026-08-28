import { Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { TickReportDto } from '@open-loops/contracts';
import type { RunTickUseCase } from '@open-loops/orchestration';
import { Tokens } from '../../tokens.js';
import { Public } from '../auth/public.decorator.js';
import { SessionOrTokenGuard } from '../auth/session-or-token.guard.js';

/**
 * Two callers: the button in the client, which has a session, and Vercel Cron, which sends
 * `Authorization: Bearer $CRON_SECRET` and has no cookie. `@Public()` waives the global guard so
 * the composite below can accept either.
 */
@Controller('api/tick')
@Public()
@UseGuards(SessionOrTokenGuard)
export class TickController {
  public constructor(@Inject(Tokens.RunTick) private readonly tick: RunTickUseCase) {}

  /** Manual heartbeat. The scheduler calls the same use case on TICK_CRON. */
  @Post()
  public async run(): Promise<TickReportDto> {
    return await this.tick.execute();
  }
}
