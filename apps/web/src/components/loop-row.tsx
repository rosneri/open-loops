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
    <article className="hairline rounded-lg bg-ink-900/60 p-4 transition hover:border-ink-600 sm:p-5">
      {/*
       * Time, estimate and due sit beside the loop on a wide row and above it on a phone, where a
       * second column would leave the title about twenty characters to work with.
       */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="order-2 min-w-0 sm:order-none">
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

          <h3 className="text-[15px] font-medium break-words text-chalk-100 sm:truncate">
            {item.title}
          </h3>
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

        <div className="order-1 flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 sm:order-none sm:flex-col sm:items-end sm:gap-2 sm:text-right">
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

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3">
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
            // Roomier than the label needs on a phone, because a thumb is not a cursor.
            className="min-h-9 rounded border border-ink-700 px-3 py-1 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100 disabled:opacity-40 sm:min-h-0 sm:px-2.5"
          >
            {label}
          </button>
        ))}
        {item.url !== undefined && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex min-h-9 items-center text-[11px] text-chalk-600 underline-offset-4 hover:text-chalk-300 hover:underline sm:min-h-0"
          >
            open source ↗
          </a>
        )}
      </div>
    </article>
  );
}
