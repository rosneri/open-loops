import type { PrismaClient } from '../prisma-client.js';

/**
 * Runtime configuration, as opposed to deployment configuration. The difference that matters:
 * a person changes these from the Settings screen, so they cannot live in environment variables
 * without making every change a redeploy. One row per person, because the schedule is theirs.
 */
export interface UserSettingsRecord {
  readonly userId: string;
  readonly podcastLength: string;
  readonly podcastHostVoiceId?: string;
  readonly podcastGuestVoiceId?: string;
  readonly updatedAt: number;
}

/** Keys admit `undefined` so a caller can spread a partial patch without stripping keys first. */
export type UserSettingsPatch = {
  [TKey in keyof Omit<UserSettingsRecord, 'userId' | 'updatedAt'>]?:
    | UserSettingsRecord[TKey]
    | undefined;
};

export class PrismaSettingsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates the row on first read, so a caller never has to check whether it exists.
   *
   * Read-then-create rather than `upsert`: both schedulers ask for this at once, and two
   * concurrent upserts of the same key make one of them lose on the unique constraint. Losing
   * that race is expected here, so it is caught and re-read instead of thrown.
   */
  public async get(userId: string): Promise<UserSettingsRecord> {
    const existing = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (existing !== null) return toRecord(existing);

    try {
      const created = await this.prisma.userSettings.create({ data: { userId } });
      return toRecord(created);
    } catch {
      const row = await this.prisma.userSettings.findUnique({ where: { userId } });
      if (row === null) throw new Error(`Settings for ${userId} could not be created or read.`);
      return toRecord(row);
    }
  }

  public async update(userId: string, patch: UserSettingsPatch): Promise<UserSettingsRecord> {
    const row = await this.prisma.userSettings.update({
      where: { userId },
      // A key present with `undefined` means "not sent", not "set to null" — dropping those is
      // what keeps a two-field save from blanking the four fields it did not mention.
      data: compact(patch),
    });
    return toRecord(row);
  }

  /**
   * Every account with its schedule, for the process that holds the clocks. Rows are created on
   * demand, so an account that has never opened Settings is included with the defaults rather
   * than being silently skipped. The username comes along because the scheduler names the
   * account back to the API in a header, and it should not need a second query to learn it.
   */
  public async listAll(): Promise<readonly (UserSettingsRecord & { username: string })[]> {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { createdAt: 'asc' },
    });

    const settings: (UserSettingsRecord & { username: string })[] = [];
    for (const user of users) {
      settings.push({ ...(await this.get(user.id)), username: user.username });
    }
    return settings;
  }
}

const compact = (patch: UserSettingsPatch): Record<string, unknown> =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

const toRecord = (row: {
  userId: string;
  podcastLength: string;
  podcastHostVoiceId: string | null;
  podcastGuestVoiceId: string | null;
  updatedAt: Date;
}): UserSettingsRecord => ({
  userId: row.userId,
  podcastLength: row.podcastLength,
  ...(row.podcastHostVoiceId === null ? {} : { podcastHostVoiceId: row.podcastHostVoiceId }),
  ...(row.podcastGuestVoiceId === null ? {} : { podcastGuestVoiceId: row.podcastGuestVoiceId }),
  updatedAt: row.updatedAt.getTime(),
});
