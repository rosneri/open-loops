import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { Response } from 'express';
import { InjectPluginScopes, Owner, type PluginScopes } from '@open-loops/plugin-nest';
import { toDto, type EpisodeDto } from '../contracts.js';
import { RecordEpisodeRepository } from '../episodes.store.js';
import type { PodcastOptions } from '../options.js';
import { audioFilePrefixFor } from '../ports/audio-store.port.js';
import { recordToday } from '../record-today.js';

/** The plugin's configuration, bound by the host from what `setup` registered beside the routes. */
export const PODCAST_OPTIONS = 'ol:plugin-podcast:options';

const requestSchema = z.object({ force: z.boolean().default(false) });

/**
 * Every route here is behind the session: the machine caller that used to reach `generate` with
 * a shared secret now goes through `POST /api/schedules/podcast/run`, which is the host's, so
 * nothing in this plugin has to know what a bearer token is.
 */
@Controller('api/podcast')
export class PodcastController {
  public constructor(
    @InjectPluginScopes('podcast') private readonly scopes: PluginScopes,
    @Inject(PODCAST_OPTIONS) private readonly options: PodcastOptions,
  ) {}

  /**
   * Serves an episode written by the filesystem store. Only reachable in a deployment that has
   * no blob store — with one, the URL points straight at the blob and never comes back here.
   *
   * Every account's files sit in one directory, so the name alone is not authorisation: the
   * request has to be for a file this account's own episodes are written under. Anything else
   * is "no such episode" rather than "not yours", which is also all a stranger should learn.
   */
  @Get('audio/:name')
  public async audio(
    @Owner() ownerId: string,
    @Param('name') name: string,
    @Res() response: Response,
  ): Promise<void> {
    // `basename` first: the name comes from a URL, and nothing else stops `../` here.
    const requested = basename(name);
    if (!requested.startsWith(audioFilePrefixFor(ownerId))) {
      throw new NotFoundException('No such episode.');
    }

    const file = join(resolve(this.options.directory), requested);
    const size = await stat(file).catch(() => undefined);
    if (size === undefined) throw new NotFoundException('No such episode.');

    response.setHeader('content-type', 'audio/mpeg');
    response.setHeader('content-length', size.size);
    createReadStream(file).pipe(response);
  }

  @Get('episodes')
  public async list(@Owner() ownerId: string): Promise<readonly EpisodeDto[]> {
    const episodes = new RecordEpisodeRepository(this.scopes.for(ownerId).storage);
    return (await episodes.listRecent(30)).map(toDto);
  }

  /** The "Record today now" button. Recording is minutes of work; the client knows to wait. */
  @Post('generate')
  public async generate(
    @Owner() ownerId: string,
    @Body() body: unknown,
  ): Promise<{ day: string; status: string; audioUrl?: string; error?: string }> {
    const { force } = requestSchema.parse(body ?? {});
    return await recordToday({ scope: this.scopes.for(ownerId), options: this.options, force });
  }
}
