import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CronTime } from 'cron';
import type { SettingsDto, UpdateSettingsDto } from '@open-loops/contracts';
import type { PrismaSettingsRepository, UserSettingsRecord } from '@open-loops/persistence';
import type { ScheduleDto } from './schedules.controller.js';
import type { PodcastGenerator } from '@open-loops/podcast';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

/**
 * The single reader of the settings row. Schedulers ask it what to run and when; the controller
 * asks it to change that. Validation lives here rather than in the controller because a bad cron
 * expression must never reach a scheduler — a `CronJob` constructed with one throws on boot.
 */
@Injectable()
export class SettingsService {
  public constructor(
    @Inject(Tokens.SettingsRepository) private readonly repository: PrismaSettingsRepository,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    @Inject(Tokens.PodcastGenerator) private readonly generator: PodcastGenerator,
  ) {}

  public get timeZone(): string {
    return this.config.OPEN_LOOPS_TIMEZONE;
  }

  public async current(userId: string): Promise<UserSettingsRecord> {
    return await this.repository.get(userId, this.defaults);
  }

  /**
   * Every account's schedule, for the process that holds the clocks. Usernames rather than ids,
   * because the scheduler turns round and names the account back to the API in a header.
   */
  public async schedules(): Promise<readonly ScheduleDto[]> {
    const rows = await this.repository.listAll(this.defaults);
    return rows.map((row) => ({
      username: row.username,
      sweepCron: row.sweepCron,
      podcastCron: row.podcastCron,
      podcastEnabled: row.podcastEnabled,
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
    }));
  }

  private get defaults(): { sweepCron: string; podcastCron: string } {
    return { sweepCron: this.config.TICK_CRON, podcastCron: this.config.PODCAST_CRON };
  }

  public async view(userId: string): Promise<SettingsDto> {
    return this.toDto(await this.current(userId));
  }

  public async update(userId: string, patch: UpdateSettingsDto): Promise<SettingsDto> {
    if (patch.sweepCron !== undefined) assertCron(patch.sweepCron, 'sweepCron');
    if (patch.podcastCron !== undefined) assertCron(patch.podcastCron, 'podcastCron');

    // Ensures the row exists before an update that assumes it does.
    await this.current(userId);
    // No in-process listener to notify: the scheduler lives in its own process and re-reads
    // every schedule on a short poll, so a save is picked up without anything to wire here.
    return this.toDto(await this.repository.update(userId, patch));
  }

  private toDto(record: UserSettingsRecord): SettingsDto {
    return {
      sweepCron: record.sweepCron,
      podcastCron: record.podcastCron,
      podcastEnabled: record.podcastEnabled,
      podcastLength: record.podcastLength as SettingsDto['podcastLength'],
      ...(record.podcastHostVoiceId === undefined
        ? {}
        : { podcastHostVoiceId: record.podcastHostVoiceId }),
      ...(record.podcastGuestVoiceId === undefined
        ? {}
        : { podcastGuestVoiceId: record.podcastGuestVoiceId }),
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
      // A serverless deployment has no long-lived process to hold a cron job, so a schedule
      // there is only as precise as the platform's own cron. Saying so is what stops the
      // Settings screen from promising a five-minute sweep it cannot deliver.
      schedulerKind: 'EXTERNAL',
      podcastConfigured: this.generator.isConfigured(),
      updatedAt: record.updatedAt,
    };
  }
}

/**
 * `cron`'s own parser, so the app and the scheduler agree on exactly which expressions are
 * valid — a regular expression here would eventually disagree with the library.
 */
const assertCron = (expression: string, field: string): void => {
  try {
    // Constructing it is the validation; the instance is discarded.
    void new CronTime(expression);
  } catch {
    throw new BadRequestException(`${field} is not a valid cron expression: "${expression}".`);
  }
};
