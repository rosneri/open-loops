import { describe, expect, it } from 'vitest';
import { SourceProvider, asInstant } from '@open-loops/kernel';
import { screenSignals } from './ingestion.js';
import type { Signal } from './signal.js';
import { SignalKind } from './signal.js';

const NOW = asInstant(1_000_000_000);

const signal = (overrides: Partial<Signal> = {}): Signal => ({
  provider: SourceProvider.Slack,
  externalId: 'C1/1.1',
  kind: SignalKind.ChatMessage,
  title: 'can you take this',
  body: 'need the PR today',
  author: { displayName: 'Dana', isMe: false },
  participants: [],
  occurredAt: NOW,
  isDirectedAtMe: true,
  ...overrides,
});

describe('screenSignals', () => {
  it('accepts a well-formed signal', () => {
    const report = screenSignals({ signals: [signal()], now: NOW });
    expect(report.accepted).toHaveLength(1);
    expect(report.rejected).toHaveLength(0);
  });

  it('drops duplicates inside a single batch', () => {
    const report = screenSignals({ signals: [signal(), signal()], now: NOW });
    expect(report.accepted).toHaveLength(1);
    expect(report.rejected[0]?.reason).toMatch(/duplicate/);
  });

  it('rejects signals from the future', () => {
    const report = screenSignals({
      signals: [signal({ occurredAt: asInstant(NOW + 60 * 60 * 1000) })],
      now: NOW,
    });
    expect(report.accepted).toHaveLength(0);
  });

  it('rejects a signal with neither title nor body', () => {
    const report = screenSignals({ signals: [signal({ title: ' ', body: '' })], now: NOW });
    expect(report.rejected[0]?.reason).toBe('empty');
  });
});
