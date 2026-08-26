import type { Clock, Logger } from '@open-loops/kernel';
import type { ConnectionMode, WriteOperation } from '@open-loops/integrations';
import {
  WriteOperation as Operation,
  assertAllowed,
  ingestionCapabilityFor,
} from '@open-loops/integrations';
import type { IngestResultDto } from '@open-loops/contracts';
import type { Signal, SignalStore } from '@open-loops/signals';
import { screenSignals } from '@open-loops/signals';

export interface IngestSignalsDeps {
  readonly signals: SignalStore;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface IngestSignalsInput {
  readonly signals: readonly Signal[];
  readonly mode: ConnectionMode;
  readonly operation?: WriteOperation;
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

    const report = screenSignals({ signals: input.signals, now: this.deps.clock.now() });
    const accepted = await this.deps.signals.append(report.accepted);
    if (report.rejected.length > 0) {
      this.deps.logger.warn('rejected signals', { count: report.rejected.length });
    }
    return { accepted, rejected: report.rejected };
  }
}
