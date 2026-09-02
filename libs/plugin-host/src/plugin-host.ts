import type { Logger } from '@open-loops/kernel';
import type { LoopEvent } from '@open-loops/loops';
import type { TickStep } from '@open-loops/orchestration';
import {
  PluginError,
  type HttpRegistration,
  type OwnerScope,
  type Plugin,
  type ProbeDefinition,
  type ReasoningProviderDefinition,
  type ScheduleDefinition,
  type SettingsFragment,
  type SourceDefinition,
  type TickStepDefinition,
} from '@open-loops/plugin-api';
import { topologicalOrder } from './ordering.js';
import { Registrations, notify, setupContextFor, type Registered } from './registrations.js';

export interface LoadPluginsInput {
  readonly plugins: readonly Plugin[];
  readonly logger: Logger;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/**
 * What the plugins collectively decided this deployment is. Everything the composition root
 * used to know by hard-coding — which sources exist, which probes can be answered, what runs on
 * the tick — it now asks this object instead.
 */
export class PluginHost {
  private constructor(
    private readonly state: {
      readonly plugins: readonly Plugin[];
      readonly registrations: Registrations;
      readonly logger: Logger;
      readonly orderedSteps: readonly Registered<TickStepDefinition>[];
    },
  ) {}

  /**
   * Boot, in declared order. A plugin's `setup` may assume everything it `requires` has already
   * run, which is the whole reason the order is derived rather than trusted.
   */
  public static async load(input: LoadPluginsInput): Promise<PluginHost> {
    const ordered = topologicalOrder(
      input.plugins.map((plugin) => ({ ...plugin, name: plugin.id, after: plugin.requires })),
      { onMissing: 'throw', label: 'plugin' },
    );

    const registrations = new Registrations();
    const loaded = new Set<string>();

    for (const entry of ordered) {
      const plugin = input.plugins.find((candidate) => candidate.id === entry.name);
      /* c8 ignore next */
      if (plugin === undefined) continue;
      try {
        await plugin.setup(
          setupContextFor({ plugin, registrations, logger: input.logger, env: input.env, loaded }),
        );
      } catch (error) {
        // A half-loaded plugin is worse than no deployment: the feature is listed, connected and
        // silently inert. Boot fails instead.
        throw error instanceof PluginError
          ? error
          : new PluginError(plugin.id, error instanceof Error ? error.message : String(error));
      }
      loaded.add(plugin.id);
      input.logger.info('plugin loaded', { plugin: plugin.id, version: plugin.version });
    }

    // Two plugins on one route is a configuration error, not a race to register first.
    const paths = new Map<string, string>();
    for (const { pluginId, definition } of registrations.http) {
      const owner = paths.get(definition.basePath);
      if (owner !== undefined) {
        throw new PluginError(pluginId, `mounts '${definition.basePath}', which '${owner}' owns.`);
      }
      paths.set(definition.basePath, pluginId);
    }

    const steps = topologicalOrder(
      registrations.tickSteps.map((registered) => ({
        ...registered,
        name: registered.definition.name,
        after: registered.definition.after,
      })),
      { onMissing: 'ignore', label: 'tick step' },
    );

    return new PluginHost({
      plugins: ordered,
      registrations,
      logger: input.logger,
      orderedSteps: steps,
    });
  }

  public list(): readonly Plugin[] {
    return this.state.plugins;
  }

  public sources(): readonly Registered<SourceDefinition>[] {
    return this.state.registrations.sources;
  }

  /** The one definition that owns a probe kind, or nothing — a kind nobody claims is not run. */
  public probe(kind: string): ProbeDefinition | undefined {
    return this.state.registrations.probes.find((entry) => entry.definition.kind === kind)?.definition;
  }

  public probes(): readonly Registered<ProbeDefinition>[] {
    return this.state.registrations.probes;
  }

  public schedules(): readonly Registered<ScheduleDefinition>[] {
    return this.state.registrations.schedules;
  }

  public http(): readonly Registered<HttpRegistration>[] {
    return this.state.registrations.http;
  }

  public settings(): readonly Registered<SettingsFragment>[] {
    return this.state.registrations.settings;
  }

  /** In registration order; the composition root puts the preferred one first. */
  public reasoningProviders(): readonly Registered<ReasoningProviderDefinition>[] {
    return this.state.registrations.reasoningProviders;
  }

  /**
   * Already ordered by `after`, and already bound to one person: the caller runs them front to
   * back and thinks about neither ordering nor whose data it is.
   */
  public tickSteps(scopeFor: (pluginId: string) => OwnerScope): readonly TickStep[] {
    return this.state.orderedSteps.map(({ pluginId, definition }) => ({
      name: definition.name,
      ...(definition.after === undefined ? {} : { after: definition.after }),
      run: async () => await definition.run(scopeFor(pluginId)),
    }));
  }

  public async publish(event: LoopEvent): Promise<void> {
    const handlers = this.state.registrations.handlers.get(event.type) ?? [];
    await notify({ handlers, event, logger: this.state.logger });
  }
}
