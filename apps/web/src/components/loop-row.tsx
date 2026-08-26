import type { LoopDto } from '@open-loops/contracts';
import { clockTime, relativeDue, titleCase } from '../format.js';
import { StatusPill } from './status-pill.js';

interface LoopRowProps {
  readonly item: LoopDto;
  readonly now: number;
  readonly timeZone: string;
  readonly busy: boolean;
  readonly onCommand: (id: string, command: string) => void;
}

/**
 * One loop, one row. The criteria list is the honest part of the interface: it shows exactly
 * what the system is watching for, so "not done yet" is never a black box.
 */
export function LoopRow({
  item,
  now,
  timeZone,
  busy,
  onCommand,
}: LoopRowProps): React.ReactElement {
  return (
    <article className="hairline rounded-lg bg-ink-900/60 p-5 transition hover:border-ink-600">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <StatusPill status={item.status} />
            <span className="font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase">
              {titleCase(item.kind)} · {titleCase(item.provider)}
            </span>
            {item.slipCount > 0 && (
              <span className="font-mono text-[10px] tracking-[0.14em] text-signal-progress uppercase">
                slipped {item.slipCount}×
              </span>
            )}
          </div>

          <h3 className="truncate text-[15px] font-medium text-chalk-100">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-chalk-500">{item.summary}</p>

          <ul className="mt-3 space-y-1">
            {item.criteria.map((criterion) => (
              <li key={criterion.id} className="flex items-start gap-2 text-[13px] text-chalk-500">
                <span className={criterion.satisfied ? 'text-signal-done' : 'text-chalk-600'}>
                  {criterion.satisfied ? '●' : '○'}
                </span>
                <span>
                  {criterion.label}
                  {criterion.role === 'ACKNOWLEDGEMENT' && (
                    <span className="ml-1.5 text-chalk-600">— and tell them</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          {item.startAt !== undefined && (
            <span className="font-mono text-sm text-chalk-300">
              {clockTime(item.startAt, timeZone)}
            </span>
          )}
          <span className="font-mono text-[11px] text-chalk-600">{item.estimateMinutes}m</span>
          {item.dueAt !== undefined && (
            <span
              className={`font-mono text-[11px] ${
                item.isOverdue ? 'text-signal-progress' : 'text-chalk-600'
              }`}
            >
              {relativeDue(item.dueAt, now)}
            </span>
          )}
          {item.counterparty !== undefined && (
            <span className="text-[11px] text-chalk-600">for {item.counterparty}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-ink-800 pt-3">
        {(
          [
            ['done', 'Mark done'],
            ['snooze', 'Snooze 3h'],
            ['drop', 'Drop'],
          ] as const
        ).map(([command, label]) => (
          <button
            key={command}
            type="button"
            disabled={busy}
            onClick={() => {
              onCommand(item.id, command);
            }}
            className="rounded border border-ink-700 px-2.5 py-1 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
        {item.url !== undefined && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[11px] text-chalk-600 underline-offset-4 hover:text-chalk-300 hover:underline"
          >
            open source ↗
          </a>
        )}
      </div>
    </article>
  );
}
