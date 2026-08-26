import type { LoopDto } from '@open-loops/contracts';
import { clockTime } from '../format.js';

interface TimelineProps {
  readonly items: readonly LoopDto[];
  readonly windowStartAt: number;
  readonly windowEndAt: number;
  readonly now: number;
  readonly timeZone: string;
}

const PIXELS_PER_HOUR = 68;
const HOUR_MS = 3_600_000;

const TONE: Record<string, string> = {
  OPEN: 'bg-signal-open/15 border-signal-open/50',
  IN_PROGRESS: 'bg-signal-progress/15 border-signal-progress/50',
  DONE_UNCONFIRMED: 'bg-signal-unconfirmed/15 border-signal-unconfirmed/50',
  DONE: 'bg-signal-done/10 border-signal-done/40',
};

/**
 * The one-day calendar. Blocks come straight from the plan the scheduler produced, and the
 * "now" line is what makes a slip obvious: anything above the line still coloured open did not
 * happen.
 */
export function Timeline({
  items,
  windowStartAt,
  windowEndAt,
  now,
  timeZone,
}: TimelineProps): React.ReactElement {
  const totalHours = Math.max(1, (windowEndAt - windowStartAt) / HOUR_MS);
  const offset = (at: number): number => ((at - windowStartAt) / HOUR_MS) * PIXELS_PER_HOUR;
  const scheduled = items.filter(
    (item) => item.startAt !== undefined && item.endAt !== undefined && item.endAt > item.startAt,
  );
  const rows = Array.from({ length: Math.ceil(totalHours) + 1 }, (_, index) => index);

  return (
    <div className="relative flex gap-3" style={{ height: totalHours * PIXELS_PER_HOUR + 24 }}>
      <div className="relative w-11 shrink-0">
        {rows.map((index) => (
          <div
            key={index}
            className="absolute -translate-y-1/2 font-mono text-[10px] text-chalk-600"
            style={{ top: index * PIXELS_PER_HOUR }}
          >
            {clockTime(windowStartAt + index * HOUR_MS, timeZone)}
          </div>
        ))}
      </div>

      <div className="relative flex-1 border-l border-ink-800">
        {rows.map((index) => (
          <div
            key={index}
            className="absolute right-0 left-0 border-t border-ink-800/60"
            style={{ top: index * PIXELS_PER_HOUR }}
          />
        ))}

        {now >= windowStartAt && now <= windowEndAt && (
          <div className="absolute right-0 left-0 z-10" style={{ top: offset(now) }}>
            <div className="h-px bg-signal-progress/70" />
            <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-signal-progress" />
          </div>
        )}

        {scheduled.map((item) => {
          const top = offset(item.startAt ?? windowStartAt);
          const height = Math.max(22, offset(item.endAt ?? windowStartAt) - top);
          return (
            <div
              key={item.id}
              title={item.title}
              className={`absolute right-2 left-2 overflow-hidden rounded border px-3 py-1.5 ${
                TONE[item.status] ?? 'border-ink-600 bg-ink-800/60'
              }`}
              style={{ top, height }}
            >
              <p className="truncate text-[12px] leading-tight text-chalk-100">{item.title}</p>
              <p className="truncate font-mono text-[10px] text-chalk-600">
                {item.provider.toLowerCase()} · {item.estimateMinutes}m
                {item.slipCount > 0 ? ` · slipped ${item.slipCount}×` : ''}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
