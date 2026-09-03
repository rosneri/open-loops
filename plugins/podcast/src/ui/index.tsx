import { useCallback, useEffect, useState } from 'react';
import { defineWebPlugin, type SettingsPanelProps } from '@open-loops/plugin-ui';
import type { EpisodeDto } from '../contracts.js';
import type { PodcastSettings } from '../settings.js';

const LENGTHS = [
  { value: 'short', label: 'Short', hint: 'under 3 min' },
  { value: 'default', label: 'Default', hint: '3–7 min' },
  { value: 'long', label: 'Long', hint: 'over 7 min' },
] as const;

const ROUTES = { episodes: '/api/podcast/episodes', generate: '/api/podcast/generate' } as const;

/**
 * What the podcast sounds like, a button to record today, and what has been recorded. When and
 * whether it runs are not here — those are a schedule, and schedules are rendered by the core
 * from one list so that every kind of work is configured the same way.
 */
function PodcastPanel({
  value,
  onEdit,
  busy,
  request,
}: SettingsPanelProps<PodcastSettings>): React.ReactElement {
  const [episodes, setEpisodes] = useState<readonly EpisodeDto[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async (): Promise<void> => {
    setEpisodes(await request<readonly EpisodeDto[]>(ROUTES.episodes));
  }, [request]);

  useEffect(() => {
    reload().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [reload]);

  const record = useCallback((): void => {
    setRecording(true);
    setError(undefined);
    request(
      ROUTES.generate,
      { method: 'POST', body: JSON.stringify({ force: true }) },
      // Minutes of work at the voice service, not seconds.
      { slow: true },
    )
      .then(reload)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setRecording(false);
      });
  }, [request, reload]);

  return (
    <div className="space-y-6">
      <div>
        <span className="block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">Length</span>
        {/* Three fixed options, so a grid on a phone rather than a row that runs off the edge. */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:flex">
          {LENGTHS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onEdit({ ...value, length: option.value });
              }}
              className={`rounded border px-2 py-2 text-[11px] transition sm:px-3 sm:py-1.5 ${
                value.length === option.value
                  ? 'border-chalk-600 text-chalk-100'
                  : 'border-ink-700 text-chalk-600 hover:border-ink-600 hover:text-chalk-300'
              }`}
            >
              <span className="block sm:inline">{option.label}</span>
              <span className="block text-chalk-600 sm:ml-1.5 sm:inline">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <VoiceField
          label="Host voice id"
          value={value.hostVoiceId ?? ''}
          onChange={(hostVoiceId) => {
            onEdit(withVoice(value, 'hostVoiceId', hostVoiceId));
          }}
        />
        <VoiceField
          label="Guest voice id"
          value={value.guestVoiceId ?? ''}
          onChange={(guestVoiceId) => {
            onEdit(withVoice(value, 'guestVoiceId', guestVoiceId));
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={record}
          disabled={busy || recording}
          className="rounded border border-ink-700 px-4 py-1.5 text-[12px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {recording ? 'Recording…' : 'Record today now'}
        </button>
        {error !== undefined && (
          <span className="text-[11px] text-signal-unconfirmed">{error}</span>
        )}
      </div>

      <EpisodeList episodes={episodes} />
    </div>
  );
}

/** A cleared field means "the provider's default", which is the key being absent, not empty. */
const withVoice = (
  value: PodcastSettings,
  key: 'hostVoiceId' | 'guestVoiceId',
  voice: string,
): PodcastSettings => {
  const { [key]: _previous, ...rest } = value;
  return voice.length === 0 ? rest : { ...rest, [key]: voice };
};

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
        className="mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-base sm:text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600"
      />
    </label>
  );
}

const STATUS_TONE: Record<string, string> = {
  READY: 'text-signal-done',
  GENERATING: 'text-signal-progress',
  REQUESTED: 'text-signal-progress',
  FAILED: 'text-signal-unconfirmed',
};

/**
 * A failed episode is listed with its reason rather than hidden. The usual reason is a missing
 * key or a provider quota, and neither is discoverable from an empty list.
 */
function EpisodeList({ episodes }: { readonly episodes: readonly EpisodeDto[] }): React.ReactElement {
  return (
    <section>
      <h3 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">Episodes</h3>

      {episodes.length === 0 ? (
        <p className="mt-3 text-[11px] text-chalk-600">
          Nothing recorded yet. The first one appears after the schedule fires, or right after
          you press Record today now.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {episodes.map((episode) => (
            <li key={episode.id} className="hairline rounded-lg bg-ink-900/60 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[12px] text-chalk-100">{episode.day}</span>
                <span
                  className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                    STATUS_TONE[episode.status] ?? 'text-chalk-600'
                  }`}
                >
                  {episode.status.toLowerCase()}
                </span>
              </div>

              {episode.audioUrl !== undefined && (
                <audio controls preload="none" src={episode.audioUrl} className="mt-3 w-full">
                  <track kind="captions" />
                </audio>
              )}

              {episode.error !== undefined && (
                <p className="mt-2 text-[11px] leading-relaxed text-signal-unconfirmed">
                  {episode.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default defineWebPlugin<PodcastSettings>({
  id: 'podcast',
  settings: { label: 'Podcast of the day', Panel: PodcastPanel },
});
