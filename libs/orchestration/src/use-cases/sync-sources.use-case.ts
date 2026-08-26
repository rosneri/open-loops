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
  readonly failures: readonly { provider: SourceProvider; error: string }[];
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
    const failures: { provider: SourceProvider; error: string }[] = [];
    let fetched = 0;

    for (const integration of active) {
      const provider = integration.provider;
      try {
        const count = await this.syncOne({ provider, now });
        perProvider[provider] = count;
        fetched += count;
        integration.recordSync(now);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        integration.fail({ error: message });
        failures.push({ provider, error: message });
        this.deps.logger.warn('sync failed', { provider, error: message });
      }
      await this.deps.integrations.save(integration);
    }

    return { fetched, perProvider, failures };
  }

  private async syncOne(input: { provider: SourceProvider; now: number }): Promise<number> {
    const connector = this.connectorFor(input.provider);
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

  private connectorFor(provider: SourceProvider): SourceConnector {
    const connector = this.deps.connectors.find((candidate) =>
      candidate.supports.includes(provider),
    );
    if (connector === undefined) throw new Error(`No connector is bound for ${provider}.`);
    return connector;
  }
}
