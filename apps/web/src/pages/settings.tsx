import { useCallback, useEffect, useState } from 'react';
import type { EpisodeDto, SettingsDto, UpdateSettingsDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { useAsyncAction } from '../hooks/use-async-action.js';
import { CronField } from '../components/cron-field.js';
import { EpisodeList } from '../components/episode-list.js';
import { ErrorPanel } from '../components/error-panel.js';
import { HandlesField } from '../components/handles-field.js';
import { PlatformCronNotice } from '../components/platform-cron-notice.js';
import { PodcastSettings } from '../components/podcast-settings.js';

/**
 * Saved settings with the unsaved edits laid over them. Written field by field rather than by
 * spreading the draft: an optional key holding `undefined` would otherwise erase the saved
 * value, which is the difference between "not edited" and "cleared".
 */
const merge = (saved: SettingsDto, draft: UpdateSettingsDto): SettingsDto => {
  const host = draft.podcastHostVoiceId ?? saved.podcastHostVoiceId;
  const guest = draft.podcastGuestVoiceId ?? saved.podcastGuestVoiceId;
  return {
    ...saved,
    sweepCron: draft.sweepCron ?? saved.sweepCron,
    podcastCron: draft.podcastCron ?? saved.podcastCron,
    podcastEnabled: draft.podcastEnabled ?? saved.podcastEnabled,
    podcastLength: draft.podcastLength ?? saved.podcastLength,
    handles: draft.handles ?? saved.handles,
    ...(host === undefined ? {} : { podcastHostVoiceId: host }),
    ...(guest === undefined ? {} : { podcastGuestVoiceId: guest }),
  };
};

const editedKeys = (draft: UpdateSettingsDto): readonly string[] =>
  Object.entries(draft)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

export function SettingsPage(): React.ReactElement {
  const [settings, setSettings] = useState<SettingsDto | undefined>();
  const [draft, setDraft] = useState<UpdateSettingsDto>({});
  const [episodes, setEpisodes] = useState<readonly EpisodeDto[]>([]);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [next, recorded] = await Promise.all([api.settings(), api.episodes()]);
    setSettings(next);
    setEpisodes(recorded);
    setDraft({});
  }, []);

  const action = useAsyncAction(load);

  useEffect(() => {
    void action.run(async () => {
      /* the reload in useAsyncAction is the whole job here */
    });
  }, []);

  /** The draft holds only what changed, so a save never writes back a field it did not touch. */
  const edit = useCallback((patch: UpdateSettingsDto): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  }, []);

  const save = useCallback((): void => {
    void action
      .run(async () => {
        await api.saveSettings(draft);
      })
      .then(() => {
        setSaved(true);
      });
  }, [action, draft]);

  const generate = useCallback((): void => {
    void action.run(async () => await api.generatePodcast(true));
  }, [action]);

  if (settings === undefined) {
    return action.error === undefined ? (
      <p className="text-sm text-chalk-500">Loading settings…</p>
    ) : (
      <ErrorPanel message={action.error} />
    );
  }

  const value = merge(settings, draft);
  const dirty = editedKeys(draft).length > 0;

  return (
    <div className="max-w-2xl space-y-10">
      <header>
        <h1 className="text-3xl font-medium tracking-tight">Settings</h1>
        <p className="mt-3 text-sm leading-relaxed text-chalk-500">
          Schedules are read in {settings.timeZone}, and they live in the database rather than in
          the deployment — changing one here takes effect on save, not on the next deploy.
        </p>
      </header>

      {action.error !== undefined && <ErrorPanel message={action.error} />}
      <PlatformCronNotice />

      <section className="space-y-6">
        <h2 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">The sweep</h2>
        <CronField
          label="Sweep schedule"
          hint="Pulls every source, re-checks evidence and re-plans the day."
          value={value.sweepCron}
          onChange={(sweepCron) => {
            edit({ sweepCron });
          }}
        />
      </section>

      <section className="space-y-6">
        <h2 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">You</h2>
        <HandlesField
          value={value.handles}
          onChange={(handles) => {
            edit({ handles });
          }}
        />
      </section>

      <PodcastSettings value={value} configured={settings.podcastConfigured} onEdit={edit} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || action.busy}
          className="rounded border border-chalk-600 px-4 py-1.5 text-[12px] text-chalk-100 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
        >
          {action.busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={action.busy || !settings.podcastConfigured}
          className="rounded border border-ink-700 px-4 py-1.5 text-[12px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Record today now
        </button>
        {saved && !dirty && <span className="text-[11px] text-signal-done">Saved.</span>}
      </div>

      <EpisodeList episodes={episodes} />
    </div>
  );
}
