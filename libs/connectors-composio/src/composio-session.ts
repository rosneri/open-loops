import { Composio } from '@composio/core';
import type { Logger, SourceProvider } from '@open-loops/kernel';

export type ComposioSession = Awaited<ReturnType<Composio['create']>>;

export interface ComposioSessionOptions {
  readonly userId: string;
  readonly logger: Logger;
  /** Only set when the key does not live in COMPOSIO_API_KEY; the SDK reads that itself. */
  readonly apiKey?: string;
}

/**
 * One session per user, created lazily and reused. A session is the runtime context Composio
 * scopes identity, connections and tool access to — creating a fresh one per request would
 * throw away the connection state the whole app depends on.
 */
export class ComposioSessionProvider {
  private readonly composio: Composio;
  private session: Promise<ComposioSession> | undefined;

  public constructor(private readonly options: ComposioSessionOptions) {
    this.composio = new Composio(
      options.apiKey === undefined ? {} : { apiKey: options.apiKey },
    );
  }

  public get userId(): string {
    return this.options.userId;
  }

  public session$(): Promise<ComposioSession> {
    this.session ??= this.composio.create(this.options.userId).then((session) => {
      this.options.logger.info('composio session ready', { sessionId: session.sessionId });
      return session;
    });
    return this.session;
  }

  /** Drops the cached session so the next call rebuilds it — used after an auth change. */
  public invalidate(): void {
    this.session = undefined;
  }
}

/**
 * Composio names toolkits in its own slug space. Everything here is a *lookup key* checked
 * against the live toolkit list at runtime, never a slug we assume exists — an unknown provider
 * simply reports itself as not connectable.
 */
const TOOLKIT_ALIASES: Partial<Record<SourceProvider, string>> = {
  SLACK: 'slack',
  GMAIL: 'gmail',
  GOOGLE_CALENDAR: 'googlecalendar',
  GOOGLE_DRIVE: 'googledrive',
  GITHUB: 'github',
  GITLAB: 'gitlab',
  LINEAR: 'linear',
  JIRA: 'jira',
  NOTION: 'notion',
  ASANA: 'asana',
  WHATSAPP: 'whatsapp',
  DISCORD: 'discord',
  MICROSOFT_TEAMS: 'microsoft_teams',
  OUTLOOK: 'outlook',
};

export const toolkitSlugFor = (provider: SourceProvider): string | undefined =>
  TOOLKIT_ALIASES[provider];

export const COMPOSIO_PROVIDERS: readonly SourceProvider[] = Object.keys(
  TOOLKIT_ALIASES,
) as SourceProvider[];

const BY_TOOLKIT = new Map(
  Object.entries(TOOLKIT_ALIASES).map(([provider, slug]) => [slug, provider as SourceProvider]),
);

export const providerForToolkit = (slug: string): SourceProvider | undefined =>
  BY_TOOLKIT.get(slug.toLowerCase());
