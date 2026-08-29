import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { CronJob } from 'cron';
import type { Logger } from '@open-loops/kernel';
import type { GenerateDailyPodcastUseCase } from '@open-loops/orchestration';
import type { PodcastLength } from '@open-loops/podcast';
import { Tokens } from '../../tokens.js';
import { SettingsService } from '../settings/settings.service.js';

/**
 * The same shape as the tick scheduler and for the same reason: the schedule is a setting, not
 * a deployment constant. Disabling the podcast stops the job outright rather than running it
 * and throwing away the result, so a disabled podcast costs nothing at the provider.
 */
@Injectable()
export class PodcastScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private job: CronJob | undefined;
  private running = false;
  private unsubscribe: (() => void) | undefined;

  public constructor(
    @Inject(Tokens.GenerateDailyPodcast) private readonly podcast: GenerateDailyPodcastUseCase,
    @Inject(Tokens.Logger) private readonly logger: Logger,
    private readonly settings: SettingsService,
  ) {}

  public onApplicationBootstrap(): void {
    // A serverless invocation would build a cron job and then die with it, logging a schedule
    // it never honours. The platform's cron drives the HTTP route there instead.
    if (!this.settings.canSchedule) return;

    void this.reschedule();
    this.unsubscribe = this.settings.onChange(() => void this.reschedule());
  }

  public onApplicationShutdown(): void {
    this.unsubscribe?.();
    void this.job?.stop();
  }

  private async reschedule(): Promise<void> {
    try {
      const current = await this.settings.current();

      if (!current.podcastEnabled) {
        if (this.job !== undefined) this.logger.info('podcast schedule stopped');
        void this.job?.stop();
        this.job = undefined;
        return;
      }
      if (this.job?.cronTime.source === current.podcastCron) return;

      void this.job?.stop();
      this.job = CronJob.from({
        cronTime: current.podcastCron,
        timeZone: this.settings.timeZone,
        onTick: () => void this.runOnce(),
        start: true,
      });
      this.logger.info('podcast scheduled', { cron: current.podcastCron });
    } catch (error) {
      this.logger.error('podcast could not be scheduled', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn('podcast skipped; the previous one is still generating');
      return;
    }
    this.running = true;
    try {
      const current = await this.settings.current();
      await this.podcast.execute({
        length: current.podcastLength as PodcastLength,
        ...(current.podcastHostVoiceId === undefined
          ? {}
          : { hostVoiceId: current.podcastHostVoiceId }),
        ...(current.podcastGuestVoiceId === undefined
          ? {}
          : { guestVoiceId: current.podcastGuestVoiceId }),
      });
    } catch (error) {
      this.logger.error('podcast run failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
