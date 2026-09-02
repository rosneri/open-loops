import type { PrismaClient } from '../prisma-client.js';

/**
 * Runtime configuration, as opposed to deployment configuration. The difference that matters:
 * a person changes these from the Settings screen, so they cannot live in environment variables
 * without making every change a redeploy. One row per person, because the settings are theirs.
 *
 * The row itself carries nothing but a timestamp now. Schedules are their own table keyed by a
 * registered kind, and what a plugin lets a person configure lives in that plugin's own records —
 * so a feature arriving or leaving is never a column arriving or leaving here.
 */
export interface UserSettingsRecord {
  readonly userId: string;
  readonly updatedAt: number;
}

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

  /** A save happened somewhere in this person's settings; the row records when. */
  public async touch(userId: string): Promise<UserSettingsRecord> {
    await this.get(userId);
    const row = await this.prisma.userSettings.update({
      where: { userId },
      data: { updatedAt: new Date() },
    });
    return toRecord(row);
  }

  /**
   * Every account, for the process that holds the clocks. Rows are created on demand, so an
   * account that has never opened Settings is included rather than being silently skipped. The
   * username comes along because the scheduler names the account back to the API in a header,
   * and it should not need a second query to learn it.
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

const toRecord = (row: { userId: string; updatedAt: Date }): UserSettingsRecord => ({
  userId: row.userId,
  updatedAt: row.updatedAt.getTime(),
});
