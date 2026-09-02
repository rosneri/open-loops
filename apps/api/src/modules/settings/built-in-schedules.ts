import type { ScheduledKind } from '@open-loops/plugin-host';
import type { Workspace } from '../../infrastructure/workspace.factory.js';
import type { AppConfig } from '../../config/env.js';

export type BuiltInSchedules = (workspace: Workspace) => readonly ScheduledKind[];

/**
 * The one kind of scheduled work the product owns rather than borrows: the sweep is the
 * heartbeat, and a deployment with no plugins at all still has to have one. It is declared in
 * the same shape a plugin would use, which is what lets the Settings screen and the external
 * scheduler treat every kind of work identically and know the name of none of them.
 */
export const builtInSchedules = (deps: { config: AppConfig }): BuiltInSchedules => {
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
  ];
};
