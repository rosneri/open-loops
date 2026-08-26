import { Controller, Inject, Post } from '@nestjs/common';
import type { TickReportDto } from '@open-loops/contracts';
import type { RunTickUseCase } from '@open-loops/orchestration';
import { Tokens } from '../../tokens.js';

@Controller('api/tick')
export class TickController {
  public constructor(@Inject(Tokens.RunTick) private readonly tick: RunTickUseCase) {}

  /** Manual heartbeat. The scheduler calls the same use case on TICK_CRON. */
  @Post()
  public async run(): Promise<TickReportDto> {
    return await this.tick.execute();
  }
}
