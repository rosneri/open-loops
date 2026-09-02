import type { Probe, ProbeRunner } from '@open-loops/loops';
import { MANUAL_CONFIRMATION, manualConfirmation } from '@open-loops/loops';
import type { OwnerScope, ProbeDefinition, ProbeDraft } from '@open-loops/plugin-api';
import type { PluginHost } from './plugin-host.js';
import type { Registered } from './registrations.js';

/**
 * A scope belongs to one plugin and one person, so the catalog cannot be handed a single one:
 * two probe plugins with different capabilities must not end up holding the same object.
 */
export type ScopeFactory = (pluginId: string) => OwnerScope;

/**
 * Only its own kind, whatever the runner claims. A plugin author should not have to re-implement
 * `canRun` correctly for the registration to be safe, and a runner that answered for somebody
 * else's probe would be answering a question it does not understand.
 */
class KindScopedRunner implements ProbeRunner {
  public constructor(
    private readonly kind: string,
    private readonly inner: ProbeRunner,
  ) {}

  public canRun(probe: Probe): boolean {
    return probe.kind === this.kind && this.inner.canRun(probe);
  }

  public async run(request: Parameters<ProbeRunner['run']>[0]): ReturnType<ProbeRunner['run']> {
    return await this.inner.run(request);
  }
}

/**
 * What this deployment can check, assembled from whatever is installed. The extractor's prompt,
 * the list of kinds its schema will accept, the parse of what it proposed and the runners that
 * answer it all come from here — one list instead of four that could drift apart.
 */
export class ProbeCatalog {
  public constructor(private readonly registered: readonly Registered<ProbeDefinition>[]) {}

  public static from(host: PluginHost): ProbeCatalog {
    return new ProbeCatalog(host.probes());
  }

  private get definitions(): readonly ProbeDefinition[] {
    return this.registered.map((entry) => entry.definition);
  }

  /**
   * Always includes `MANUAL_CONFIRMATION`. It is the floor of the system: a deployment with no
   * probe plugins can still track a loop and let the person close it.
   */
  public kinds(): readonly string[] {
    return [...this.definitions.map((definition) => definition.kind), MANUAL_CONFIRMATION];
  }

  /** The probe half of the extractor's prompt, written by the kinds themselves. */
  public guide(): string {
    const lines = this.definitions.map(
      (definition) => `  ${definition.kind} — ${definition.prompt}`,
    );
    return [
      ...lines,
      `  ${MANUAL_CONFIRMATION} — nothing observable exists, or you cannot specify the probe.`,
    ].join('\n');
  }

  /**
   * Narrows the model's flat draft into a probe. A kind nobody claims, or one the model
   * under-specified, becomes a manual check rather than an unsatisfiable probe that would pin
   * the loop open forever.
   */
  public toProbe(draft: ProbeDraft): Probe {
    const definition = this.definitions.find((candidate) => candidate.kind === draft.kind);
    const params = definition?.build(draft);
    if (definition === undefined || params === undefined) {
      return manualConfirmation(draft.describedAs);
    }

    const provider = definition.provider?.(draft) ?? draft.provider;
    return {
      kind: definition.kind,
      describedAs: draft.describedAs,
      ...(provider === undefined ? {} : { provider }),
      params,
    };
  }

  /**
   * Who can answer anything, for this account. A definition returning `undefined` means this
   * deployment cannot check that kind — no key, wrong mode — and the reconciler is then left
   * with no evidence rather than a guess.
   */
  public runners(scopeFor: ScopeFactory): readonly ProbeRunner[] {
    const runners: ProbeRunner[] = [];
    for (const { pluginId, definition } of this.registered) {
      if (definition.runner === undefined) continue;
      const runner = definition.runner(scopeFor(pluginId));
      if (runner !== undefined) runners.push(new KindScopedRunner(definition.kind, runner));
    }
    return runners;
  }
}
