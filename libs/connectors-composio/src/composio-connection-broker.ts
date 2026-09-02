import type { Logger, SourceProvider } from '@open-loops/kernel';
import type {
  ConnectionBroker,
  ConnectionHandshake,
  ConnectionState,
  UpstreamConnection,
} from '@open-loops/integrations';
import type { ComposioSessionProvider } from './composio-session.js';
import type { SourceCatalog } from '@open-loops/plugin-host';

/**
 * Bound to one account's session, so every question it asks Composio — start a handshake, read
 * back what is connected, drop a connection — is asked as that person and can only ever see
 * that person's connected apps.
 *
 * Why it exists at all: Composio owns the OAuth applications, so the user never registers a
 * redirect URI in Slack, GitHub, Google or Linear. Connecting is one `authorize` call and one
 * browser round-trip, and the token never touches this process.
 */
export class ComposioConnectionBroker implements ConnectionBroker {
  public constructor(
    private readonly deps: {
      sessions: ComposioSessionProvider;
      /** Which app each toolkit slug is, according to the installed source plugins. */
      sources: SourceCatalog;
      logger: Logger;
    },
  ) {}

  public async beginConnection(input: {
    provider: SourceProvider;
    callbackUrl: string;
  }): Promise<ConnectionHandshake> {
    const toolkit = this.toolkitFor(input.provider);
    const session = await this.deps.sessions.session$();
    const request = await session.authorize(toolkit, { callbackUrl: input.callbackUrl });

    this.deps.logger.info('composio authorization started', {
      provider: input.provider,
      connectedAccountId: request.id,
    });
    return {
      externalAccountRef: request.id,
      ...(typeof request.redirectUrl === 'string' ? { redirectUrl: request.redirectUrl } : {}),
    };
  }

  /**
   * Asks the session which toolkits actually have a live connection. Reading it back from
   * Composio rather than trusting the callback means a half-finished consent screen shows up
   * as "not connected" instead of a connection that silently returns nothing.
   */
  public async completeConnection(externalAccountRef: string): Promise<ConnectionState> {
    const session = await this.deps.sessions.session$();
    const { items } = await session.toolkits();
    const match = items.find(
      (item) => item.connection?.connectedAccount?.id === externalAccountRef,
    );
    if (match === undefined) return { active: false, scopes: [] };

    return {
      active: match.connection?.isActive === true,
      scopes: [],
      accountLabel: `${match.name} · ${await this.deps.sessions.userId$()}`,
    };
  }

  public async listConnected(): Promise<readonly UpstreamConnection[]> {
    const session = await this.deps.sessions.session$();
    const { items } = await session.toolkits();
    const userId = await this.deps.sessions.userId$();

    return items.flatMap((item) => {
      const provider = this.deps.sources.providerForToolkit(item.slug);
      const accountId = item.connection?.connectedAccount?.id;
      if (provider === undefined || item.connection?.isActive !== true || accountId === undefined) {
        return [];
      }
      return [
        {
          provider,
          externalAccountRef: accountId,
          accountLabel: `${item.name} · ${userId}`,
        },
      ];
    });
  }

  public disconnect(externalAccountRef: string): Promise<void> {
    this.deps.logger.info('composio disconnect requested', { externalAccountRef });
    this.deps.sessions.invalidate();
    return Promise.resolve();
  }

  private toolkitFor(provider: SourceProvider): string {
    const toolkit = this.deps.sources.toolkitFor(provider);
    if (toolkit === undefined) {
      throw new Error(`${provider} has no Composio toolkit mapping yet.`);
    }
    return toolkit;
  }
}
