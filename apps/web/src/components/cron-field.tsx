import { describeCron, PRESETS } from '../cron.js';

interface CronFieldProps {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

/**
 * A raw cron box plus the sentence it means. The sentence is the point: it is the only way to
 * notice you typed the hour into the minute field before the schedule silently runs at 03:00.
 */
export function CronField({
  label,
  hint,
  value,
  disabled = false,
  onChange,
}: CronFieldProps): React.ReactElement {
  const described = describeCron(value);
  const understood = described !== value;

  return (
    <div>
      <label className="block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
        {label}
        <input
          type="text"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-base sm:text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600 disabled:text-chalk-600"
        />
      </label>

      <p className="mt-2 text-[11px] text-chalk-500">
        {understood ? `Runs ${described}.` : 'Five fields: minute, hour, day of month, month, day of week.'}{' '}
        <span className="text-chalk-600">{hint}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.cron}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(preset.cron);
            }}
            className={`min-h-9 rounded border px-2.5 py-1 text-[10px] transition sm:min-h-0 sm:px-2 ${
              preset.cron === value
                ? 'border-chalk-600 text-chalk-100'
                : 'border-ink-700 text-chalk-600 hover:border-ink-600 hover:text-chalk-300'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
