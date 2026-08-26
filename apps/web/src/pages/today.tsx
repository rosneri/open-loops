import { useCallback, useEffect, useState } from 'react';
import type { TodayDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { LoopRow } from '../components/loop-row.js';
import { Timeline } from '../components/timeline.js';

const SUMMARY = [
  { status: 'OPEN', label: 'open' },
  { status: 'IN_PROGRESS', label: 'in progress' },
  { status: 'DONE_UNCONFIRMED', label: 'done, not told' },
  { status: 'DONE', label: 'closed' },
] as const;

export function TodayPage(): React.ReactElement {
  const [view, setView] = useState<TodayDto | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await api.today());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (error !== undefined && view === undefined) return <ErrorPanel message={error} />;
  if (view === undefined) return <p className="text-sm text-chalk-500">Loading the day…</p>;

  const deferred = view.items.filter((item) => item.disposition === 'DEFERRED');
  const planned = view.items.filter((item) => item.disposition !== 'DEFERRED');

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
            {view.day}
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight">Today</h1>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          {SUMMARY.map((entry) => (
            <div key={entry.status} className="text-right">
              <p className="font-mono text-xl text-chalk-100">{view.counts[entry.status]}</p>
              <p className="font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase">
                {entry.label}
              </p>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(api.rebalance)}
              className="rounded border border-ink-700 px-3 py-1.5 text-xs text-chalk-500 transition hover:text-chalk-100 disabled:opacity-40"
            >
              Re-plan
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(api.tick)}
              className="rounded border border-chalk-600 px-3 py-1.5 text-xs text-chalk-100 transition hover:bg-ink-800 disabled:opacity-40"
            >
              {busy ? 'Checking…' : 'Run check now'}
            </button>
          </div>
        </div>
      </section>

      {error !== undefined && <ErrorPanel message={error} />}

      {view.items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <section>
            <h2 className="mb-4 font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
              The day
            </h2>
            <Timeline
              items={planned}
              windowStartAt={view.windowStartAt}
              windowEndAt={view.windowEndAt}
              now={view.now}
              timeZone={view.timeZone}
            />
          </section>

          <section className="space-y-3">
            <h2 className="mb-4 font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
              Loops
            </h2>
            {planned.map((item) => (
              <LoopRow
                key={item.id}
                item={item}
                now={view.now}
                timeZone={view.timeZone}
                busy={busy}
                onCommand={(id, command) => void run(() => api.command(id, command))}
              />
            ))}

            {deferred.length > 0 && (
              <>
                <h2 className="pt-6 font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
                  Did not fit today
                </h2>
                {deferred.map((item) => (
                  <LoopRow
                    key={item.id}
                    item={item}
                    now={view.now}
                    timeZone={view.timeZone}
                    busy={busy}
                    onCommand={(id, command) => void run(() => api.command(id, command))}
                  />
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="hairline rounded-lg bg-ink-900/40 px-8 py-16 text-center">
      <p className="text-sm text-chalk-300">No open loops yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-chalk-600">
        Connect a source on the Integrations screen, then run a check. In local mode, point your
        AI client at <code className="font-mono text-chalk-300">POST /api/agent/ingest</code> and
        push signals in.
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }): React.ReactElement {
  return (
    <div className="hairline rounded-lg border-signal-unconfirmed/40 bg-ink-900/60 px-5 py-4">
      <p className="font-mono text-[11px] tracking-[0.14em] text-signal-unconfirmed uppercase">
        Something failed
      </p>
      <p className="mt-1 font-mono text-[12px] break-all text-chalk-500">{message}</p>
    </div>
  );
}
