import type { Logger } from '@open-loops/kernel';
import type { Evidence, Probe, ProbeRequest, ProbeRunner } from '@open-loops/loops';
import { EvidenceVerdict, ProbeKind, probeProvider } from '@open-loops/loops';
import type { ComposioToolExplorer } from './composio-tool-explorer.js';
import { toolkitSlugFor } from './composio-session.js';

interface ProbeQuestion {
  /** What to ask Composio's tool search for. Never a slug. */
  readonly intent: (probe: Probe) => string;
  /** Reads the raw tool result and answers the yes/no question. No model involved. */
  readonly satisfied: (payload: unknown, probe: Probe) => boolean;
}

const asArray = (payload: unknown): readonly unknown[] => {
  if (Array.isArray(payload)) return payload;
  const record = typeof payload === 'object' && payload !== null ? payload : {};
  for (const key of ['items', 'data', 'results', 'messages', 'nodes']) {
    const value = (record as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const textOf = (value: unknown): string => JSON.stringify(value ?? '').toLowerCase();

const includesAll = (haystack: unknown, needles: readonly (string | undefined)[]): boolean => {
  const text = textOf(haystack);
  return needles
    .filter((needle): needle is string => needle !== undefined && needle.length > 0)
    .every((needle) => text.includes(needle.toLowerCase()));
};

const field = (probe: Probe, key: string): string | undefined => {
  const value = (probe as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

const QUESTIONS: Partial<Record<Probe['kind'], ProbeQuestion>> = {
  [ProbeKind.PullRequestExists]: {
    intent: (probe) => `list open GitHub pull requests in the repository ${field(probe, 'repository') ?? ''}`,
    satisfied: (payload, probe) =>
      asArray(payload).some((item) =>
        includesAll(item, [field(probe, 'titleContains'), field(probe, 'branchContains')]),
      ),
  },
  [ProbeKind.PullRequestMerged]: {
    intent: (probe) => `list merged GitHub pull requests in ${field(probe, 'repository') ?? ''}`,
    satisfied: (payload) => asArray(payload).some((item) => textOf(item).includes('"merged_at":"')),
  },
  [ProbeKind.ReviewSubmitted]: {
    intent: (probe) => `list GitHub reviews on pull request ${field(probe, 'pullRequestRef') ?? ''}`,
    satisfied: (payload) => asArray(payload).length > 0,
  },
  [ProbeKind.IssueClosed]: {
    intent: (probe) => `get the issue ${field(probe, 'issueRef') ?? ''} and its state`,
    satisfied: (payload) => /"(state|status)":\s*"(closed|done|completed)"/i.test(textOf(payload)),
  },
  [ProbeKind.IssueStatusIs]: {
    intent: (probe) => `get the issue ${field(probe, 'issueRef') ?? ''} and its status`,
    satisfied: (payload, probe) => includesAll(payload, [field(probe, 'status')]),
  },
  [ProbeKind.RepliedInThread]: {
    intent: (probe) => `read the Slack message thread ${field(probe, 'threadRef') ?? ''}`,
    satisfied: (payload) => asArray(payload).length > 1,
  },
  [ProbeKind.MessageSentTo]: {
    intent: (probe) => `search Slack for messages I sent to ${field(probe, 'recipientRef') ?? ''}`,
    satisfied: (payload) => asArray(payload).length > 0,
  },
  [ProbeKind.EmailSent]: {
    intent: (probe) => `search my Gmail sent mail for messages to ${field(probe, 'toEmail') ?? ''}`,
    satisfied: (payload) => asArray(payload).length > 0,
  },
};

/**
 * Runs a probe as a Composio tool call. The interesting property is that the verdict is a plain
 * predicate over the response — the model never gets to decide whether the PR is there.
 */
export class ComposioProbeRunner implements ProbeRunner {
  public constructor(
    private readonly deps: { explorer: ComposioToolExplorer; logger: Logger },
  ) {}

  public canRun(probe: Probe): boolean {
    return QUESTIONS[probe.kind] !== undefined;
  }

  public async run(request: ProbeRequest): Promise<Evidence> {
    const question = QUESTIONS[request.probe.kind];
    if (question === undefined) return this.inconclusive(request, 'no question for this probe');

    const provider = probeProvider(request.probe);
    const toolkit = provider === undefined ? undefined : toolkitSlugFor(provider);

    try {
      const execution = await this.deps.explorer.searchAndExecute({
        query: question.intent(request.probe),
        ...(toolkit === undefined ? {} : { toolkits: [toolkit] }),
      });
      if (execution === undefined || !execution.ok) {
        return this.inconclusive(request, execution?.error ?? 'no matching tool');
      }
      const satisfied = question.satisfied(execution.data, request.probe);
      return {
        criterionId: request.criterionId,
        verdict: satisfied ? EvidenceVerdict.Satisfied : EvidenceVerdict.NotSatisfied,
        observedAt: request.at,
        summary: `${execution.slug}: ${satisfied ? 'found' : 'not found'} — ${request.probe.describedAs}`,
      };
    } catch (error) {
      return this.inconclusive(request, error instanceof Error ? error.message : String(error));
    }
  }

  private inconclusive(request: ProbeRequest, reason: string): Evidence {
    this.deps.logger.debug('probe inconclusive', { reason });
    return {
      criterionId: request.criterionId,
      verdict: EvidenceVerdict.Inconclusive,
      observedAt: request.at,
      summary: reason,
    };
  }
}
