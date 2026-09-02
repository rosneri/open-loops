import type { Logger } from '@open-loops/kernel';
import type { LoopEventType, LoopEvent } from '@open-loops/loops';
import {
  Capability,
  CapabilityError,
  type HttpRegistration,
  type LoopEventHandler,
  type Plugin,
  type PluginSetupContext,
  type ProbeDefinition,
  type ReasoningProviderDefinition,
  type ScheduleDefinition,
  type SettingsFragment,
  type SourceDefinition,
  type TickStepDefinition,
} from '@open-loops/plugin-api';

/** Every registration remembers who made it: errors, namespacing and gating all need it. */
export interface Registered<TDefinition> {
  readonly pluginId: string;
  readonly definition: TDefinition;
}

const tag = <TDefinition>(pluginId: string, definition: TDefinition): Registered<TDefinition> => ({
  pluginId,
  definition,
});

/**
 * The mutable side of the host, filled during boot and frozen in behaviour afterwards: nothing
 * registers anything once `setup` has run for every plugin, because a feature that appears
 * halfway through a request is a feature that behaves differently depending on when you ask.
 */
export class Registrations {
  public readonly sources: Registered<SourceDefinition>[] = [];
  public readonly probes: Registered<ProbeDefinition>[] = [];
  public readonly schedules: Registered<ScheduleDefinition>[] = [];
  public readonly http: Registered<HttpRegistration>[] = [];
  public readonly settings: Registered<SettingsFragment>[] = [];
  public readonly tickSteps: Registered<TickStepDefinition>[] = [];
  public readonly reasoningProviders: Registered<ReasoningProviderDefinition>[] = [];
  public readonly handlers = new Map<LoopEventType, Registered<LoopEventHandler>[]>();
}

/**
 * One plugin's window onto the registries. It carries the plugin's own id so a registration
 * cannot be attributed to anybody else, and it refuses anything the manifest did not ask for —
 * at registration time, which is boot, so a missing capability is a startup failure rather than
 * a surprise on the day the feature is first used.
 */
export const setupContextFor = (input: {
  plugin: Plugin;
  registrations: Registrations;
  logger: Logger;
  env: Readonly<Record<string, string | undefined>>;
  loaded: ReadonlySet<string>;
}): PluginSetupContext => {
  const { plugin, registrations } = input;
  const granted = new Set<string>(plugin.capabilities);

  const require = (capability: Capability): void => {
    if (!granted.has(capability)) throw new CapabilityError(plugin.id, capability);
  };

  return {
    logger: input.logger,
    env: input.env,
    has: (pluginId) => input.loaded.has(pluginId),

    sources: {
      // A connector is the only thing that can put a signal in the feed, so declaring one is
      // declaring the write.
      register: (definition) => {
        require(Capability.WriteSignals);
        registrations.sources.push(tag(plugin.id, definition));
      },
    },
    probes: {
      register: (definition) => {
        require(Capability.RunProbes);
        registrations.probes.push(tag(plugin.id, definition));
      },
    },
    schedules: {
      register: (definition) => {
        require(Capability.Schedule);
        registrations.schedules.push(tag(plugin.id, definition));
      },
    },
    http: {
      register: (registration) => {
        require(Capability.Http);
        registrations.http.push(tag(plugin.id, registration));
      },
    },
    settings: {
      register: (fragment) => {
        require(Capability.Settings);
        registrations.settings.push(tag(plugin.id, fragment as SettingsFragment));
      },
    },
    tick: {
      register: (step) => {
        require(Capability.Tick);
        registrations.tickSteps.push(tag(plugin.id, step));
      },
    },
    reasoningProviders: {
      register: (definition) => {
        require(Capability.ProvideReasoning);
        registrations.reasoningProviders.push(tag(plugin.id, definition));
      },
    },
    events: {
      on: (type, handler) => {
        require(Capability.Events);
        const existing = registrations.handlers.get(type) ?? [];
        existing.push(tag(plugin.id, handler));
        registrations.handlers.set(type, existing);
      },
    },
  };
};

/**
 * Fan an event out to its subscribers. One handler throwing must not stop the others: these are
 * observers of something that already happened, and the event is not up for debate.
 */
export const notify = async (input: {
  handlers: readonly Registered<LoopEventHandler>[];
  event: LoopEvent;
  logger: Logger;
}): Promise<void> => {
  for (const { pluginId, definition } of input.handlers) {
    try {
      await definition(input.event);
    } catch (error) {
      input.logger.error('plugin event handler failed', {
        plugin: pluginId,
        event: input.event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
