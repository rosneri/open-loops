import type { Logger } from '@open-loops/kernel';
import { ALL_SOURCE_PROVIDERS } from '@open-loops/kernel';
import type { FetchSignalsInput, FetchSignalsResult, SourceConnector } from '@open-loops/signals';

/**
 * Local mode inverts the direction of the data half. There are no API keys and no OAuth: an AI
 * client that already holds the user's sessions pushes signals into `POST /api/agent/ingest`.
 * This connector therefore has nothing to pull — it exists so that nothing above it needs to
 * know which mode the app is running in.
 */
export class LocalAgentSourceConnector implements SourceConnector {
  public readonly supports = ALL_SOURCE_PROVIDERS;

  public constructor(private readonly logger: Logger) {}

  public fetchSignals(input: FetchSignalsInput): Promise<FetchSignalsResult> {
    this.logger.debug('local mode: signals arrive by push, not by pull', {
      provider: input.provider,
    });
    return Promise.resolve({ signals: [], cursor: input.since });
  }
}
