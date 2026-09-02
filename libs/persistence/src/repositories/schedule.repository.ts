import type { PrismaClient } from '../prisma-client.js';

/** One kind of scheduled work for one account, as the user configured it. */
export interface ScheduleRecord {
  readonly kind: string;
  readonly cron: string;
  readonly enabled: boolean;
}

export interface ScheduleDefaults {
  readonly kind: string;
  readonly cron: string;
  readonly enabled: boolean;
}

/**
 * Schedules used to be two columns named after the two things the app happened to do. They are
 * rows now, keyed by a kind that something registered — so the third kind of scheduled work is a
 * registration rather than a migration, a DTO field and a branch in the scheduler.
 *
 * Rows are created on demand from the registered defaults, so an account that has never opened
 * Settings still has working schedules.
 */
export class PrismaScheduleRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async forOwner(
    ownerId: string,
    defaults: readonly ScheduleDefaults[],
  ): Promise<readonly ScheduleRecord[]> {
    const rows = await this.prisma.scheduleEntry.findMany({ where: { ownerId } });
    const saved = new Map(rows.map((row) => [row.kind, row]));

    // Driven by the defaults rather than by the rows: a kind whose plugin was removed should
    // stop being scheduled, and its row should not resurrect it.
    return defaults.map((entry) => {
      const row = saved.get(entry.kind);
      return {
        kind: entry.kind,
        cron: row?.cron ?? entry.cron,
        enabled: row?.enabled ?? entry.enabled,
      };
    });
  }

  public async save(input: {
    ownerId: string;
    kind: string;
    cron: string;
    enabled: boolean;
  }): Promise<void> {
    const { ownerId, kind, cron, enabled } = input;
    await this.prisma.scheduleEntry.upsert({
      where: { ownerId_kind: { ownerId, kind } },
      create: { ownerId, kind, cron, enabled },
      update: { cron, enabled },
    });
  }

  /**
   * Every account with its schedules, for the process that holds the clocks. The username comes
   * along because the scheduler names the account back to the API in a header, and it should not
   * need a second query to learn it.
   */
  public async listAll(
    defaults: readonly ScheduleDefaults[],
  ): Promise<readonly { username: string; schedules: readonly ScheduleRecord[] }[]> {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { createdAt: 'asc' },
    });

    const all: { username: string; schedules: readonly ScheduleRecord[] }[] = [];
    for (const user of users) {
      all.push({ username: user.username, schedules: await this.forOwner(user.id, defaults) });
    }
    return all;
  }
}
