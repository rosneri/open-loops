import type {
  ActivityDetailDto,
  ActivityRunDto,
  ActivityRunSummaryDto,
  TickReportDto,
} from '@open-loops/contracts';
import type { PrismaClient } from '../prisma-client.js';
import { toJson } from '../mappers/primitives.js';

interface StoredRun {
  readonly report: TickReportDto;
  readonly detail: ActivityDetailDto;
}

/**
 * The run history. The report is stored as it was returned rather than spread across columns:
 * it is a record of what a particular version of the app said about a particular sweep, and
 * normalising it would mean rewriting history every time a step learns to count something new.
 *
 * Satisfies orchestration's `TickRunStore` structurally rather than by importing it: this
 * library depends on the domain and not on the use cases, and the composition root is where the
 * two are introduced. Every other repository here is bound the same way.
 */
export class PrismaTickRunStore {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
  ) {}

  public async record(run: ActivityRunDto): Promise<void> {
    await this.prisma.tickRun.create({
      data: {
        id: run.id,
        ownerId: this.ownerId,
        startedAt: new Date(run.report.startedAt),
        finishedAt: new Date(run.report.finishedAt),
        report: toJson({ report: run.report, detail: run.detail }),
        failed: run.report.failures.length > 0,
      },
    });
  }

  public async list(input: { limit: number }): Promise<readonly ActivityRunSummaryDto[]> {
    const rows = await this.prisma.tickRun.findMany({
      where: { ownerId: this.ownerId },
      orderBy: { startedAt: 'desc' },
      take: input.limit,
    });
    return rows.map((row) => {
      const { report } = row.report as unknown as StoredRun;
      return {
        id: row.id,
        startedAt: row.startedAt.getTime(),
        finishedAt: row.finishedAt.getTime(),
        failed: row.failed,
        signalsFetched: report.signalsFetched,
        loopsCreated: report.loopsCreated,
        loopsRestated: report.loopsRestated,
        loopsPruned: report.loopsPruned,
        failureCount: report.failures.length,
      };
    });
  }

  public async findById(id: string): Promise<ActivityRunDto | undefined> {
    const row = await this.prisma.tickRun.findFirst({ where: { id, ownerId: this.ownerId } });
    if (row === null) return undefined;
    const stored = row.report as unknown as StoredRun;
    return { id: row.id, report: stored.report, detail: stored.detail };
  }
}
