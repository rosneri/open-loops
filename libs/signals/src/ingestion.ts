import { DomainError, type Instant } from '@open-loops/kernel';
import type { Signal } from './signal.js';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface IngestionReport {
  readonly accepted: readonly Signal[];
  readonly rejected: readonly { readonly key: string; readonly reason: string }[];
}

/**
 * Everything that arrives from outside passes through here first. It is deliberately dumb —
 * shape and plausibility only — because deciding what a signal *means* is the reasoning half's
 * job, and mixing the two is how ingestion pipelines rot.
 */
export const screenSignals = (input: {
  signals: readonly Signal[];
  now: Instant;
}): IngestionReport => {
  const accepted: Signal[] = [];
  const rejected: { key: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const signal of input.signals) {
    const key = `${signal.provider}:${signal.externalId}`;
    const reason = reject({ signal, now: input.now, seen, key });
    if (reason === undefined) {
      seen.add(key);
      accepted.push(signal);
    } else {
      rejected.push({ key, reason });
    }
  }

  return { accepted, rejected };
};

const reject = (input: {
  signal: Signal;
  now: Instant;
  seen: ReadonlySet<string>;
  key: string;
}): string | undefined => {
  const { signal } = input;
  if (signal.externalId.trim().length === 0) return 'missing externalId';
  if (input.seen.has(input.key)) return 'duplicate within the same batch';
  if (signal.occurredAt > input.now + MAX_FUTURE_SKEW_MS) return 'occurs in the future';
  if (signal.title.trim().length === 0 && signal.body.trim().length === 0) return 'empty';
  return undefined;
};

export const assertIngestable = (report: IngestionReport): void => {
  if (report.accepted.length === 0 && report.rejected.length > 0) {
    throw new DomainError('NO_INGESTABLE_SIGNALS', 'Every signal in the batch was rejected.');
  }
};
