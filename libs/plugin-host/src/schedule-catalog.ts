import type { OwnerScope, ScheduleDefinition } from '@open-loops/plugin-api';
import type { PluginHost } from './plugin-host.js';
import type { Registered } from './registrations.js';

/**
 * One kind of scheduled work, already bound to one person. The scope is closed over rather than
 * passed in, so a caller cannot accidentally run somebody's podcast against somebody else's day.
 */
export interface ScheduledKind {
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly defaultCron: string;
  readonly enabledByDefault: boolean;
  available(): boolean;
  run(): Promise<void>;
}

/**
 * What can be put on a clock. The sweep and the podcast used to be two hard-coded kinds in three
 * places — the settings row, the settings screen and the external scheduler — so a third kind of
 * work meant editing all three. They are registrations now, and everything else enumerates.
 */
export class ScheduleCatalog {
  public constructor(private readonly registered: readonly Registered<ScheduleDefinition>[]) {}

  public static from(host: PluginHost): ScheduleCatalog {
    const seen = new Map<string, string>();
    for (const { pluginId, definition } of host.schedules()) {
      const owner = seen.get(definition.kind);
      if (owner !== undefined) {
        throw new Error(
          `Schedule '${definition.kind}' is registered by both '${owner}' and '${pluginId}'.`,
        );
      }
      seen.set(definition.kind, pluginId);
    }
    return new ScheduleCatalog(host.schedules());
  }

  /**
   * Bound to one person, because whether a kind is available and what it would do are both
   * questions about an account rather than about the deployment.
   */
  public kinds(scopeFor: (pluginId: string) => OwnerScope): readonly ScheduledKind[] {
    return this.registered.map(({ pluginId, definition }) => ({
      kind: definition.kind,
      label: definition.label,
      description: definition.description,
      defaultCron: definition.defaultCron,
      enabledByDefault: definition.enabledByDefault ?? true,
      available: () => definition.available?.(scopeFor(pluginId)) ?? true,
      run: async () => {
        await definition.run(scopeFor(pluginId));
      },
    }));
  }
}
