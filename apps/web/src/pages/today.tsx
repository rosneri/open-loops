import { useCallback, useEffect, useState } from 'react';
import type { LoopDto, TodayDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { useAsyncAction } from '../hooks/use-async-action.js';
import { DayHeader } from '../components/day-header.js';
import { ErrorPanel } from '../components/error-panel.js';
import { LoopRow } from '../components/loop-row.js';
import { Timeline } from '../components/timeline.js';

export function TodayPage(): React.ReactElement {
  const [view, setView] = useState<TodayDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setView(await api.today());
      setLoadError(undefined);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const action = useAsyncAction(load);

  useEffect(() => {
    void load();
  }, [load]);

  if (view === undefined) {
    return loadError === undefined ? (
      <p className="text-sm text-chalk-500">Loading the day…</p>
    ) : (
      <ErrorPanel message={loadError} />
    );
  }

  const deferred = view.items.filter((item) => item.disposition === 'DEFERRED');
  const planned = view.items.filter((item) => item.disposition !== 'DEFERRED');

  const rows = (items: readonly LoopDto[]): React.ReactElement[] =>
    items.map((item) => (
      <LoopRow
        key={item.id}
        item={item}
        now={view.now}
        timeZone={view.timeZone}
        busy={action.busy}
        onCommand={(id, command) => void action.run(async () => await api.command(id, command))}
      />
    ));

  return (
    <div className="space-y-10">
      <DayHeader
        view={view}
        busy={action.busy}
        onRebalance={() => void action.run(api.rebalance)}
        onTick={() => void action.run(api.tick)}
      />

      {action.error !== undefined && <ErrorPanel message={action.error} />}

      {view.items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <section>
            <SectionTitle>The day</SectionTitle>
            <Timeline
              items={planned}
              windowStartAt={view.windowStartAt}
              windowEndAt={view.windowEndAt}
              now={view.now}
              timeZone={view.timeZone}
            />
          </section>

          <section className="space-y-3">
            <SectionTitle>Loops</SectionTitle>
            {rows(planned)}
            {deferred.length > 0 && (
              <>
                <div className="pt-6">
                  <SectionTitle>Did not fit today</SectionTitle>
                </div>
                {rows(deferred)}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { readonly children: string }): React.ReactElement {
  return (
    <h2 className="mb-4 font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
      {children}
    </h2>
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
