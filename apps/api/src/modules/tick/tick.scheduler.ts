import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { CronJob } from 'cron';
import type { Logger } from '@open-loops/kernel';
import type { RunTickUseCase } from '@open-loops/orchestration';
import { Tokens } from '../../tokens.js';
import { SettingsService } from '../settings/settings.service.js';

/**
 * The heartbeat. Everything it does lives in `RunTickUseCase`; this class only decides *when*,
 * and refuses to overlap runs — a slow tick must not stack up behind itself.
 *
 * The schedule comes from the settings row rather than the environment, so changing it in the
 * app takes effect on save instead of on the next deploy.
 */
@Injectable()
export class TickScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private job: CronJob | undefined;
  private running = false;
  private unsubscribe: (() => void) | undefined;

  public constructor(
    @Inject(Tokens.RunTick) private readonly tick: RunTickUseCase,
    @Inject(Tokens.Logger) private readonly logger: Logger,
    private readonly settings: SettingsService,
  ) {}

  public onApplicationBootstrap(): void {
    // A serverless invocation would build a cron job and then die with it, logging a schedule
    // it never honours. The platform's cron drives the HTTP route there instead.
    if (!this.settings.canSchedule) return;

    void this.reschedule();
    this.unsubscribe = this.settings.onChange(() => void this.reschedule());
    if (this.settings.tickOnBoot) void this.runOnce();
  }

  public onApplicationShutdown(): void {
    this.unsubscribe?.();
    // cron v4 returns a promise from stop(); shutdown does not wait on it.
    void this.job?.stop();
  }

  /**
   * Reads the current expression and swaps the job for one on the new time. A failure here must
   * not take the process down: the previous schedule keeps running and the error is logged.
   */
  private async reschedule(): Promise<void> {
    try {
      const { sweepCron } = await this.settings.current();
      if (this.job?.cronTime.source === sweepCron) return;

      void this.job?.stop();
      this.job = CronJob.from({
        cronTime: sweepCron,
        timeZone: this.settings.timeZone,
        onTick: () => void this.runOnce(),
        start: true,
      });
      this.logger.info('tick scheduled', { cron: sweepCron });
    } catch (error) {
      this.logger.error('tick could not be scheduled', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn('tick skipped; the previous one is still running');
      return;
    }
    this.running = true;
    try {
      await this.tick.execute();
    } catch (error) {
      this.logger.error('tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
