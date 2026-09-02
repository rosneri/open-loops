import type { Capability } from './capability.js';
import type { PluginSetupContext } from './context.js';

/**
 * What a feature must say about itself to become part of the app. The manifest is deliberately
 * boring — an id, what it needs, what it is allowed to touch — because everything interesting
 * happens in `setup`, and everything the host must know before running `setup` has to be
 * readable without running it.
 */
export interface Plugin {
  /** Stable, lowercase, and the namespace for this plugin's routes, records and settings. */
  readonly id: string;
  readonly version: string;
  /** One line, shown wherever plugins are listed. */
  readonly description: string;
  /**
   * Ids of plugins that must be loaded and set up first. A missing requirement fails the boot;
   * a cycle fails the boot. Both are configuration errors and neither should be discovered by
   * a feature silently not working.
   */
  readonly requires?: readonly string[] | undefined;
  readonly capabilities: readonly Capability[];
  setup(context: PluginSetupContext): void | Promise<void>;
}

/**
 * Identity, not ceremony: this exists so a plugin file gets checked against the contract where
 * it is written rather than where it is loaded.
 */
export const definePlugin = (plugin: Plugin): Plugin => plugin;
