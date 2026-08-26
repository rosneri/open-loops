import { useCallback, useEffect, useState } from 'react';
import type { IntegrationDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { titleCase } from '../format.js';
import { ToolBench } from '../components/tool-bench.js';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-signal-done',
  PENDING: 'text-signal-progress',
  EXPIRED: 'text-signal-progress',
  FAILED: 'text-signal-unconfirmed',
  DISCONNECTED: 'text-chalk-600',
};

export function IntegrationsPage(): React.ReactElement {
  const [integrations, setIntegrations] = useState<readonly IntegrationDto[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setIntegrations(await api.integrations());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Consent opens in a new tab rather than replacing this one, so the app keeps its state and
   * the user lands back here with the grid already loaded.
   */
  const connect = useCallback(
    async (provider: string) => {
      setPending(provider);
      try {
        const handshake = await api.connectUrl(provider);
        if (handshake.redirectUrl !== undefined) window.open(handshake.redirectUrl, '_blank');
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPending(undefined);
      }
    },
    [load],
  );

  const connected = integrations.filter((item) => item.status === 'ACTIVE');

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-medium tracking-tight">Integrations</h1>
        <p className="mt-3 text-sm leading-relaxed text-chalk-500">
          Composio brokers OAuth for every provider, so you never register a redirect URI in
          Slack, GitHub, Google or Linear yourself — one click per app, and the token lives on
          their side, not in this repository.
        </p>
      </header>

      {error !== undefined && (
        <div className="hairline rounded-lg border-signal-unconfirmed/40 px-5 py-4 font-mono text-[12px] break-all text-chalk-500">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <div
            key={integration.provider}
            className="hairline flex flex-col justify-between rounded-lg bg-ink-900/60 p-5"
          >
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-medium">{titleCase(integration.provider)}</h2>
                <span
                  className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                    STATUS_TONE[integration.status] ?? 'text-chalk-600'
                  }`}
                >
                  {integration.status.toLowerCase()}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-chalk-600">
                {integration.accountLabel ?? integration.mode.toLowerCase().replace('_', ' ')}
              </p>
              {integration.lastError !== undefined && (
                <p className="mt-2 text-[11px] text-signal-unconfirmed">{integration.lastError}</p>
              )}
            </div>

            <div className="mt-5">
              {integration.status === 'ACTIVE' ? (
                <button
                  type="button"
                  onClick={() => void api.disconnect(integration.provider).then(load)}
                  className="w-full rounded border border-ink-700 py-1.5 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!integration.connectable || pending === integration.provider}
                  onClick={() => void connect(integration.provider)}
                  className="w-full rounded border border-chalk-600 py-1.5 text-[11px] text-chalk-100 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
                >
                  {pending === integration.provider
                    ? 'Opening consent…'
                    : integration.connectable
                      ? 'Connect'
                      : 'No adapter yet'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ToolBench
        toolkits={connected.map((item) => item.provider)}
        onRefresh={() => void load()}
      />
    </div>
  );
}
