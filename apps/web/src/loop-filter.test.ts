import { describe, expect, it } from 'vitest';
import type { LoopDto } from '@open-loops/contracts';
import { NO_FILTER, applyFilter, isFiltering, providersIn, toggleProvider } from './loop-filter.js';

const loop = (overrides: Partial<LoopDto> = {}): LoopDto => ({
  id: 'loop-1',
  title: 'Ship the invoice export',
  summary: 'Sam is waiting on the CSV',
  kind: 'PROMISE',
  status: 'OPEN',
  provider: 'SLACK',
  progress: 0,
  estimateMinutes: 30,
  slipCount: 0,
  isOverdue: false,
  criteria: [],
  ...overrides,
});

describe('filtering the day', () => {
  const items = [
    loop(),
    loop({
      id: 'loop-2',
      title: 'Review the auth PR',
      summary: 'Dana opened it on Tuesday',
      provider: 'GITHUB',
      counterparty: 'Dana',
    }),
    loop({
      id: 'loop-3',
      title: 'Reply to the vendor',
      summary: 'They asked about the renewal',
      provider: 'GMAIL',
    }),
  ];

  it('is not a filter until something is typed or picked', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(applyFilter(items, NO_FILTER)).toBe(items);
  });

  it('keeps only the picked providers', () => {
    expect(applyFilter(items, { query: '', providers: ['GITHUB', 'GMAIL'] }).map((i) => i.id)).toEqual([
      'loop-2',
      'loop-3',
    ]);
  });

  /** "sam csv" is two things about one loop, not a phrase anybody typed in that order. */
  it('requires every term, in any field and any order', () => {
    expect(applyFilter(items, { query: 'csv sam', providers: [] }).map((i) => i.id)).toEqual([
      'loop-1',
    ]);
    expect(applyFilter(items, { query: 'sam vendor', providers: [] })).toEqual([]);
  });

  it('ignores case and stray spacing', () => {
    expect(applyFilter(items, { query: '  AUTH   pr ', providers: [] }).map((i) => i.id)).toEqual([
      'loop-2',
    ]);
  });

  it('searches what the row shows: the counterparty and the criteria', () => {
    expect(applyFilter(items, { query: 'dana', providers: [] }).map((i) => i.id)).toEqual(['loop-2']);
    const withCriterion = [
      loop({ id: 'loop-4', criteria: [{ id: 'c1', role: 'DELIVERABLE', label: 'A merged PR', satisfied: false }] }),
    ];
    expect(applyFilter(withCriterion, { query: 'merged', providers: [] })).toHaveLength(1);
  });

  it('narrows by provider and text together', () => {
    expect(applyFilter(items, { query: 'the', providers: ['GITHUB'] }).map((i) => i.id)).toEqual([
      'loop-2',
    ]);
  });

  it('counts the providers actually present, busiest first', () => {
    expect(providersIn([...items, loop({ id: 'loop-5', provider: 'GITHUB' })])).toEqual([
      { provider: 'GITHUB', count: 2 },
      { provider: 'GMAIL', count: 1 },
      { provider: 'SLACK', count: 1 },
    ]);
  });

  it('toggles a provider in and back out', () => {
    const once = toggleProvider(NO_FILTER, 'SLACK');
    expect(once.providers).toEqual(['SLACK']);
    expect(toggleProvider(once, 'SLACK').providers).toEqual([]);
  });
});
