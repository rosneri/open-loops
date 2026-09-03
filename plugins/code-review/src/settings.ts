import { z } from 'zod';
import type { SettingsFragment } from '@open-loops/plugin-api';

/**
 * Which GitHub organisations count. Empty is not "none" — it is the default and means every
 * organisation the connected account can see, which is what this plugin did before anybody
 * could narrow it.
 *
 * Logins rather than ids: it is what the URL says, what the picker shows and what the fetch
 * intent has to name out loud, and an id would need translating back at each of the three.
 */
export const codeReviewSettingsSchema = z.object({
  organizations: z
    .array(
      z
        .string()
        .trim()
        // GitHub's own rule for a login: letters, digits and single hyphens, 39 characters.
        .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, 'That is not a GitHub login.'),
    )
    .max(50, 'Fifty organisations is more than a filter.')
    .default([]),
});

export type CodeReviewSettings = z.infer<typeof codeReviewSettingsSchema>;

export const DEFAULT_SETTINGS: CodeReviewSettings = { organizations: [] };

export const settingsFragment: SettingsFragment<CodeReviewSettings> = {
  schema: codeReviewSettingsSchema,
  defaults: DEFAULT_SETTINGS,
  label: 'GitHub',
};
