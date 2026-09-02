/**
 * A plugin problem is a configuration problem, and it is worth failing the boot for. A feature
 * that silently did not load is indistinguishable from a feature that is broken, and the second
 * one wastes an afternoon.
 */
export class PluginError extends Error {
  public constructor(
    public readonly pluginId: string,
    message: string,
  ) {
    super(`[plugin:${pluginId}] ${message}`);
    this.name = 'PluginError';
  }
}

/** A plugin reached for a port its manifest did not ask for. */
export class CapabilityError extends PluginError {
  public constructor(pluginId: string, capability: string) {
    super(pluginId, `does not declare the '${capability}' capability but tried to use it.`);
    this.name = 'CapabilityError';
  }
}
