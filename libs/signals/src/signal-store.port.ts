import type { Instant } from '@open-loops/kernel';
import type { Signal } from './signal.js';

/**
 * Signals are the model's working memory and our audit trail. The store is append-only by
 * contract: a sync that overlaps its own window must be a no-op, never a source of duplicates.
 */
export interface SignalStore {
  append(signals: readonly Signal[]): Promise<number>;
  listUnprocessed(limit: number): Promise<readonly Signal[]>;
  listRecent(input: { since: Instant; limit: number }): Promise<readonly Signal[]>;
  markProcessed(keys: readonly string[]): Promise<void>;
  pruneBefore(cutoff: Instant): Promise<number>;
}

/** Per-provider high-water mark, so a sync only ever asks for what it has not already seen. */
export interface SyncCursorStore {
  get(provider: string): Promise<Instant | undefined>;
  set(input: { provider: string; at: Instant }): Promise<void>;
}
