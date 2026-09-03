import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CronTime } from 'cron';
import type { ScheduleDto, SettingsDto, UpdateSettingsDto } from '@open-loops/contracts';
import type {
  PrismaScheduleRepository,
  PrismaSettingsRepository,
  UserSettingsRecord,
} from '@open-loops/persistence';
import { SchedulesService } from './schedules.service.js';
import type { PluginSettingsStore } from './plugin-settings.store.js';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

/**
 * The single reader of a person's runtime configuration. Schedulers ask it what to run and when;
 * the screen asks it to change that. Validation lives here rather than in the controller because
 * a bad cron expression must never reach a scheduler — a `CronJob` constructed with one throws
 * on boot, which would stop that account's clock entirely.
 */
@Injectable()
export class SettingsService {
  public constructor(
    @Inject(Tokens.SettingsStores) private readonly stores: SettingsStores,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    private readonly kinds: SchedulesService,
  ) {}

  private get repository(): PrismaSettingsRepository {
    return this.stores.settings;
  }

  private get schedulesRepo(): PrismaScheduleRepository {
    return this.stores.schedules;
  }

  public get timeZone(): string {
    return this.config.OPEN_LOOPS_TIMEZONE;
  }

  public async current(userId: string): Promise<UserSettingsRecord> {
    return await this.repository.get(userId);
  }

  /**
   * Every account's schedules, for the process that holds the clocks. Addresses rather than ids,
   * because the scheduler turns round and names the account back to the API in a header.
   */
  public async allSchedules(): Promise<readonly AccountSchedules[]> {
    const users = await this.repository.listAll();
    const all: AccountSchedules[] = [];
    for (const user of users) {
      all.push({
        email: user.email,
        timeZone: this.timeZone,
        schedules: await this.schedules(user.userId),
      });
    }
    return all;
  }

  public async schedules(userId: string): Promise<readonly ScheduleDto[]> {
    const kinds = this.kinds.kinds(userId);
    const saved = await this.schedulesRepo.forOwner(
      userId,
      kinds.map((kind) => ({
        kind: kind.kind,
        cron: kind.defaultCron,
        enabled: kind.enabledByDefault,
      })),
    );
    const byKind = new Map(saved.map((entry) => [entry.kind, entry]));

    return kinds.map((kind) => {
      const available = kind.available();
      return {
        kind: kind.kind,
        label: kind.label,
        description: kind.description,
        cron: byKind.get(kind.kind)?.cron ?? kind.defaultCron,
        // Unavailable work is never scheduled, whatever the row says: a podcast with nowhere to
        // write would fail every night and fill the log with the same error.
        enabled: available && (byKind.get(kind.kind)?.enabled ?? kind.enabledByDefault),
        available,
      };
    });
  }

  public async view(userId: string): Promise<StoredSettings> {
    return await this.toDto(userId, await this.current(userId));
  }

  public async update(userId: string, patch: UpdateSettingsDto): Promise<StoredSettings> {
    for (const entry of patch.schedules ?? []) {
      if (entry.cron !== undefined) assertCron(entry.cron, entry.kind);
    }

    await this.saveSchedules(userId, patch);
    await this.stores.plugins.save(userId, patch.plugins ?? []);

    // No in-process listener to notify: the scheduler lives in its own process and re-reads
    // every schedule on a short poll, so a save is picked up without anything to wire here.
    return await this.toDto(userId, await this.repository.touch(userId));
  }

  private async saveSchedules(userId: string, patch: UpdateSettingsDto): Promise<void> {
    if (patch.schedules === undefined) return;
    const known = new Map((await this.schedules(userId)).map((entry) => [entry.kind, entry]));

    for (const entry of patch.schedules) {
      const existing = known.get(entry.kind);
      // A kind nothing registered is silently skipped rather than stored: a row for a plugin
      // that is not installed would come back to life the day somebody installs a different one.
      if (existing === undefined) continue;
      await this.schedulesRepo.save({
        ownerId: userId,
        kind: entry.kind,
        cron: entry.cron ?? existing.cron,
        enabled: entry.enabled ?? existing.enabled,
      });
    }
  }

  private async toDto(userId: string, record: UserSettingsRecord): Promise<StoredSettings> {
    return {
      schedules: await this.schedules(userId),
      plugins: await this.stores.plugins.view(userId),
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
      // A serverless deployment has no long-lived process to hold a cron job, so a schedule
      // there is only as precise as the platform's own cron. Saying so is what stops the
      // Settings screen from promising a five-minute sweep it cannot deliver.
      schedulerKind: 'EXTERNAL',
      updatedAt: record.updatedAt,
    };
  }
}

/** The three places a person's runtime configuration lives in, injected as one thing. */
export interface SettingsStores {
  readonly settings: PrismaSettingsRepository;
  readonly schedules: PrismaScheduleRepository;
  readonly plugins: PluginSettingsStore;
}

export interface AccountSchedules {
  readonly email: string;
  readonly timeZone: string;
  readonly schedules: readonly ScheduleDto[];
}

/**
 * The settings row knows nothing about handles — they are who the account *is*, not something
 * it configured — so the one place they meet is the controller that answers the screen.
 */
export type StoredSettings = Omit<SettingsDto, 'handles'>;

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
