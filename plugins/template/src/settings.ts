import { z } from 'zod';
import type { SettingsFragment } from '@open-loops/plugin-api';

/**
 * What a person can configure. The schema is validation on the way in, the value
 * `scope.settings<TemplateSettings>()` hands back at run time, and what the panel edits — one
 * declaration, three jobs. Add a field here and it exists everywhere.
 */
export const templateSettingsSchema = z.object({
  /** Whether the tick step says anything at all. Off is the right default for anything noisy. */
  enabled: z.boolean().default(false),
});

export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

export const settingsFragment: SettingsFragment<TemplateSettings> = {
  schema: templateSettingsSchema,
  defaults: { enabled: false },
  label: 'Template',
};
