import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { EpisodeDto } from '@open-loops/contracts';
import type { GenerateDailyPodcastUseCase } from '@open-loops/orchestration';
import type { Episode, EpisodeRepository, PodcastLength } from '@open-loops/podcast';
import { Tokens } from '../../tokens.js';
import { Public } from '../auth/public.decorator.js';
import { SessionOrTokenGuard } from '../auth/session-or-token.guard.js';
import { SettingsService } from '../settings/settings.service.js';

const requestSchema = z.object({ force: z.boolean().default(false) });

@Controller('api/podcast')
export class PodcastController {
  public constructor(
    @Inject(Tokens.GenerateDailyPodcast) private readonly podcast: GenerateDailyPodcastUseCase,
    @Inject(Tokens.EpisodeRepository) private readonly episodes: EpisodeRepository,
    private readonly settings: SettingsService,
  ) {}

  @Get('episodes')
  public async list(): Promise<readonly EpisodeDto[]> {
    return (await this.episodes.listRecent(30)).map(toDto);
  }

  /**
   * Both a button in the client and the platform's cron call this, so it takes either a session
   * or the shared secret — the same arrangement `/api/tick` uses, and for the same reason.
   *
   * On a serverless deployment this is the *only* way the podcast is ever produced: nothing
   * there lives long enough to hold a cron job of its own.
   */
  @Public()
  @UseGuards(SessionOrTokenGuard)
  @Post('generate')
  public async generate(@Body() body: unknown): Promise<{ day: string; status: string; audioUrl?: string; error?: string }> {
    const { force } = requestSchema.parse(body ?? {});
    const current = await this.settings.current();

    return await this.podcast.execute({
      force,
      length: current.podcastLength as PodcastLength,
      ...(current.podcastHostVoiceId === undefined
        ? {}
        : { hostVoiceId: current.podcastHostVoiceId }),
      ...(current.podcastGuestVoiceId === undefined
        ? {}
        : { guestVoiceId: current.podcastGuestVoiceId }),
    });
  }
}

const toDto = (episode: Episode): EpisodeDto => {
  const props = episode.snapshot();
  return {
    id: props.id,
    day: props.day,
    status: props.status,
    title: props.title,
    requestedAt: props.requestedAt,
    ...(props.audioUrl === undefined ? {} : { audioUrl: props.audioUrl }),
    ...(props.durationSeconds === undefined ? {} : { durationSeconds: props.durationSeconds }),
    ...(props.error === undefined ? {} : { error: props.error }),
    ...(props.completedAt === undefined ? {} : { completedAt: props.completedAt }),
  };
};
