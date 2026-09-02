import type { PrismaSettingsRepository } from '@open-loops/persistence';
import type { ScheduledKind } from '@open-loops/plugin-host';
import type { PodcastLength } from '@open-loops/podcast';
import type { Workspace } from '../../infrastructure/workspace.factory.js';
import type { AppConfig } from '../../config/env.js';

export type BuiltInSchedules = (workspace: Workspace) => readonly ScheduledKind[];

/**
 * The two kinds of scheduled work the product owns rather than borrows. A sweep is the heartbeat
 * and a podcast is the flagship feature, so neither is a plugin — but both are declared in the
 * same shape a plugin would use, which is what lets the Settings screen and the external
 * scheduler treat every kind of work identically and know the name of none of them.
 */
export const builtInSchedules = (deps: {
  config: AppConfig;
  /** Whether an episode can be produced *and* kept. Both halves, or the button fails on the write. */
  podcastReady: boolean;
  settings: PrismaSettingsRepository;
}): BuiltInSchedules => {
  return (workspace) => [
    {
      kind: 'sweep',
      label: 'Sweep',
      description: 'Pulls every source, re-checks evidence and re-plans the day.',
      defaultCron: deps.config.TICK_CRON,
      enabledByDefault: true,
      available: () => true,
      run: async () => {
        await workspace.tick.execute();
      },
    },
    {
      kind: 'podcast',
      label: 'Podcast',
      description: 'Records the day as a two-host conversation.',
      defaultCron: deps.config.PODCAST_CRON,
      // Off until somebody asks for it: an episode nobody wanted is a daily surprise.
      enabledByDefault: false,
      available: () => deps.podcastReady,
      run: async () => {
        const saved = await deps.settings.get(workspace.ownerId);
        await workspace.podcast.execute({
          force: false,
          length: saved.podcastLength as PodcastLength,
          ...(saved.podcastHostVoiceId === undefined
            ? {}
            : { hostVoiceId: saved.podcastHostVoiceId }),
          ...(saved.podcastGuestVoiceId === undefined
            ? {}
            : { guestVoiceId: saved.podcastGuestVoiceId }),
        });
      },
    },
  ];
};
