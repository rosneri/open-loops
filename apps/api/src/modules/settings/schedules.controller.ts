import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentTokenGuard } from '../agent/agent-token.guard.js';
import { Public } from '../auth/public.decorator.js';
import { SettingsService } from './settings.service.js';

export interface ScheduleDto {
  readonly username: string;
  readonly sweepCron: string;
  readonly podcastCron: string;
  readonly podcastEnabled: boolean;
  readonly timeZone: string;
}

/**
 * What the scheduler asks for: every account and when it wants things to happen. It is the only
 * endpoint that reads across accounts, which is why it is behind the shared secret rather than a
 * session — no signed-in person should be able to enumerate everyone else's schedule.
 */
@Controller('api/schedules')
@Public()
@UseGuards(AgentTokenGuard)
export class SchedulesController {
  public constructor(private readonly settings: SettingsService) {}

  @Get()
  public async list(): Promise<readonly ScheduleDto[]> {
    return await this.settings.schedules();
  }
}
