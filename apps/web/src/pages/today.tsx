import { useCallback, useEffect, useState } from 'react';
import type { LoopDto, TodayDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { useAsyncAction } from '../hooks/use-async-action.js';
import { DayHeader } from '../components/day-header.js';
import { ErrorPanel } from '../components/error-panel.js';
import { LoopFilterBar } from '../components/loop-filter-bar.js';
import { LoopRow } from '../components/loop-row.js';
import { Timeline } from '../components/timeline.js';
import { NO_FILTER, applyFilter, isFiltering, type LoopFilter } from '../loop-filter.js';

export function TodayPage(): React.ReactElement {
  const [view, setView] = useState<TodayDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  /**
   * Kept here rather than in the URL or on the server: it is a way of reading the list you
   * already have, and it should not survive a reload the way a saved view would.
   */
  const [filter, setFilter] = useState<LoopFilter>(NO_FILTER);

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

  /*
   * Filtered before the day is split, so the timeline and the list agree about what is being
   * looked at: a calendar showing blocks for loops that are not in the list below it is worse
   * than one that empties out with them.
   */
  const shown = applyFilter(view.items, filter);
  const deferred = shown.filter((item) => item.disposition === 'DEFERRED');
  const planned = shown.filter((item) => item.disposition !== 'DEFERRED');

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

      {view.items.length > 0 && (
        <LoopFilterBar
          items={view.items}
          value={filter}
          onChange={setFilter}
          shown={shown.length}
        />
      )}

      {view.items.length === 0 ? (
        <EmptyState />
      ) : shown.length === 0 ? (
        <NothingMatches
          onClear={() => {
            setFilter(NO_FILTER);
          }}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
          {/*
           * Both children carry `min-w-0`, because a grid item's default `min-width: auto`
           * refuses to shrink past its longest unbreakable word: one long title in one loop row
           * widens the shared track and the whole page scrolls sideways.
           */}
          <TimelineSection
            items={planned}
            windowStartAt={view.windowStartAt}
            windowEndAt={view.windowEndAt}
            now={view.now}
            timeZone={view.timeZone}
          />

          <section className="order-2 min-w-0 space-y-3 lg:order-none">
            <SectionTitle>{isFiltering(filter) ? 'Matching loops' : 'Loops'}</SectionTitle>
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

/**
 * The calendar is the anchor of the desktop layout and neither end of a phone screen suits it:
 * above the loops it is most of a viewport of scrolling before the first thing you can act on,
 * and below sixteen of them it is unreachable. So on a phone it is a closed disclosure sitting
 * where it belongs in the reading order, and from `lg` it is the column it has always been.
 */
function TimelineSection(props: {
  readonly items: readonly LoopDto[];
  readonly windowStartAt: number;
  readonly windowEndAt: number;
  readonly now: number;
  readonly timeZone: string;
}): React.ReactElement {
  const scheduled = props.items.filter((item) => item.startAt !== undefined).length;
  const timeline = <Timeline {...props} />;

  return (
    <section className="order-1 min-w-0 lg:order-none">
      <details className="border-b border-ink-800 pb-3 lg:hidden">
        {/* Not `flex`: that drops the disclosure triangle, which is the only thing saying it opens. */}
        <summary className="cursor-pointer py-1 font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase marker:text-chalk-600">
          The day <span className="tracking-normal normal-case">({scheduled} scheduled)</span>
        </summary>
        <div className="mt-5">{timeline}</div>
      </details>

      <div className="hidden lg:block">
        <SectionTitle>The day</SectionTitle>
        {timeline}
      </div>
    </section>
  );
}
function SectionTitle({ children }: { readonly children: string }): React.ReactElement {
  return (
    <h2 className="mb-4 font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
      {children}
    </h2>
  );
}

/** The day has loops; this filter has none. Distinct from an empty day, and it says so. */
function NothingMatches({ onClear }: { readonly onClear: () => void }): React.ReactElement {
  return (
    <div className="hairline rounded-lg bg-ink-900/40 px-5 py-12 text-center sm:px-8 sm:py-16">
      <p className="text-sm text-chalk-300">Nothing in today matches that.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 min-h-10 rounded border border-ink-700 px-3 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100"
      >
        Clear the filter
      </button>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="hairline rounded-lg bg-ink-900/40 px-5 py-12 text-center sm:px-8 sm:py-16">
      <p className="text-sm text-chalk-300">No open loops yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-chalk-600">
        Connect a source on the Integrations screen, then run a check. In local mode, point your
        AI client at <code className="font-mono text-chalk-300">POST /api/agent/ingest</code> and
        push signals in.
      </p>
    </div>
  );
}
