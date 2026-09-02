import type { SourceDefinition } from '@open-loops/plugin-api';
import type { PluginHost } from './plugin-host.js';

/**
 * Which apps this deployment knows about, assembled from whatever source plugins are installed.
 * The Integrations screen enumerates this, the sync layer reads its intents from it, and the
 * connection broker translates toolkit slugs through it — one list instead of three.
 */
export class SourceCatalog {
  private readonly byProvider: ReadonlyMap<string, SourceDefinition>;
  private readonly byToolkit: ReadonlyMap<string, SourceDefinition>;

  public constructor(private readonly definitions: readonly SourceDefinition[]) {
    this.byProvider = new Map(definitions.map((entry) => [entry.provider, entry]));
    this.byToolkit = new Map(
      definitions
        .filter((entry) => entry.toolkit !== undefined)
        .map((entry) => [(entry.toolkit ?? '').toLowerCase(), entry]),
    );
  }

  public static from(host: PluginHost): SourceCatalog {
    const seen = new Map<string, string>();
    for (const { pluginId, definition } of host.sources()) {
      const owner = seen.get(definition.provider);
      if (owner !== undefined) {
        // Two plugins claiming one app is a configuration error, not a merge: they would disagree
        // about its label and its intents and only one of them could win.
        throw new Error(
          `Source '${definition.provider}' is registered by both '${owner}' and '${pluginId}'.`,
        );
      }
      seen.set(definition.provider, pluginId);
    }
    return new SourceCatalog(host.sources().map((entry) => entry.definition));
  }

  public all(): readonly SourceDefinition[] {
    return this.definitions;
  }

  public providers(): readonly string[] {
    return this.definitions.map((entry) => entry.provider);
  }

  /** The ones a person can actually connect: there is a hosted account to authorise. */
  public connectable(): readonly string[] {
    return this.definitions
      .filter((entry) => entry.toolkit !== undefined)
      .map((entry) => entry.provider);
  }

  public toolkitFor(provider: string): string | undefined {
    return this.byProvider.get(provider)?.toolkit;
  }

  /** Everything upstream speaks in slugs; this is the only place that translates back. */
  public providerForToolkit(slug: string): string | undefined {
    return this.byToolkit.get(slug.toLowerCase())?.provider;
  }

  public intentsFor(provider: string): readonly string[] {
    return this.byProvider.get(provider)?.intents ?? [];
  }
}
