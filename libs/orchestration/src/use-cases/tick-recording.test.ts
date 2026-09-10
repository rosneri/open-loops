import { describe, expect, it } from 'vitest';
import type { Clock, Logger } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { ActivityRunDto } from '@open-loops/contracts';
import { RunTickUseCase } from './run-tick.use-case.js';

const NOW = 1_800_000_000_000;
const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
const clock: Clock = {
  now: () => asInstant(NOW),
  startOfDay: (instant) => instant,
  dayKey: () => '2027-01-15' as ReturnType<Clock['dayKey']>,
};

const tickWith = (input: {
  record?: (run: ActivityRunDto) => Promise<void>;
  extractThrows?: boolean;
}) => {
  const recorded: ActivityRunDto[] = [];
  const tick = new RunTickUseCase({
    ownerId: 'owner-1',
    runId: () => 'run-1',
    toolCalls: () => [
      { slug: 'GITHUB_LIST_NOTIFICATIONS', logId: 'log_1', ok: true, at: NOW, intent: 'list them' },
    ],
    runs: {
      record: async (run) => {
        recorded.push(run);
        await input.record?.(run);
      },
      list: () => Promise.resolve([]),
      findById: () => Promise.resolve(undefined),
    },
    integrations: { adoptUpstream: () => Promise.resolve([]) } as never,
    prune: {
      execute: () =>
        Promise.resolve({
          pruned: 1,
          providers: ['GITHUB'],
          entries: [
            { loopId: 'l-9', title: 'Old PR', provider: 'GITHUB', externalId: 'gh-9' },
          ],
          keptAsHistory: 4,
        }),
    } as never,
    sync: {
      execute: () =>
        Promise.resolve({
          fetched: 3,
          perProvider: { GITHUB: 3 },
          failures: [],
          pushed: ['RISEUP'],
        }),
    } as never,
    extract: {
      execute: () =>
        input.extractThrows === true
          ? Promise.reject(new Error('no model key'))
          : Promise.resolve({
              signalsRead: 3,
              loopsCreated: 1,
              loopsSkipped: 1,
              loopsRestated: 1,
              created: [
                { loopId: 'l-1', title: 'Setup the devops', provider: 'NOTION', externalId: 'p1' },
              ],
              restated: [
                { loopId: 'l-2', title: 'Renamed thing', provider: 'NOTION', externalId: 'p2' },
              ],
              skippedReasons: [{ sourceExternalId: 'p3', reason: 'confidence 0.20 is below 0.45' }],
            }),
    } as never,
    reconcile: { execute: () => Promise.resolve({ checked: 0, probesRun: 0, closed: 0, awaitingAcknowledgement: 0 }) } as never,
    rebalance: { execute: () => Promise.resolve({ blocks: [], deferred: 0 }) } as never,
    steps: [],
    clock,
    logger,
  });
  return { tick, recorded };
};

describe('what a sweep writes down about itself', () => {
  it('records the entries behind every count, not just the counts', async () => {
    const { tick, recorded } = tickWith({});

    await tick.execute();

    const [run] = recorded;
    expect(run?.id).toBe('run-1');
    expect(run?.detail.created.map((entry) => entry.title)).toEqual(['Setup the devops']);
    expect(run?.detail.restated.map((entry) => entry.title)).toEqual(['Renamed thing']);
    expect(run?.detail.pruned.map((entry) => entry.title)).toEqual(['Old PR']);
    expect(run?.detail.keptAsHistory).toBe(4);
    // Why something was passed over is the question a count of "skipped" always provokes.
    expect(run?.detail.skipped[0]?.reason).toContain('below');
    expect(run?.detail.fetchedPerProvider).toEqual({ GITHUB: 3 });
    expect(run?.detail.pushProviders).toEqual(['RISEUP']);
    // The broker's own log id, which is what makes a bad call checkable on their side.
    expect(run?.detail.toolCalls[0]?.logId).toBe('log_1');
  });

  /** A step that threw is exactly the run somebody opens the log to look at. */
  it('still records a run whose step failed, with the failure in it', async () => {
    const { tick, recorded } = tickWith({ extractThrows: true });

    const report = await tick.execute();

    expect(report.failures[0]?.source).toBe('extract');
    expect(recorded[0]?.report.failures[0]?.error).toBe('no model key');
    // The step that never ran contributes empty lists rather than breaking the record.
    expect(recorded[0]?.detail.created).toEqual([]);
  });

  /**
   * The record describes the sweep; it is not part of it. A store that is down loses the
   * description and nothing else.
   */
  it('does not fail the tick when it cannot be written down', async () => {
    const { tick } = tickWith({
      record: () => Promise.reject(new Error('database asleep')),
    });

    await expect(tick.execute()).resolves.toMatchObject({ loopsCreated: 1 });
  });
});
