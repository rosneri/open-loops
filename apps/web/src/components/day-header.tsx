import type { TodayDto } from '@open-loops/contracts';

const SUMMARY = [
  { status: 'OPEN', label: 'open' },
  { status: 'IN_PROGRESS', label: 'in progress' },
  { status: 'DONE_UNCONFIRMED', label: 'done, not told' },
  { status: 'DONE', label: 'closed' },
] as const;

interface DayHeaderProps {
  readonly view: TodayDto;
  readonly busy: boolean;
  readonly onRebalance: () => void;
  readonly onTick: () => void;
}

export function DayHeader({
  view,
  busy,
  onRebalance,
  onTick,
}: DayHeaderProps): React.ReactElement {
  return (
    <section className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-chalk-600 uppercase">
          {view.day}
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight sm:text-3xl">Today</h1>
      </div>

      {/*
       * The four counts are a fixed set, so on a phone they get a fixed two-by-two grid rather
       * than a wrapping row. Four columns fits the numbers and not the labels: "done, not told"
       * breaks over three lines there and the row stops reading as four of the same thing.
       */}
      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:gap-6">
          {SUMMARY.map((entry) => (
            <div
              key={entry.status}
              className="flex min-w-0 items-baseline gap-2 sm:block sm:text-right"
            >
              <p className="font-mono text-xl text-chalk-100">{view.counts[entry.status]}</p>
              <p className="truncate font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase sm:mt-0.5">
                {entry.label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onRebalance}
            className="min-h-10 flex-1 rounded border border-ink-700 px-3 py-1.5 text-xs text-chalk-500 transition hover:text-chalk-100 disabled:opacity-40 sm:min-h-0 sm:flex-none"
          >
            Re-plan
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onTick}
            className="min-h-10 flex-1 rounded border border-chalk-600 px-3 py-1.5 text-xs text-chalk-100 transition hover:bg-ink-800 disabled:opacity-40 sm:min-h-0 sm:flex-none"
          >
            {busy ? 'Checking…' : 'Run check now'}
          </button>
        </div>
      </div>
    </section>
  );
}
