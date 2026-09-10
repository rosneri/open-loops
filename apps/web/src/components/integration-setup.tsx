import { useCallback, useEffect, useState } from 'react';
import type { WebPlugin } from '@open-loops/plugin-ui';
import { api, pluginRequest } from '../api.js';

interface IntegrationSetupProps {
  readonly plugin: WebPlugin;
  /** Reloads the cards: answering the question is what finishes the connection. */
  readonly onSaved: () => void;
}

/**
 * A plugin's own panel, mounted on the Integrations card of the source it belongs to. It loads
 * and saves just its own plugin value rather than borrowing the Settings screen's draft: this
 * asks one question about one connection, and a save here must not carry along whatever else
 * somebody had half-typed elsewhere.
 */
export function IntegrationSetup({ plugin, onSaved }: IntegrationSetupProps): React.ReactElement {
  const [value, setValue] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let live = true;
    void api
      .settings()
      .then((settings) => {
        if (!live) return;
        setValue(settings.plugins.find((entry) => entry.id === plugin.id)?.value);
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      live = false;
    };
  }, [plugin.id]);

  const save = useCallback((): void => {
    setBusy(true);
    setError(undefined);
    void api
      .saveSettings({ plugins: [{ id: plugin.id, value }] })
      .then(onSaved)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  }, [plugin.id, value, onSaved]);

  const settings = plugin.settings;
  if (settings === undefined) return <></>;
  const { Panel } = settings;

  return (
    <div className="mt-3 space-y-3">
      {value !== undefined && (
        <Panel value={value} onEdit={setValue} busy={busy} request={pluginRequest} />
      )}
      {error !== undefined && <p className="text-[11px] text-signal-unconfirmed">{error}</p>}
      <button
        type="button"
        disabled={busy || value === undefined}
        onClick={save}
        className="min-h-10 w-full rounded border border-chalk-600 py-1.5 text-[11px] text-chalk-100 sm:min-h-0 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
      >
        {busy ? 'Saving…' : 'Save and finish'}
      </button>
    </div>
  );
}
