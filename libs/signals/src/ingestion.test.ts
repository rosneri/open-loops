import { describe, expect, it } from 'vitest';
import { SourceProvider, asInstant } from '@open-loops/kernel';
import { screenSignals } from './ingestion.js';
import type { Signal } from './signal.js';
import { SignalKind, signalChanged } from './signal.js';

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

  /**
   * There is no catch-all provider to file a stranger under any more: a name no plugin claims
   * comes back saying so, which is the only answer that lets the agent fix its push.
   */
  it('refuses a provider no installed plugin claims, and says which', () => {
    const known = new Set([SourceProvider.Slack, 'WISPR_FLOW']);
    const report = screenSignals({
      signals: [signal(), signal({ provider: 'SUPERHUMAN', externalId: 'sh/1' })],
      now: NOW,
      known,
    });

    expect(report.accepted).toHaveLength(1);
    expect(report.rejected[0]?.reason).toBe('no source plugin claims the provider SUPERHUMAN');
  });

  /** Connectors only ever produce providers from the catalogue, so they pass no list at all. */
  it('accepts any provider when it is not told which exist', () => {
    const report = screenSignals({ signals: [signal({ provider: 'ANYTHING' })], now: NOW });
    expect(report.accepted).toHaveLength(1);
  });
});

describe('deciding whether a re-fetched signal says anything new', () => {
  const signal: Signal = {
    provider: 'NOTION',
    externalId: 'page-1',
    kind: SignalKind.Issue,
    title: 'Setup the devops',
    body: 'Status: Hold / In review',
    author: { displayName: 'Neriya Rosner', isMe: true },
    participants: [],
    occurredAt: asInstant(1_700_000_000_000),
    isDirectedAtMe: true,
  };
  const stored = {
    title: signal.title,
    body: signal.body,
    kind: signal.kind,
    isDirectedAtMe: signal.isDirectedAtMe,
    occurredAt: signal.occurredAt,
  };

  /** Every sweep re-reads the same pages; treating that as news would re-extract all of them. */
  it('says no when the re-fetch is identical', () => {
    expect(signalChanged(signal, stored)).toBe(false);
  });

  it('says yes when the title moved — a rename, or a normaliser that got better', () => {
    expect(signalChanged(signal, { ...stored, title: 'Item' })).toBe(true);
  });

  it('says yes when it became mine to do', () => {
    expect(signalChanged(signal, { ...stored, isDirectedAtMe: false })).toBe(true);
  });

  it('says yes when the time it happened was wrong', () => {
    expect(signalChanged(signal, { ...stored, occurredAt: 1 })).toBe(true);
  });
});
