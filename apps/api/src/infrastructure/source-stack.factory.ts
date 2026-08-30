import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from '@open-loops/kernel';
import type { ConnectionBroker } from '@open-loops/integrations';
import type { SourceConnector } from '@open-loops/signals';
import {
  ComposioConnectionBroker,
  ComposioSourceConnector,
  ComposioToolExplorer,
  type ComposioSessionRegistry,
} from '@open-loops/connectors-composio';
import { LocalAgentSourceConnector, LocalConnectionBroker } from '@open-loops/connectors-local';
import type { AppConfig } from '../config/env.js';
import { isLocalMode } from '../config/env.js';
import { Tokens } from '../tokens.js';
import { AccountIdentities } from './account-identity.service.js';

/** Everything that reaches an upstream provider, already bound to one account. */
export interface SourceStack {
  readonly broker: ConnectionBroker;
  readonly connectors: readonly SourceConnector[];
  /** Only in hosted mode with a key; the tool bench and the hosted probe runner need it. */
  readonly explorer: ComposioToolExplorer | undefined;
}

/**
 * The hosted adapters used to be singletons, which is exactly what made every account share one
 * set of connected apps. They are built per owner here instead, around that owner's Composio
 * session, so "connect Slack" is a fact about a person rather than about the deployment.
 *
 * Local mode has nothing to scope — the agent pushes signals in over a shared secret and there
 * is no OAuth anywhere — so its adapters stay one apiece.
 */
@Injectable()
export class SourceStackFactory {
  private readonly local: SourceStack;

  public constructor(
    @Inject(Tokens.Config) private readonly config: AppConfig,
    @Inject(Tokens.Logger) private readonly logger: Logger,
    @Inject(Tokens.ComposioSessions)
    private readonly sessions: ComposioSessionRegistry | undefined,
    private readonly identities: AccountIdentities,
  ) {
    this.local = {
      broker: new LocalConnectionBroker(),
      connectors: [new LocalAgentSourceConnector(this.logger)],
      explorer: undefined,
    };
  }

  public for(ownerId: string): SourceStack {
    if (isLocalMode(this.config) || this.sessions === undefined) return this.local;

    // Cheap wrappers around one cached session — the session, not this object, is what holds
    // the connection state, so building these per request costs nothing worth caching.
    const sessions = this.sessions.for(ownerId);
    const explorer = new ComposioToolExplorer({ sessions, logger: this.logger });
    return {
      explorer,
      broker: new ComposioConnectionBroker({ sessions, logger: this.logger }),
      connectors: [
        new ComposioSourceConnector({
          explorer,
          logger: this.logger,
          meHandles: async () => await this.identities.meHandles(ownerId),
        }),
      ],
    };
  }
}
