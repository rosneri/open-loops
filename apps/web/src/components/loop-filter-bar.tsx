import { useId } from 'react';
import { titleCase } from '../format.js';
import { isFiltering, providersIn, toggleProvider, NO_FILTER, type LoopFilter } from '../loop-filter.js';
import type { LoopDto } from '@open-loops/contracts';

interface LoopFilterBarProps {
  /** Every loop in the day, unfiltered: the chips are drawn from what there is to filter. */
  readonly items: readonly LoopDto[];
  readonly value: LoopFilter;
  readonly onChange: (next: LoopFilter) => void;
  /** How many survive the current filter, so the count below is the screen's own count. */
  readonly shown: number;
}

/**
 * Narrowing the day by app and by words. Both matter for the same reason: a day with thirty
 * loops on it is a list you scroll rather than read, and "the thing Dana asked for" and "just
 * GitHub" are the two ways people actually look for one.
 */
export function LoopFilterBar({
  items,
  value,
  onChange,
  shown,
}: LoopFilterBarProps): React.ReactElement {
  const searchId = useId();
  const providers = providersIn(items);
  const active = isFiltering(value);

  return (
    <section className="space-y-3" aria-label="Filter loops">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search loops
          </label>
          <input
            id={searchId}
            // `search` rather than `text`: it gets the keyboard's search key on a phone and the
            // browser's own clear affordance where there is one.
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Search titles, people, criteria…"
            value={value.query}
            onChange={(event) => {
              onChange({ ...value, query: event.target.value });
            }}
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-base tracking-normal text-chalk-100 normal-case outline-none placeholder:text-chalk-600 focus:border-chalk-600 sm:text-sm"
          />
        </div>

        {active && (
          <button
            type="button"
            onClick={() => {
              onChange(NO_FILTER);
            }}
            className="min-h-10 shrink-0 rounded border border-ink-700 px-3 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100 sm:min-h-0 sm:py-1.5"
          >
            Clear
          </button>
        )}
      </div>

      {/* One app is not a choice, so the chips appear only where there is something to choose. */}
      {providers.length > 1 && (
        <div className="rail -mx-4 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {providers.map(({ provider, count }) => {
            const on = value.providers.includes(provider);
            return (
              <button
                key={provider}
                type="button"
                // Pressed rather than a second copy of the state in the label: the chip is a
                // toggle, and that is the word a screen reader has for one.
                aria-pressed={on}
                onClick={() => {
                  onChange(toggleProvider(value, provider));
                }}
                className={`min-h-9 shrink-0 rounded-full border px-3 font-mono text-[10px] tracking-[0.14em] uppercase transition sm:min-h-0 sm:py-1 ${
                  on
                    ? 'border-chalk-600 bg-ink-800 text-chalk-100'
                    : 'border-ink-700 text-chalk-500 hover:border-ink-600 hover:text-chalk-300'
                }`}
              >
                {titleCase(provider)}{' '}
                <span className="tracking-normal text-chalk-600">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/*
       * Announced rather than merely drawn: filtering removes rows from under the cursor, and a
       * list that silently shrinks is a list a screen reader user has to go and re-count.
       */}
      <p aria-live="polite" className="text-[11px] text-chalk-600">
        {active
          ? `${String(shown)} of ${String(items.length)} loops`
          : `${String(items.length)} loops`}
      </p>
    </section>
  );
}
