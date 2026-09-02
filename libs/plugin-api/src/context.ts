import type { Clock, Logger } from '@open-loops/kernel';
import type { OpenLoopRepository } from '@open-loops/loops';
import type { SignalStore } from '@open-loops/signals';
import type { TodayDto } from '@open-loops/contracts';
import type {
  ToolBroker,
  EventRegistry,
  HttpRegistry,
  PluginRecordStore,
  ProbeRegistry,
  ScheduleRegistry,
  SettingsRegistry,
  SourceRegistry,
  TickRegistry,
} from './registries/index.js';

/**
 * Reading is granted; concluding is not. A plugin may look at every loop this person has and
 * may not save one — status is decided in `assessCompletion` and nowhere else, and the way to
 * keep that true is to never hand out the method that would let somebody try.
 */
export type LoopReader = Pick<OpenLoopRepository, 'findById' | 'findBySourceKey' | 'list'>;

/** The mirror image: a plugin may add to the feed and may not edit or remove what is there. */
export type SignalWriter = Pick<SignalStore, 'append'>;

export interface TodayReader {
  execute(): Promise<TodayDto>;
}

/**
 * Everything a plugin can do on behalf of one person, already bound to that person. Built per
 * owner per request, exactly like `Workspace`, and for the same reason: there is no object here
 * that can express a question about somebody else.
 *
 * Every port below is gated by a capability the manifest had to declare. The host builds this
 * object with the ungranted ones as accessors that throw `CapabilityError`, so an undeclared
 * reach fails loudly on the first call rather than quietly at review time. They are typed as
 * present because a plugin that declared the capability should not have to prove it twice.
 */
export interface OwnerScope {
  readonly ownerId: string;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Requires `read:loops`. */
  readonly loops: LoopReader;
  /** Requires `read:today`. */
  readonly today: TodayReader;
  /** Requires `write:signals`. */
  readonly signals: SignalWriter;
  /** Requires `storage`. Namespaced to this plugin and this owner by construction. */
  readonly storage: PluginRecordStore;
  /**
   * Requires `tools`. `undefined` where this deployment has no broker — local mode has no API
   * keys at all, and a probe that cannot be asked is answered out of band instead. Absent is a
   * normal answer here, not a failure, so this one is honestly optional rather than a throwing
   * accessor.
   */
  readonly tools: ToolBroker | undefined;
  /** This plugin's own settings, parsed through the fragment it registered. */
  settings<TValue>(): Promise<TValue>;
}

/**
 * Handed to `setup()` once at boot. Registration only: a plugin says what it contributes here
 * and does none of it, because at boot there is no account to do it for.
 */
export interface PluginSetupContext {
  readonly logger: Logger;
  /** Read-only view of the process environment the deployment was configured with. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Which other plugins are loaded. Lets an optional integration degrade instead of throwing. */
  has(pluginId: string): boolean;

  readonly sources: SourceRegistry;
  readonly probes: ProbeRegistry;
  readonly schedules: ScheduleRegistry;
  readonly http: HttpRegistry;
  readonly settings: SettingsRegistry;
  readonly tick: TickRegistry;
  readonly events: EventRegistry;
}
