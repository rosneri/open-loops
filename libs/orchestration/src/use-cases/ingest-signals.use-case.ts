import type { Clock, IdGenerator, Instant, Logger, SourceProvider } from '@open-loops/kernel';
import type { ConnectionMode, IntegrationRepository, WriteOperation } from '@open-loops/integrations';
import {
  ConnectionMode as Mode,
  Integration,
  WriteOperation as Operation,
  asIntegrationId,
  assertAllowed,
  ingestionCapabilityFor,
} from '@open-loops/integrations';
import type { IngestResultDto } from '@open-loops/contracts';
import type { Signal, SignalStore } from '@open-loops/signals';
import { screenSignals } from '@open-loops/signals';

export interface IngestSignalsDeps {
  readonly signals: SignalStore;
  /**
   * A push is the only evidence a push-delivered source is alive: there is no consent screen to
   * complete for RiseUp and nothing pulls it on a schedule, so without this the Integrations
   * screen calls a source that delivered a meeting recap this morning "disconnected" forever.
   */
  readonly integrations: IntegrationRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface IngestSignalsInput {
  readonly signals: readonly Signal[];
  readonly mode: ConnectionMode;
  readonly operation?: WriteOperation;
  /** The providers this deployment knows. Omitted where the caller has already checked. */
  readonly known?: ReadonlySet<string>;
}

/**
 * The write door for pushed data — used by the local AI client, which already holds the user's
 * sessions and therefore needs no OAuth at all. The capability check happens here and nowhere
 * else: a hosted connector may only append, while the local agent may also correct itself.
 */
export class IngestSignalsUseCase {
  public constructor(private readonly deps: IngestSignalsDeps) {}

  public async execute(input: IngestSignalsInput): Promise<IngestResultDto> {
    assertAllowed({
      capability: ingestionCapabilityFor(input.mode),
      operation: input.operation ?? Operation.Create,
    });

    const now = this.deps.clock.now();
    const report = screenSignals({ signals: input.signals, now, known: input.known });
    const accepted = await this.deps.signals.append(report.accepted);
    if (report.rejected.length > 0) {
      this.deps.logger.warn('rejected signals', { count: report.rejected.length });
    }

    // Only what was actually stored counts as a delivery. A batch that was screened out entirely
    // is a source that tried and failed, which is not something to report as a healthy sync.
    await this.markDelivered(report.accepted.map((signal) => signal.provider), now);

    return { accepted, rejected: report.rejected };
  }

  /** One integration per distinct provider in the batch, marked live at the same instant. */
  private async markDelivered(providers: readonly SourceProvider[], at: Instant): Promise<void> {
    for (const provider of new Set(providers)) {
      const integration =
        (await this.deps.integrations.findByProvider(provider)) ??
        Integration.declare({
          id: asIntegrationId(this.deps.ids.next()),
          provider,
          mode: Mode.LocalAgent,
        });
      integration.receiveDelivery({ at, mode: Mode.LocalAgent });
      await this.deps.integrations.save(integration);
    }
  }
}
