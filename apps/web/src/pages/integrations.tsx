import { useCallback, useEffect, useState } from 'react';
import type { IntegrationDto } from '@open-loops/contracts';
import { api } from '../api.js';
import { useAsyncAction } from '../hooks/use-async-action.js';
import { ErrorPanel } from '../components/error-panel.js';
import { IntegrationCard, IntegrationCardSkeleton } from '../components/integration-card.js';
import { ToolBench } from '../components/tool-bench.js';
import { IntegrationSetup } from '../components/integration-setup.js';
import { webPlugins } from '../plugins/enabled.js';

/**
 * The panel a source's plugin contributes to its own card, when that card is the one showing it.
 * A source whose plugin ships no panel gets nothing, which is every source but GitHub today.
 */
const setupFor = (
  provider: string,
  open: boolean,
  onSaved: () => void,
): React.ReactElement | undefined => {
  if (!open) return undefined;
  const plugin = webPlugins.find((web) => web.settings?.provider === provider);
  return plugin === undefined ? undefined : <IntegrationSetup plugin={plugin} onSaved={onSaved} />;
};

/** The sources whose plugin ships a panel, so a card knows whether it has anything to offer. */
const configurableProviders = new Set(
  webPlugins
    .map((web) => web.settings?.provider)
    .filter((provider): provider is string => provider !== undefined),
);

/** Enough rows to fill the grid at every breakpoint without inventing a count we cannot know. */
const SKELETON_CARDS = 6;

export function IntegrationsPage(): React.ReactElement {
  const [integrations, setIntegrations] = useState<readonly IntegrationDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setIntegrations(await api.integrations());
    } finally {
      // Settled either way: a failure belongs in the error panel, not behind a permanent skeleton.
      setLoaded(true);
    }
  }, []);

  const action = useAsyncAction(load);

  useEffect(() => {
    void action.run(async () => {
      /* the reload in useAsyncAction is the whole job here */
    });
  }, []);

  /**
   * Consent opens in a new tab rather than replacing this one, so the app keeps its state and
   * the user lands back on a grid that is already loaded.
   */
  const connect = useCallback(
    (provider: string): void => {
      setPending(provider);
      void action
        .run(async () => {
          const handshake = await api.connectUrl(provider);
          if (handshake.redirectUrl !== undefined) window.open(handshake.redirectUrl, '_blank');
        })
        .finally(() => {
          setPending(undefined);
        });
    },
    [action],
  );

  /** Which card is showing its plugin's panel — the one being connected, or one being changed. */
  const [openSetup, setOpenSetup] = useState<string | undefined>();

  const finishSetup = useCallback((provider: string): void => {
    setOpenSetup((current) => (current === provider ? undefined : provider));
  }, []);

  const disconnect = useCallback(
    (provider: string): void => {
      void action.run(async () => await api.disconnect(provider));
    },
    [action],
  );

  const connected = integrations.filter((item) => item.status === 'ACTIVE');

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Integrations</h1>
        <p className="mt-3 text-sm leading-relaxed text-chalk-500">
          Composio brokers OAuth for every provider, so you never register a redirect URI in
          Slack, GitHub, Google or Linear yourself — one click per app, and the token lives on
          their side, never in this repository.
        </p>
      </header>

      {action.error !== undefined && <ErrorPanel message={action.error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loaded
          ? integrations.map((integration) => (
              <IntegrationCard
                key={integration.provider}
                integration={integration}
                pending={pending === integration.provider}
                onConnect={connect}
                onDisconnect={disconnect}
                onFinishSetup={finishSetup}
                configurable={configurableProviders.has(integration.provider)}
                setup={setupFor(integration.provider, openSetup === integration.provider, () => {
                  setOpenSetup(undefined);
                  void load();
                })}
              />
            ))
          : Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <IntegrationCardSkeleton key={index} />
            ))}
      </div>

      <ToolBench
        toolkits={connected.map((item) => item.provider)}
        onRefresh={() => {
          void load();
        }}
      />
    </div>
  );
}
