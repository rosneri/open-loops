import type { Logger, SourceProvider } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type {
  FetchSignalsInput,
  FetchSignalsResult,
  Signal,
  SourceConnector,
} from '@open-loops/signals';
import type { ComposioToolExplorer, DiscoveredTool } from './composio-tool-explorer.js';
import type { SourceCatalog } from '@open-loops/plugin-host';
import { collectionOf, normalise } from './normalizers.js';

export interface ComposioSourceConnectorDeps {
  readonly explorer: ComposioToolExplorer;
  /**
   * Which apps exist, what upstream calls each of them and what to ask each one for. All three
   * used to be tables in this library; they belong to whoever knows the app, not to the
   * transport that happens to carry it.
   */
  readonly sources: SourceCatalog;
  readonly logger: Logger;
  /**
   * The handles that make a signal "mine", read per sync rather than captured at construction:
   * they live on the account row and can change between one tick and the next.
   */
  readonly meHandles: () => Promise<readonly string[]>;
  /**
   * What this person narrowed a provider to, in words — "in the acme organisation" — read per
   * sync for the same reason the handles are: it is a setting they can change between one tick
   * and the next. `undefined` means everything the connection can see.
   */
  readonly focus: (provider: string) => Promise<string | undefined>;
}

/**
 * The person's narrowing, appended rather than woven in: the intent is a sentence written by
 * whoever knows the app, and a clause on the end is the one edit that cannot change what it was
 * asking for.
 */
const narrow = (intent: string, focus: string | undefined): string =>
  focus === undefined || focus.trim().length === 0 ? intent : `${intent}, ${focus.trim()}`;

/**
 * The first discovered tool that actually takes the id we hold. Rank alone is not enough:
 * search is a similarity query and returns a different winner for the same words on different
 * calls, so "get a meeting" resolves to `get_meeting` once and `get_meeting_by_calendar_id`
 * the next time. They read the same to a ranker and take different ids, and the wrong one does
 * not fail loudly — it succeeds against nothing.
 */
const accepts = (
  tools: readonly DiscoveredTool[],
  argument: string,
): DiscoveredTool | undefined =>
  tools.find((tool) => {
    const properties = (tool.inputSchema?.['properties'] ?? {}) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(properties, argument);
  });

/**
 * The hosted data adapter. It resolves intents to tools, runs them, normalises whatever comes
 * back and stops there — no interpretation, and no writes to any aggregate.
 */
export class ComposioSourceConnector implements SourceConnector {
  public readonly supports: readonly SourceProvider[];

  public constructor(private readonly deps: ComposioSourceConnectorDeps) {
    this.supports = deps.sources.connectable();
  }

  public async fetchSignals(input: FetchSignalsInput): Promise<FetchSignalsResult> {
    const toolkit = this.deps.sources.toolkitFor(input.provider);
    const intents = this.deps.sources.intentsFor(input.provider);
    // A provider with no toolkit cannot be called, and one with no intents has nothing to ask.
    if (toolkit === undefined || intents.length === 0) {
      return { signals: [], cursor: input.since };
    }

    // Asked once for the whole fetch rather than once per intent: it is the same answer for
    // every intent, and reading it is a database round trip.
    const focus = await this.deps.focus(input.provider);

    const signals: Signal[] = [];
    for (const intent of intents) {
      signals.push(...(await this.runIntent({ intent: narrow(intent, focus), toolkit, input })));
    }

    const cursor = signals.reduce<number>(
      (latest, signal) => Math.max(latest, signal.occurredAt),
      input.since,
    );
    return { signals, cursor: asInstant(cursor) };
  }

  private async runIntent(context: {
    intent: string;
    toolkit: string;
    input: FetchSignalsInput;
  }): Promise<readonly Signal[]> {
    try {
      const execution = await this.deps.explorer.searchAndExecute({
        query: context.intent,
        toolkits: [context.toolkit],
      });
      if (!execution?.ok) {
        this.deps.logger.warn('composio intent produced nothing', {
          intent: context.intent,
          error: execution?.error,
        });
        return [];
      }
      return normalise({
        payload: await this.hydrated({ payload: execution.data, ...context }),
        ctx: {
          provider: context.input.provider,
          meHandles: await this.deps.meHandles(),
          fallbackAt: context.input.since,
        },
      });
    } catch (error) {
      this.deps.logger.warn('composio intent failed', {
        intent: context.intent,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Expands each listed row into the thing it summarises, for the sources that declare they need
   * it. A list tool that returns titles and a detail tool that returns the body is a common
   * shape, and normalising the list alone yields signals the extractor correctly refuses to act
   * on — a meeting recap with no action items in it is not a commitment, it is a calendar entry.
   *
   * Every failure here degrades to the unexpanded row rather than losing it: a half-read recap
   * is worth more than a dropped one, and the detail call is the part most likely to rate-limit.
   */
  private async hydrated(context: {
    payload: unknown;
    intent: string;
    toolkit: string;
    input: FetchSignalsInput;
  }): Promise<unknown> {
    const plan = this.deps.sources.hydrateFor(context.input.provider);
    if (plan === undefined) return context.payload;

    const rows = collectionOf(context.payload);
    if (rows.length === 0) return context.payload;

    const detail = accepts(
      await this.deps.explorer.search({ query: plan.intent, toolkits: [context.toolkit] }),
      plan.argument,
    );
    if (detail === undefined) {
      this.deps.logger.warn('no composio tool matched the hydrate intent', {
        intent: plan.intent,
        argument: plan.argument,
      });
      return context.payload;
    }

    const limit = plan.limit ?? 10;
    const expanded: Record<string, unknown>[] = [];
    for (const row of rows.slice(0, limit)) {
      const id = plan.idKeys
        .map((key) => row[key])
        .find((value): value is string => typeof value === 'string' && value.length > 0);
      if (id === undefined) {
        expanded.push(row);
        continue;
      }
      const execution = await this.deps.explorer.execute({
        slug: detail.slug,
        args: { [plan.argument]: id },
      });
      // The row is spread first so the detail wins where they disagree, and the row's own id
      // survives a detail response that does not repeat it.
      expanded.push(execution.ok ? { ...row, ...execution.data } : row);
    }
    // Anything past the cap still becomes a signal, just an unexpanded one.
    return [...expanded, ...rows.slice(limit)];
  }
}
