import type { Clock, Logger, SourceProvider } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { IntegrationRepository } from '@open-loops/integrations';
import type { SignalStore, SourceConnector, SyncCursorStore } from '@open-loops/signals';

export interface SyncSourcesDeps {
  readonly integrations: IntegrationRepository;
  readonly cursors: SyncCursorStore;
  readonly signals: SignalStore;
  readonly connectors: readonly SourceConnector[];
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface SyncSourcesResult {
  readonly fetched: number;
  readonly perProvider: Readonly<Record<string, number>>;
  readonly failures: readonly { source: SourceProvider; error: string }[];
  /** Active sources nothing here pulls, because they arrive by push. Not failures. */
  readonly pushed: readonly SourceProvider[];
}

const LOOKBACK_MS = 72 * 60 * 60 * 1000;
const PAGE_SIZE = 200;

/**
 * Pulls fresh signals from every connected provider. This is the whole of the data-acquisition
 * half: no interpretation happens here, and one provider failing is isolated to that provider
 * rather than aborting the tick.
 */
export class SyncSourcesUseCase {
  public constructor(private readonly deps: SyncSourcesDeps) {}

  public async execute(): Promise<SyncSourcesResult> {
    const now = this.deps.clock.now();
    const active = await this.deps.integrations.listActive();
    const perProvider: Record<string, number> = {};
    const failures: { source: SourceProvider; error: string }[] = [];
    const pushed: SourceProvider[] = [];
    let fetched = 0;

    for (const integration of active) {
      const provider = integration.provider;
      /*
       * A source with no connector is not a broken source. Wispr Flow and RiseUp have no hosted
       * API to pull, so they arrive at /api/agent/ingest instead — and the push is what stamps
       * their last delivery. Sweeping them used to throw, which marked the integration FAILED
       * and put "No connector is bound for WISPR_FLOW" on its card once an hour.
       */
      if (this.connectorFor(provider) === undefined) {
        pushed.push(provider);
        continue;
      }

      try {
        const count = await this.syncOne({ provider, now });
        perProvider[provider] = count;
        fetched += count;
        integration.recordSync(now);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        integration.fail({ error: message });
        failures.push({ source: provider, error: message });
        this.deps.logger.warn('sync failed', { provider, error: message });
      }
      await this.deps.integrations.save(integration);
    }

    if (pushed.length > 0) this.deps.logger.debug('sources that arrive by push', { pushed });

    return { fetched, perProvider, failures, pushed };
  }

  private async syncOne(input: { provider: SourceProvider; now: number }): Promise<number> {
    const connector = this.connectorFor(input.provider);
    // The caller has already skipped the providers nothing pulls, so an absent one here is a
    // deployment that lost a connector between the two calls: a genuine failure, not a push.
    if (connector === undefined) throw new Error(`No connector is bound for ${input.provider}.`);
    const since =
      (await this.deps.cursors.get(input.provider)) ?? asInstant(input.now - LOOKBACK_MS);
    const result = await connector.fetchSignals({
      provider: input.provider,
      since,
      limit: PAGE_SIZE,
    });
    const appended = await this.deps.signals.append(result.signals);
    await this.deps.cursors.set({ provider: input.provider, at: result.cursor });
    return appended;
  }

  /** `undefined` where nothing in this deployment can pull that provider. */
  private connectorFor(provider: SourceProvider): SourceConnector | undefined {
    return this.deps.connectors.find((candidate) => candidate.supports.includes(provider));
  }
}
