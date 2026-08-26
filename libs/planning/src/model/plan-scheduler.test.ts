import { describe, expect, it } from 'vitest';
import { asInstant, asMinutes } from '@open-loops/kernel';
import { asWorkRef } from './ids.js';
import type { PlanCandidate } from './plan-candidate.js';
import type { PlanWindow, RebalanceInput } from './plan-scheduler.js';
import { rebalance } from './plan-scheduler.js';
import { BlockDisposition } from './planned-block.js';

const DAY_START = asInstant(Date.UTC(2026, 0, 5, 0, 0, 0));
const at = (hour: number, minute = 0): number => DAY_START + (hour * 60 + minute) * 60_000;

const WINDOW: PlanWindow = {
  dayStartAt: DAY_START,
  startMinute: asMinutes(9 * 60),
  endMinute: asMinutes(18 * 60),
};

const candidate = (input: Partial<PlanCandidate> & { id: string }): PlanCandidate => ({
  ref: asWorkRef(input.id),
  estimate: input.estimate ?? asMinutes(60),
  weight: input.weight ?? 50,
  isOverdue: input.isOverdue ?? false,
  awaitingOnlyAcknowledgement: input.awaitingOnlyAcknowledgement ?? false,
  isStarted: input.isStarted ?? false,
  isExternalRequest: input.isExternalRequest ?? false,
  ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
});

const input = (overrides: Partial<RebalanceInput>): RebalanceInput => ({
  now: asInstant(at(9)),
  window: WINDOW,
  candidates: [],
  busy: [],
  previous: [],
  manualOrder: new Map(),
  ...overrides,
});

describe('rebalance', () => {
  it('packs blocks back to back from the start of the window', () => {
    const blocks = rebalance(
      input({ candidates: [candidate({ id: 'a' }), candidate({ id: 'b', estimate: asMinutes(30) })] }),
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.range.startAt).toBe(at(9));
    expect(blocks[1]?.range.startAt).toBe(at(10));
    expect(blocks[1]?.range.endAt).toBe(at(10, 30));
  });

  it('never places work before now', () => {
    const blocks = rebalance(input({ now: asInstant(at(14, 20)), candidates: [candidate({ id: 'a' })] }));
    expect(blocks[0]?.range.startAt).toBe(at(14, 20));
  });

  it('schedules around meetings rather than over them', () => {
    const blocks = rebalance(
      input({
        candidates: [candidate({ id: 'a' })],
        busy: [{ startAt: asInstant(at(9)), endAt: asInstant(at(10)), label: 'standup' }],
      }),
    );
    expect(blocks[0]?.range.startAt).toBe(at(10));
  });

  it('lets an overdue item jump the queue regardless of weight', () => {
    const blocks = rebalance(
      input({
        candidates: [
          candidate({ id: 'calm', weight: 99 }),
          candidate({ id: 'late', weight: 1, isOverdue: true }),
        ],
      }),
    );
    expect(blocks[0]?.ref).toBe('late');
  });

  it('puts a two-minute "tell them" above a fresh task', () => {
    const blocks = rebalance(
      input({
        candidates: [
          candidate({ id: 'task', weight: 70 }),
          candidate({ id: 'tell', weight: 10, awaitingOnlyAcknowledgement: true }),
        ],
      }),
    );
    expect(blocks[0]?.ref).toBe('tell');
  });

  it('pushes an unfinished block down an hour later and counts the slip', () => {
    const first = rebalance(input({ candidates: [candidate({ id: 'a' }), candidate({ id: 'b' })] }));
    expect(first[0]?.slipCount).toBe(0);

    const later = rebalance(
      input({
        now: asInstant(at(10, 30)),
        candidates: [candidate({ id: 'a' }), candidate({ id: 'b' })],
        previous: first,
      }),
    );
    const moved = later.find((block) => block.ref === 'a');
    expect(moved?.range.startAt).toBe(at(10, 30));
    expect(moved?.slipCount).toBe(1);
  });

  it('lets a manual drag beat the computed score', () => {
    const blocks = rebalance(
      input({
        candidates: [candidate({ id: 'late', isOverdue: true }), candidate({ id: 'chosen' })],
        manualOrder: new Map([[asWorkRef('chosen'), 0]]),
      }),
    );
    expect(blocks[0]?.ref).toBe('chosen');
  });

  it('defers work that runs past the end of the day instead of dropping it', () => {
    const blocks = rebalance(
      input({
        now: asInstant(at(17)),
        candidates: [candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })],
      }),
    );
    expect(blocks).toHaveLength(3);
    expect(blocks.filter((block) => block.disposition === BlockDisposition.Deferred)).toHaveLength(2);
  });

  it('keeps a pinned block in its slot and flows everything else around it', () => {
    const pinned = rebalance(input({ candidates: [candidate({ id: 'pinned' })] })).map((block) => ({
      ...block,
      pinned: true,
      range: { startAt: asInstant(at(15)), endAt: asInstant(at(16)) },
    }));
    const blocks = rebalance(
      input({
        candidates: [candidate({ id: 'pinned' }), candidate({ id: 'other', isOverdue: true })],
        previous: pinned,
      }),
    );
    expect(blocks.find((block) => block.ref === 'pinned')?.range.startAt).toBe(at(15));
    expect(blocks.find((block) => block.ref === 'other')?.range.startAt).toBe(at(9));
  });
});
