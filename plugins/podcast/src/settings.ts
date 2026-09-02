import { z } from 'zod';
import type { SettingsFragment } from '@open-loops/plugin-api';

/**
 * What the podcast sounds like. When and whether it runs are not here — those are a schedule,
 * and schedules are configured the same way for every kind of work whether or not the app
 * shipped with it. Voice ids are provider-specific and left blank for the provider's default.
 */
export const podcastSettingsSchema = z.object({
  length: z.enum(['short', 'default', 'long']).default('default'),
  hostVoiceId: z.string().max(120).optional(),
  guestVoiceId: z.string().max(120).optional(),
});

export type PodcastSettings = z.infer<typeof podcastSettingsSchema>;

export const DEFAULT_SETTINGS: PodcastSettings = { length: 'default' };

export const settingsFragment: SettingsFragment<PodcastSettings> = {
  schema: podcastSettingsSchema,
  defaults: DEFAULT_SETTINGS,
  label: 'Podcast of the day',
};
