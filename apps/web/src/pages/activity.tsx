import { useCallback, useEffect, useState } from 'react';
import type { ActivityRunDto, ActivityRunSummaryDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { useAsyncAction } from '../hooks/use-async-action.js';
import { ErrorPanel } from '../components/error-panel.js';
import { RunDetail } from '../components/run-detail.js';

const when = (at: number): string =>
  new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const took = (run: ActivityRunSummaryDto): string => {
  const seconds = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
  return seconds < 60 ? `${String(seconds)}s` : `${String(Math.round(seconds / 60))}m`;
};

/**
 * Every sweep this account has run. The counts are the same ones the tick returns; opening a run
 * loads what those counts were made of, because a number nobody can open is not evidence.
 */
export function ActivityPage(): React.ReactElement {
  const [runs, setRuns] = useState<readonly ActivityRunSummaryDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | undefined>();
  const [detail, setDetail] = useState<ActivityRunDto | undefined>();

  const load = useCallback(async () => {
    try {
      setRuns(await api.activity());
    } finally {
      setLoaded(true);
    }
  }, []);

  const action = useAsyncAction(load);

  useEffect(() => {
    void action.run(async () => {
      /* the reload in useAsyncAction is the whole job here */
    });
  }, []);

  const toggle = useCallback(
    (id: string): void => {
      if (open === id) {
        setOpen(undefined);
        setDetail(undefined);
        return;
      }
      setOpen(id);
      setDetail(undefined);
      void action.run(async () => {
        setDetail(await api.activityRun(id));
      });
    },
    [open, action],
  );

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Activity</h1>
        <p className="mt-3 text-sm leading-relaxed text-chalk-500">
          One row per sweep. Open one to see what it actually did — which loops it made, which it
          restated, what it skipped and why, and every call it made upstream with the broker's own
          log id, so a run that went wrong can be looked at rather than guessed about.
        </p>
      </header>

      {action.error !== undefined && <ErrorPanel message={action.error} />}

      {loaded && runs.length === 0 && (
        <p className="text-sm text-chalk-500">
          No sweeps recorded yet. Run one from Today and it will show up here.
        </p>
      )}

      <div className="space-y-2">
        {runs.map((run) => (
          <div key={run.id} className="hairline rounded-lg bg-ink-900/60">
            <button
              type="button"
              onClick={() => {
                toggle(run.id);
              }}
              className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="flex items-baseline gap-3">
                <span
                  className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                    run.failed ? 'text-signal-unconfirmed' : 'text-signal-done'
                  }`}
                >
                  {run.failed ? `${String(run.failureCount)} failed` : 'ok'}
                </span>
                <span className="text-[13px]">{when(run.startedAt)}</span>
                <span className="font-mono text-[11px] text-chalk-600">{took(run)}</span>
              </span>
              <span className="font-mono text-[11px] text-chalk-600">
                {run.signalsFetched} in · {run.loopsCreated} new · {run.loopsRestated} restated ·{' '}
                {run.loopsPruned} pruned
              </span>
            </button>
            {open === run.id && (
              <div className="border-t border-ink-800 px-4 py-4">
                {detail === undefined ? (
                  <p className="text-[11px] text-chalk-600">Loading…</p>
                ) : (
                  <RunDetail run={detail} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
