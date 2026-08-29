import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CronTime } from 'cron';
import type { SettingsDto, UpdateSettingsDto } from '@open-loops/contracts';
import type { AppSettingsRecord, PrismaSettingsRepository } from '@open-loops/persistence';
import type { PodcastGenerator } from '@open-loops/podcast';
import type { AppConfig } from '../../config/env.js';
import { isLongLived } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

/**
 * The single reader of the settings row. Schedulers ask it what to run and when; the controller
 * asks it to change that. Validation lives here rather than in the controller because a bad cron
 * expression must never reach a scheduler — a `CronJob` constructed with one throws on boot.
 */
@Injectable()
export class SettingsService {
  private readonly listeners = new Set<() => void>();

  public constructor(
    @Inject(Tokens.SettingsRepository) private readonly repository: PrismaSettingsRepository,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    @Inject(Tokens.PodcastGenerator) private readonly generator: PodcastGenerator,
  ) {}

  /**
   * Deployment facts the schedulers need. Exposed here so a scheduler depends on this service
   * alone rather than on both it and the raw config.
   */
  public get timeZone(): string {
    return this.config.OPEN_LOOPS_TIMEZONE;
  }

  public get tickOnBoot(): boolean {
    return this.config.TICK_ON_BOOT;
  }

  /** False on a serverless function, where a cron job would die with the invocation. */
  public get canSchedule(): boolean {
    return isLongLived(this.config);
  }

  public async current(): Promise<AppSettingsRecord> {
    return await this.repository.get({
      sweepCron: this.config.TICK_CRON,
      podcastCron: this.config.PODCAST_CRON,
    });
  }

  public async view(): Promise<SettingsDto> {
    return this.toDto(await this.current());
  }

  public async update(patch: UpdateSettingsDto): Promise<SettingsDto> {
    if (patch.sweepCron !== undefined) assertCron(patch.sweepCron, 'sweepCron');
    if (patch.podcastCron !== undefined) assertCron(patch.podcastCron, 'podcastCron');

    // Ensures the row exists before an update that assumes it does.
    await this.current();
    const saved = await this.repository.update(patch);
    for (const listener of this.listeners) listener();
    return this.toDto(saved);
  }

  /** Schedulers subscribe so that saving a new expression takes effect without a restart. */
  public onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private toDto(record: AppSettingsRecord): SettingsDto {
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
      schedulerKind: isLongLived(this.config) ? 'IN_PROCESS' : 'PLATFORM_CRON',
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
