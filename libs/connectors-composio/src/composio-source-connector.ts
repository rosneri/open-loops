import type { Logger, SourceProvider } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type {
  FetchSignalsInput,
  FetchSignalsResult,
  Signal,
  SourceConnector,
} from '@open-loops/signals';
import type { ComposioToolExplorer } from './composio-tool-explorer.js';
import { COMPOSIO_PROVIDERS, toolkitSlugFor } from './composio-session.js';
import { normalise } from './normalizers.js';

/**
 * What we want from each provider, phrased as an intent rather than a tool name. Composio's
 * search resolves the intent to a real tool at run time, so a renamed or replaced tool keeps
 * working and we never hard-code a slug.
 *
 * Each intent names its provider out loud. Composio treats the `toolkits` argument as a ranking
 * hint rather than a filter, so "list issues assigned to me" alone will happily return a Linear
 * tool for a GitHub sync; saying "on GitHub" is what pins it.
 */
const INTENTS: Partial<Record<SourceProvider, readonly string[]>> = {
  SLACK: ['search Slack messages that mention me or are addressed to me'],
  GITHUB: [
    'list my GitHub notifications and issues assigned to me',
    'search GitHub for open pull requests I authored or that await my review',
  ],
  LINEAR: ['list Linear issues assigned to me that are not done'],
  GMAIL: ['list unread Gmail messages in my inbox'],
  GOOGLE_CALENDAR: ["list today's events from my primary Google Calendar"],
  JIRA: ['search Jira for unresolved issues assigned to me'],
  NOTION: ['search Notion for pages I recently edited'],
  GOOGLE_DRIVE: ['list files recently modified in my Google Drive'],
  WHATSAPP: ['list my recent WhatsApp messages and unread chats'],
};

export interface ComposioSourceConnectorDeps {
  readonly explorer: ComposioToolExplorer;
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
  public readonly supports = COMPOSIO_PROVIDERS;

  public constructor(private readonly deps: ComposioSourceConnectorDeps) {}

  public async fetchSignals(input: FetchSignalsInput): Promise<FetchSignalsResult> {
    const toolkit = toolkitSlugFor(input.provider);
    const intents = INTENTS[input.provider];
    if (toolkit === undefined || intents === undefined) {
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
