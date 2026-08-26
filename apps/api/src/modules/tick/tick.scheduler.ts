import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { CronJob } from 'cron';
import type { Logger } from '@open-loops/kernel';
import type { RunTickUseCase } from '@open-loops/orchestration';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

/**
 * The heartbeat. Everything it does lives in `RunTickUseCase`; this class only decides *when*,
 * and refuses to overlap runs — a slow tick must not stack up behind itself.
 */
@Injectable()
export class TickScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private job: CronJob | undefined;
  private running = false;

  public constructor(
    @Inject(Tokens.RunTick) private readonly tick: RunTickUseCase,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    @Inject(Tokens.Logger) private readonly logger: Logger,
  ) {}

  public onApplicationBootstrap(): void {
    this.job = CronJob.from({
      cronTime: this.config.TICK_CRON,
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
      onTick: () => void this.runOnce(),
      start: true,
    });
    this.logger.info('tick scheduled', { cron: this.config.TICK_CRON });
    if (this.config.TICK_ON_BOOT) void this.runOnce();
  }

  public onApplicationShutdown(): void {
    this.job?.stop();
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
