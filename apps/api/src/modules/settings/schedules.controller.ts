import { Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { ScheduleDto } from '@open-loops/contracts';
import { AgentTokenGuard } from '../agent/agent-token.guard.js';
import { OwnerResolver } from '../auth/owner-resolver.service.js';
import { SettingsService } from './settings.service.js';
import { SchedulesService } from './schedules.service.js';
import { Public } from '@open-loops/plugin-nest';

const USER_HEADER = 'x-open-loops-user';

export interface AccountSchedulesDto {
  /** The account's sign-in address, which is also what it is named back to in the header. */
  readonly email: string;
  readonly timeZone: string;
  readonly schedules: readonly ScheduleDto[];
}

/**
 * What the external scheduler asks for, and how it calls back. Listing spans accounts — the only
 * endpoint that does — which is why the whole controller is behind the shared secret rather than
 * a session: no signed-in person should be able to enumerate everyone else's schedule.
 *
 * The scheduler used to know the names of the two things this app does and have a method for
 * each. It runs `kind` now and knows nothing about what that kind is, so a plugin that registers
 * a third kind of work is scheduled by a process that was never redeployed.
 */
@Controller('api/schedules')
@Public()
@UseGuards(AgentTokenGuard)
export class SchedulesController {
  public constructor(
    private readonly settings: SettingsService,
    private readonly schedules: SchedulesService,
    private readonly owners: OwnerResolver,
  ) {}

  @Get()
  public async list(): Promise<readonly AccountSchedulesDto[]> {
    return await this.settings.allSchedules();
  }

  @Post(':kind/run')
  @HttpCode(202)
  public async run(
    @Param('kind') kind: string,
    @Headers(USER_HEADER) email: string | undefined,
  ): Promise<{ ran: string }> {
    await this.schedules.run(await this.owners.resolve(email), kind);
    return { ran: kind };
  }
}
