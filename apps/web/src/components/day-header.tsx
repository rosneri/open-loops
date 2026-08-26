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
            onClick={onRebalance}
            className="rounded border border-ink-700 px-3 py-1.5 text-xs text-chalk-500 transition hover:text-chalk-100 disabled:opacity-40"
          >
            Re-plan
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onTick}
            className="rounded border border-chalk-600 px-3 py-1.5 text-xs text-chalk-100 transition hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Run check now'}
          </button>
        </div>
      </div>
    </section>
  );
}
