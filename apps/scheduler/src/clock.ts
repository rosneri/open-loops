import { CronJob } from 'cron';
import type { Logger } from '@open-loops/kernel';
import type { ApiClient, Schedule } from './api-client.js';

interface Entry {
  readonly cron: string;
  readonly job: CronJob;
}

const key = (email: string, kind: string): string => `${email}:${kind}`;

/**
 * One cron job per account per kind of work, rebuilt whenever the schedules change. This is the
 * whole reason the process exists: a serverless deployment cannot hold a cron job, and the
 * platform's own cron is limited to one run a day — so the clock lives here, where an arbitrary
 * expression can actually be honoured, and the work still happens on the deployment.
 */
export class Clock {
  private readonly jobs = new Map<string, Entry>();
  private readonly running = new Set<string>();

  public constructor(
    private readonly api: ApiClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Reconciles the running jobs against the schedules just read. Jobs whose expression has not
   * changed are left alone, so a refresh does not reset the countdown to the next run.
   */
  public apply(schedules: readonly Schedule[]): void {
    const wanted = new Set<string>();

    for (const schedule of schedules) {
      for (const job of schedule.schedules) {
        if (!job.enabled) continue;
        const id = key(schedule.email, job.kind);
        wanted.add(id);
        this.ensure({
          id,
          cron: job.cron,
          timeZone: schedule.timeZone,
          run: async () => {
            await this.api.run({ email: schedule.email, kind: job.kind });
          },
        });
      }
    }

    // Accounts that were deleted, and anything switched off since the last refresh, stop here.
    for (const [id, entry] of this.jobs) {
      if (wanted.has(id)) continue;
      void entry.job.stop();
      this.jobs.delete(id);
      this.logger.info('schedule stopped', { id });
    }
  }

  public stopAll(): void {
    for (const entry of this.jobs.values()) void entry.job.stop();
    this.jobs.clear();
  }

  public get size(): number {
    return this.jobs.size;
  }

  private ensure(input: {
    id: string;
    cron: string;
    timeZone: string;
    run: () => Promise<void>;
  }): void {
    const existing = this.jobs.get(input.id);
    if (existing?.cron === input.cron) return;

    if (existing !== undefined) void existing.job.stop();

    try {
      const job = CronJob.from({
        cronTime: input.cron,
        timeZone: input.timeZone,
        onTick: () => void this.runOnce(input.id, input.run),
        start: true,
      });
      this.jobs.set(input.id, { cron: input.cron, job });
      this.logger.info('schedule set', { id: input.id, cron: input.cron, tz: input.timeZone });
    } catch (error) {
      // One person's bad expression must not stop everyone else's clock.
      this.logger.error('schedule rejected', {
        id: input.id,
        cron: input.cron,
        error: message(error),
      });
    }
  }

  /** A slow run must not stack up behind itself: a sweep can legitimately take minutes. */
  private async runOnce(id: string, run: () => Promise<void>): Promise<void> {
    if (this.running.has(id)) {
      this.logger.warn('schedule skipped; the previous run is still going', { id });
      return;
    }
    this.running.add(id);
    const startedAt = Date.now();
    try {
      await run();
      this.logger.info('schedule ran', { id, ms: Date.now() - startedAt });
    } catch (error) {
      this.logger.error('schedule failed', { id, ms: Date.now() - startedAt, error: message(error) });
    } finally {
      this.running.delete(id);
    }
  }
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
