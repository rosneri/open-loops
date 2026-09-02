import { Capability, definePlugin } from '@open-loops/plugin-api';
import { settingsFragment, type TemplateSettings } from './settings.js';

export type { TemplateSettings } from './settings.js';

/**
 * The smallest plugin that touches a person's data: it reads the assembled day once per tick
 * and reports how much is open. Everything it uses is declared in `capabilities`, and reaching
 * for anything else throws at boot — so start by deciding what this plugin is allowed to see.
 *
 * Delete what you do not need. A plugin with one registration is a normal plugin.
 */
export default definePlugin({
  id: 'template',
  version: '1.0.0',
  description: 'Counts what is open, once a tick.',
  capabilities: [Capability.ReadToday, Capability.Settings, Capability.Tick],
  setup: (context) => {
    context.settings.register(settingsFragment);

    context.tick.register({
      name: 'template',
      // Runs after the day has been re-planned, so the count is of the day the person will see.
      after: ['plan'],
      run: async (scope) => {
        const settings = await scope.settings<TemplateSettings>();
        if (!settings.enabled) return { skipped: 1 };

        const day = await scope.today.execute();
        scope.logger.info('template counted the day', { open: day.counts.OPEN });
        return { open: day.counts.OPEN };
      },
    });
  },
});
