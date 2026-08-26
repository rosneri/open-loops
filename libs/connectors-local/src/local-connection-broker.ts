import type { SourceProvider } from '@open-loops/kernel';
import type {
  ConnectionBroker,
  ConnectionHandshake,
  ConnectionState,
  UpstreamConnection,
} from '@open-loops/integrations';

/**
 * Connecting a provider locally is a declaration, not an authorisation: "the agent on this
 * machine can already see my Slack". No redirect, no token — which is the entire point of
 * running locally.
 */
export class LocalConnectionBroker implements ConnectionBroker {
  public beginConnection(input: {
    provider: SourceProvider;
    callbackUrl: string;
  }): Promise<ConnectionHandshake> {
    return Promise.resolve({ externalAccountRef: `local:${input.provider}` });
  }

  public completeConnection(externalAccountRef: string): Promise<ConnectionState> {
    return Promise.resolve({
      active: true,
      scopes: ['local-agent'],
      accountLabel: externalAccountRef.replace('local:', 'local agent · '),
    });
  }

  /** Nothing is brokered locally, so there is nothing to adopt. */
  public listConnected(): Promise<readonly UpstreamConnection[]> {
    return Promise.resolve([]);
  }

  public disconnect(): Promise<void> {
    return Promise.resolve();
  }
}
