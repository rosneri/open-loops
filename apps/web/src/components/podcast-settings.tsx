import type { SettingsDto, UpdateSettingsDto } from '@open-loops/contracts';

const LENGTHS = [
  { value: 'short', label: 'Short', hint: 'under 3 min' },
  { value: 'default', label: 'Default', hint: '3–7 min' },
  { value: 'long', label: 'Long', hint: 'over 7 min' },
] as const;

interface PodcastSettingsProps {
  /** Saved settings merged with unsaved edits, so the controls show what the user just typed. */
  readonly value: SettingsDto;
  readonly onEdit: (patch: UpdateSettingsDto) => void;
}

/**
 * What the podcast sounds like. When and whether it runs are not here — those are a schedule,
 * and schedules are all rendered from one list so that every kind of work is configured the same
 * way whether or not this app shipped with it.
 */
export function PodcastSettings({ value, onEdit }: PodcastSettingsProps): React.ReactElement {
  return (
    <section className="space-y-6">
      <h2 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
        Podcast of the day
      </h2>

      <div>
        <span className="block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">Length</span>
        <div className="mt-2 flex gap-1.5">
          {LENGTHS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onEdit({ podcastLength: option.value });
              }}
              className={`rounded border px-3 py-1.5 text-[11px] transition ${
                value.podcastLength === option.value
                  ? 'border-chalk-600 text-chalk-100'
                  : 'border-ink-700 text-chalk-600 hover:border-ink-600 hover:text-chalk-300'
              }`}
            >
              {option.label}
              <span className="ml-1.5 text-chalk-600">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <VoiceField
          label="Host voice id"
          value={value.podcastHostVoiceId ?? ''}
          onChange={(podcastHostVoiceId) => {
            onEdit({ podcastHostVoiceId });
          }}
        />
        <VoiceField
          label="Guest voice id"
          value={value.podcastGuestVoiceId ?? ''}
          onChange={(podcastGuestVoiceId) => {
            onEdit({ podcastGuestVoiceId });
          }}
        />
      </div>
    </section>
  );
}

function VoiceField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
      {props.label}
      <input
        type="text"
        spellCheck={false}
        placeholder="provider default"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        className="mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600"
      />
    </label>
  );
}
