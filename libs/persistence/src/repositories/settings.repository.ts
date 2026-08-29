import type { PrismaClient } from '../prisma-client.js';

/**
 * Runtime configuration, as opposed to deployment configuration. The difference that matters:
 * a person changes these from the Settings screen, so they cannot live in environment variables
 * without making every change a redeploy.
 */
export interface AppSettingsRecord {
  readonly sweepCron: string;
  readonly podcastCron: string;
  readonly podcastEnabled: boolean;
  readonly podcastLength: string;
  readonly podcastHostVoiceId?: string;
  readonly podcastGuestVoiceId?: string;
  readonly updatedAt: number;
}

/** Keys admit `undefined` so a caller can spread a partial patch without stripping keys first. */
export type AppSettingsPatch = {
  [TKey in keyof Omit<AppSettingsRecord, 'updatedAt'>]?: AppSettingsRecord[TKey] | undefined;
};

const SINGLETON = 'singleton';

export class PrismaSettingsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates the row on first read from the environment defaults, so a fresh deployment has
   * working schedules before anyone opens the Settings screen.
   *
   * Read-then-create rather than `upsert`: both schedulers ask for this at boot, and two
   * concurrent upserts of the same primary key make one of them lose on the unique constraint.
   * Losing that race is expected here, so it is caught and re-read instead of thrown.
   */
  public async get(defaults: { sweepCron: string; podcastCron: string }): Promise<AppSettingsRecord> {
    const existing = await this.prisma.appSettings.findUnique({ where: { id: SINGLETON } });
    if (existing !== null) return toRecord(existing);

    try {
      const created = await this.prisma.appSettings.create({
        data: { id: SINGLETON, sweepCron: defaults.sweepCron, podcastCron: defaults.podcastCron },
      });
      return toRecord(created);
    } catch {
      const row = await this.prisma.appSettings.findUnique({ where: { id: SINGLETON } });
      if (row === null) throw new Error('Settings row could not be created or read.');
      return toRecord(row);
    }
  }

  public async update(patch: AppSettingsPatch): Promise<AppSettingsRecord> {
    const row = await this.prisma.appSettings.update({
      where: { id: SINGLETON },
      // A key present with `undefined` means "not sent", not "set to null" — dropping those is
      // what keeps a two-field save from blanking the four fields it did not mention.
      data: compact(patch),
    });
    return toRecord(row);
  }
}

const compact = (patch: AppSettingsPatch): Record<string, unknown> =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

const toRecord = (row: {
  sweepCron: string;
  podcastCron: string;
  podcastEnabled: boolean;
  podcastLength: string;
  podcastHostVoiceId: string | null;
  podcastGuestVoiceId: string | null;
  updatedAt: Date;
}): AppSettingsRecord => ({
  sweepCron: row.sweepCron,
  podcastCron: row.podcastCron,
  podcastEnabled: row.podcastEnabled,
  podcastLength: row.podcastLength,
  ...(row.podcastHostVoiceId === null ? {} : { podcastHostVoiceId: row.podcastHostVoiceId }),
  ...(row.podcastGuestVoiceId === null ? {} : { podcastGuestVoiceId: row.podcastGuestVoiceId }),
  updatedAt: row.updatedAt.getTime(),
});
