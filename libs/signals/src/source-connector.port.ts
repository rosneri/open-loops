import type { Instant, SourceProvider } from '@open-loops/kernel';
import type { Signal } from './signal.js';

export interface FetchSignalsInput {
  readonly provider: SourceProvider;
  readonly since: Instant;
  readonly limit: number;
}

export interface FetchSignalsResult {
  readonly signals: readonly Signal[];
  readonly cursor: Instant;
}

/**
 * The data-acquisition port — the half of the system that is allowed to touch the outside
 * world and forbidden to interpret it. Exactly one strategy is bound per run: Composio when
 * hosted, the local agent's push when local.
 */
export interface SourceConnector {
  readonly supports: readonly SourceProvider[];
  fetchSignals(input: FetchSignalsInput): Promise<FetchSignalsResult>;
}
