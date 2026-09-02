import type { Logger, SourceProvider } from '@open-loops/kernel';
import type { FetchSignalsInput, FetchSignalsResult, SourceConnector } from '@open-loops/signals';

/**
 * Local mode inverts the direction of the data half. There are no API keys and no OAuth: an AI
 * client that already holds the user's sessions pushes signals into `POST /api/agent/ingest`.
 * This connector therefore has nothing to pull — it exists so that nothing above it needs to
 * know which mode the app is running in.
 */
export class LocalAgentSourceConnector implements SourceConnector {
  /**
   * Everything the installed source plugins named. In local mode the agent can push whatever it
   * can see, so the honest answer is "all of them" — but "all of them" is now a registry rather
   * than a constant, and a deployment with fewer plugins genuinely supports fewer providers.
   */
  public readonly supports: readonly SourceProvider[];

  public constructor(
    private readonly logger: Logger,
    supports: readonly SourceProvider[],
  ) {
    this.supports = supports;
  }

  public fetchSignals(input: FetchSignalsInput): Promise<FetchSignalsResult> {
    this.logger.debug('local mode: signals arrive by push, not by pull', {
      provider: input.provider,
    });
    return Promise.resolve({ signals: [], cursor: input.since });
  }
}
