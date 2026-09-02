import { Capability, definePlugin } from '@open-loops/plugin-api';
import { PODCAST_OPTIONS, PodcastController } from './http/podcast.controller.js';
import { optionsFrom } from './options.js';
import { podcastAvailable, recordToday } from './record-today.js';
import { settingsFragment } from './settings.js';

export type { EpisodeDto, EpisodeStatusDto } from './contracts.js';
export { PodcastRoutes } from './contracts.js';
export type { PodcastSettings } from './settings.js';

/**
 * The day, read aloud. It used to be the one feature the core owned outright; it is the first
 * one to leave, and it leaves through exactly the seams every other plugin uses — a schedule, a
 * settings fragment, routes, the record store and the model — because if the flagship could not
 * be a plugin, the extension points were not honest.
 */
export default definePlugin({
  id: 'podcast',
  version: '1.0.0',
  description: 'The day as a two-host conversation, recorded on a schedule you own.',
  capabilities: [
    Capability.ReadToday,
    Capability.Storage,
    Capability.Schedule,
    Capability.Http,
    Capability.Settings,
    Capability.Reasoning,
  ],
  setup: (context) => {
    const options = optionsFrom(context.env);

    context.settings.register(settingsFragment);

    context.schedules.register({
      kind: 'podcast',
      label: 'Podcast',
      description: 'Records the day as a two-host conversation.',
      defaultCron: options.defaultCron,
      // Off until somebody asks for it: an episode nobody wanted is a daily surprise.
      enabledByDefault: false,
      available: () => podcastAvailable(options),
      run: async (scope) => {
        await recordToday({ scope, options, force: false });
      },
    });

    context.http.register({
      basePath: 'api/podcast',
      controllers: [PodcastController],
      providers: [{ provide: PODCAST_OPTIONS, useValue: options }],
    });
  },
});
