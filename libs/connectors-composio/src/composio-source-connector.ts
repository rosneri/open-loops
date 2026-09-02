import type { Logger, SourceProvider } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type {
  FetchSignalsInput,
  FetchSignalsResult,
  Signal,
  SourceConnector,
} from '@open-loops/signals';
import type { ComposioToolExplorer } from './composio-tool-explorer.js';
import type { SourceCatalog } from '@open-loops/plugin-host';
import { normalise } from './normalizers.js';

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
}

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

    const signals: Signal[] = [];
    for (const intent of intents) {
      signals.push(...(await this.runIntent({ intent, toolkit, input })));
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
        payload: execution.data,
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
}
