import { Body, Controller, Get, Headers, Inject, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { Response } from 'express';
import type { EpisodeDto } from '@open-loops/contracts';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import type { Episode, PodcastLength } from '@open-loops/podcast';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { USER_HEADER } from '../agent/agent.controller.js';
import type { RequestWithUser } from '../auth/jwt-auth.guard.js';
import { Owner } from '../auth/owner.decorator.js';
import { OwnerResolver } from '../auth/owner-resolver.service.js';
import { Public } from '../auth/public.decorator.js';
import { SessionOrTokenGuard } from '../auth/session-or-token.guard.js';
import { SettingsService } from '../settings/settings.service.js';

const requestSchema = z.object({ force: z.boolean().default(false) });

@Controller('api/podcast')
export class PodcastController {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    private readonly owners: OwnerResolver,
    private readonly settings: SettingsService,
    @Inject(Tokens.Config) private readonly config: AppConfig,
  ) {}

  /**
   * Serves an episode written by the filesystem store. Only reachable in a deployment that has
   * no blob store — with one, the URL points straight at the blob and never comes back here.
   */
  @Get('audio/:name')
  public async audio(@Param('name') name: string, @Res() response: Response): Promise<void> {
    // `basename` first: the name comes from a URL, and nothing else stops `../` here.
    const file = join(resolve(this.config.PODCAST_DIR), basename(name));
    const size = await stat(file).catch(() => undefined);
    if (size === undefined) throw new NotFoundException('No such episode.');

    response.setHeader('content-type', 'audio/mpeg');
    response.setHeader('content-length', size.size);
    createReadStream(file).pipe(response);
  }

  @Get('episodes')
  public async list(@Owner() ownerId: string): Promise<readonly EpisodeDto[]> {
    return (await this.workspaces.for(ownerId).episodes.listRecent(30)).map(toDto);
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
  public async generate(
    @Req() request: RequestWithUser,
    @Headers(USER_HEADER) username: string | undefined,
    @Body() body: unknown,
  ): Promise<{ day: string; status: string; audioUrl?: string; error?: string }> {
    const { force } = requestSchema.parse(body ?? {});
    // A signed-in person means themselves; a machine with the shared secret has to say who.
    const ownerId = request.user?.id ?? (await this.owners.resolve(username));
    const current = await this.settings.current(ownerId);

    return await this.workspaces.for(ownerId).podcast.execute({
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
