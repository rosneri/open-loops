import type { HydrateDefinition, OwnerScope, SourceDefinition } from '@open-loops/plugin-api';
import type { PluginHost } from './plugin-host.js';

/**
 * Which apps this deployment knows about, assembled from whatever source plugins are installed.
 * The Integrations screen enumerates this, the sync layer reads its intents from it, and the
 * connection broker translates toolkit slugs through it — one list instead of three.
 */
export class SourceCatalog {
  private readonly byProvider: ReadonlyMap<string, SourceDefinition>;
  private readonly byToolkit: ReadonlyMap<string, SourceDefinition>;

  public constructor(
    private readonly definitions: readonly SourceDefinition[],
    /**
     * Which plugin registered each provider. Only `focus` needs it — a narrowing is read out of
     * that plugin's own settings, so the scope it runs on has to be that plugin's.
     */
    private readonly owners: ReadonlyMap<string, string> = new Map(),
  ) {
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
    return new SourceCatalog(
      host.sources().map((entry) => entry.definition),
      new Map(host.sources().map((entry) => [entry.definition.provider, entry.pluginId])),
    );
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

  /** Every toolkit slug this deployment knows about — what a Composio session is built over. */
  public toolkits(): readonly string[] {
    return this.definitions
      .map((entry) => entry.toolkit)
      .filter((slug): slug is string => slug !== undefined);
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

  /** How to expand a listed row into its body, where the source says one call is not enough. */
  public hydrateFor(provider: string): HydrateDefinition | undefined {
    return this.byProvider.get(provider)?.hydrate;
  }

  /**
   * This owner's narrowing for one provider, or `undefined` where the source declares none, the
   * person has not asked for one, or asking failed. A narrowing that cannot be read must not
   * fail the sync: the honest fallback is the unnarrowed intent, which is what the app did
   * before anybody could narrow it.
   */
  public async focusFor(
    provider: string,
    scopeFor: (pluginId: string) => OwnerScope,
  ): Promise<string | undefined> {
    const definition = this.byProvider.get(provider);
    const pluginId = this.owners.get(provider);
    if (definition?.focus === undefined || pluginId === undefined) return undefined;

    const scope = scopeFor(pluginId);
    try {
      return await definition.focus(scope);
    } catch (error) {
      scope.logger.warn('source focus could not be read', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}
