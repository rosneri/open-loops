import type { Clock, Logger } from '@open-loops/kernel';
import type { OpenLoopRepository } from '@open-loops/loops';
import type { SignalStore } from '@open-loops/signals';
import type { TodayViewQuery } from '@open-loops/orchestration';
import type { OwnerScope, Plugin, ToolBroker } from '@open-loops/plugin-api';
import { Capability, CapabilityError } from '@open-loops/plugin-api';
import { PrismaPluginRecordStore, type PrismaClient } from '@open-loops/persistence';

export interface OwnerScopeDeps {
  readonly ownerId: string;
  readonly prisma: PrismaClient;
  readonly plugins: readonly Plugin[];
  readonly loops: OpenLoopRepository;
  readonly today: TodayViewQuery;
  readonly signals: SignalStore;
  readonly tools: ToolBroker | undefined;
  /** What each plugin registered as its defaults, by plugin id. Nothing saved means these. */
  readonly settingsDefaults: ReadonlyMap<string, unknown>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** Where a plugin's own settings live until they have a screen: its own namespace, one key. */
const SETTINGS = { collection: '__settings', key: 'value' } as const;

/**
 * One person, one plugin, and only the ports that plugin declared. Ungranted ports are getters
 * that throw rather than fields that are absent, so an undeclared reach fails loudly on the
 * first call with the name of the plugin and the capability it should have asked for — and a
 * plugin that did declare one is not made to prove it twice at every call site.
 *
 * Everything here is per owner, built the same way `Workspace` is and for the same reason: there
 * is no object in this file that can express a question about somebody else.
 */
export const ownerScopeFactory = (deps: OwnerScopeDeps): ((pluginId: string) => OwnerScope) => {
  return (pluginId: string): OwnerScope => {
    const plugin = deps.plugins.find((candidate) => candidate.id === pluginId);
    const granted = new Set<string>(plugin?.capabilities ?? []);
    const need = (capability: Capability): void => {
      if (!granted.has(capability)) throw new CapabilityError(pluginId, capability);
    };
    const records = new PrismaPluginRecordStore(deps.prisma, deps.ownerId, pluginId);

    return {
      ownerId: deps.ownerId,
      clock: deps.clock,
      logger: deps.logger,

      get loops() {
        need(Capability.ReadLoops);
        return deps.loops;
      },
      get today() {
        need(Capability.ReadToday);
        return deps.today;
      },
      get signals() {
        need(Capability.WriteSignals);
        return deps.signals;
      },
      get storage() {
        need(Capability.Storage);
        return records;
      },
      get tools() {
        need(Capability.Tools);
        return deps.tools;
      },

      settings: async <TValue>(): Promise<TValue> => {
        need(Capability.Settings);
        const row = await records.get<TValue>(SETTINGS.collection, SETTINGS.key);
        // Never saved is the common case, not an error: a plugin's defaults are what it runs on
        // until somebody opens the screen and disagrees.
        return row?.value ?? (deps.settingsDefaults.get(pluginId) as TValue);
      },
    };
  };
};
