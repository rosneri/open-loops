import { Composio } from '@composio/core';
import type { Logger } from '@open-loops/kernel';

export type ComposioSession = Awaited<ReturnType<Composio['create']>>;

export interface ComposioSessionOptions {
  /**
   * The Composio identity this session belongs to, resolved lazily because it lives on the
   * account row and the object that needs it is built synchronously per request.
   */
  readonly identity: () => Promise<string>;
  readonly logger: Logger;
  /** Shared: one API key, one client, one connection pool for every account on this process. */
  readonly composio: Composio;
}

/**
 * One session per account, created lazily and reused. A session is the runtime context Composio
 * scopes identity, connections and tool access to — creating a fresh one per request would
 * throw away the connection state the whole app depends on.
 *
 * The identity is somebody's, never the deployment's: two accounts on one process hold two
 * sessions and therefore two separate sets of connected apps.
 */
export class ComposioSessionProvider {
  private identity: Promise<string> | undefined;
  private session: Promise<ComposioSession> | undefined;

  public constructor(private readonly options: ComposioSessionOptions) {}

  public userId$(): Promise<string> {
    // A rejected promise is dropped rather than cached: a database blip while resolving the
    // identity must not make this account permanently unusable until the process restarts.
    this.identity ??= this.options.identity().catch((error: unknown) => {
      this.identity = undefined;
      throw error;
    });
    return this.identity;
  }

  public session$(): Promise<ComposioSession> {
    this.session ??= this.userId$()
      .then(async (userId) => await this.options.composio.create(userId))
      .then((session) => {
        this.options.logger.info('composio session ready', { sessionId: session.sessionId });
        return session;
      })
      .catch((error: unknown) => {
        this.session = undefined;
        throw error;
      });
    return this.session;
  }

  /** Drops the cached session so the next call rebuilds it — used after an auth change. */
  public invalidate(): void {
    this.session = undefined;
  }
}

/**
 * How many accounts' sessions one process keeps warm. A session is small, but a deployment
 * serving many people should not grow a map without a ceiling; the least recently built entry
 * is dropped and simply rebuilt on the next request.
 */
const MAX_CACHED_SESSIONS = 256;

export interface ComposioSessionRegistryOptions {
  readonly logger: Logger;
  /** Answers "which Composio identity is this owner?", asked once per owner per process. */
  readonly identity: (ownerId: string) => Promise<string>;
  /** Only set when the key does not live in COMPOSIO_API_KEY; the SDK reads that itself. */
  readonly apiKey?: string;
}

/**
 * The per-account session cache. Everything that talks to Composio goes through a provider this
 * hands out, so there is no way to reach the API without having named an owner first.
 */
export class ComposioSessionRegistry {
  private readonly composio: Composio;
  private readonly byOwner = new Map<string, ComposioSessionProvider>();

  public constructor(private readonly options: ComposioSessionRegistryOptions) {
    this.composio = new Composio(
      options.apiKey === undefined ? {} : { apiKey: options.apiKey },
    );
  }

  public for(ownerId: string): ComposioSessionProvider {
    const existing = this.byOwner.get(ownerId);
    if (existing !== undefined) return existing;

    const created = new ComposioSessionProvider({
      composio: this.composio,
      logger: this.options.logger,
      identity: async () => await this.options.identity(ownerId),
    });
    this.byOwner.set(ownerId, created);
    this.evictOverflow();
    return created;
  }

  /** Forgets one account's session — after a disconnect, or when its identity changes. */
  public forget(ownerId: string): void {
    this.byOwner.get(ownerId)?.invalidate();
    this.byOwner.delete(ownerId);
  }

  private evictOverflow(): void {
    while (this.byOwner.size > MAX_CACHED_SESSIONS) {
      const [oldest] = this.byOwner.keys();
      if (oldest === undefined) return;
      this.byOwner.delete(oldest);
    }
  }
}
