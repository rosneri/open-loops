import type { Logger } from '@open-loops/kernel';
import type { ComposioSessionProvider } from './composio-session.js';
import type { ToolJournal } from './tool-journal.js';

export interface DiscoveredTool {
  readonly slug: string;
  readonly toolkit: string;
  readonly description: string;
  readonly inputSchema?: Readonly<Record<string, unknown>>;
  readonly connected: boolean;
}

export interface ToolkitState {
  readonly slug: string;
  readonly name: string;
  readonly connected: boolean;
  readonly connectedAccountId?: string;
}

export interface ToolExecution {
  readonly slug: string;
  readonly ok: boolean;
  readonly logId: string;
  readonly error?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Tool slugs are discovered, never assumed. Everything that reaches a provider goes through
 * `search` first, so a Composio rename shows up as "no tool found" rather than a wrong call.
 */
export class ComposioToolExplorer {
  public constructor(
    private readonly deps: {
      sessions: ComposioSessionProvider;
      logger: Logger;
      /** Where each call is written down for the run's activity record. Optional by design. */
      journal?: ToolJournal | undefined;
    },
  ) {}

  /** The live toolkit list, which is also the only trustworthy source of valid slugs. */
  public async toolkits(): Promise<readonly ToolkitState[]> {
    const session = await this.deps.sessions.session$();
    const { items } = await session.toolkits();
    return items.map((item) => ({
      slug: item.slug,
      name: item.name,
      connected: item.connection?.isActive === true,
      ...(item.connection?.connectedAccount?.id === undefined
        ? {}
        : { connectedAccountId: item.connection.connectedAccount.id }),
    }));
  }

  public async search(input: {
    query: string;
    toolkits?: readonly string[];
  }): Promise<readonly DiscoveredTool[]> {
    const session = await this.deps.sessions.session$();
    const response = await session.search({
      query: input.query,
      ...(input.toolkits === undefined ? {} : { toolkits: [...input.toolkits] }),
    });

    const connected = new Set(
      response.toolkitConnectionStatuses
        .filter((status) => status.hasActiveConnection)
        .map((status) => status.toolkit.toLowerCase()),
    );
    const ranked = response.results.flatMap((result) => result.primaryToolSlugs);
    // Search treats `toolkits` as a hint, not a hard filter — it will happily return a Linear
    // tool for a GitHub question. Re-filter here so a sync can never call the wrong provider.
    const wanted = input.toolkits?.map((slug) => slug.toLowerCase());

    return ranked
      .map((slug) => response.toolSchemas[slug])
      .filter((schema): schema is NonNullable<typeof schema> => schema !== undefined)
      .filter(
        (schema) => wanted === undefined || wanted.includes(schema.toolkit.toLowerCase()),
      )
      .map((schema) => ({
        slug: schema.toolSlug,
        toolkit: schema.toolkit,
        description: schema.description ?? '',
        connected: connected.has(schema.toolkit.toLowerCase()),
        ...(schema.inputSchema === undefined ? {} : { inputSchema: schema.inputSchema }),
      }));
  }

  public async execute(input: {
    slug: string;
    args?: Record<string, unknown>;
    /** Carried only so the journal can say what this call was for; the SDK never sees it. */
    intent?: string;
  }): Promise<ToolExecution> {
    const session = await this.deps.sessions.session$();
    const response = await session.execute(input.slug, input.args ?? {});
    this.deps.logger.info('composio tool executed', {
      slug: input.slug,
      logId: response.logId,
      failed: response.error !== null,
    });
    this.deps.journal?.record({
      slug: input.slug,
      logId: response.logId,
      ok: response.error === null,
      at: Date.now(),
      ...(response.error === null ? {} : { error: response.error }),
      ...(input.intent === undefined ? {} : { intent: input.intent }),
    });
    return {
      slug: input.slug,
      ok: response.error === null,
      logId: response.logId,
      data: response.data,
      ...(response.error === null ? {} : { error: response.error }),
    };
  }

  /** Finds the best tool for an intent and runs it in one step. */
  public async searchAndExecute(input: {
    query: string;
    toolkits?: readonly string[];
    args?: Record<string, unknown>;
  }): Promise<ToolExecution | undefined> {
    const [best] = await this.search({
      query: input.query,
      ...(input.toolkits === undefined ? {} : { toolkits: input.toolkits }),
    });
    if (best === undefined) {
      this.deps.logger.warn('no composio tool matched', { query: input.query });
      return undefined;
    }
    return this.execute({
      slug: best.slug,
      intent: input.query,
      ...(input.args === undefined ? {} : { args: input.args }),
    });
  }
}
