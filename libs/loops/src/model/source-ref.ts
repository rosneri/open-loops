import type { Instant, SourceProvider } from '@open-loops/kernel';

/**
 * A pointer back to the exact place in the exact app the loop came from. `threadRef` is what
 * later lets us ask "did I ever actually reply in that thread".
 */
export interface SourceRef {
  readonly provider: SourceProvider;
  readonly externalId: string;
  readonly threadRef?: string;
  readonly url?: string;
  readonly channel?: string;
  readonly occurredAt: Instant;
}

export const sourceKey = (ref: Pick<SourceRef, 'provider' | 'externalId'>): string =>
  `${ref.provider}:${ref.externalId}`;
