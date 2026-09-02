import type { Logger } from '@open-loops/kernel';
import type { Evidence, Probe, ProbeRequest, ProbeRunner } from '@open-loops/loops';
import { EvidenceVerdict, probeProvider } from '@open-loops/loops';
import type { ToolBroker } from '@open-loops/plugin-api';

/**
 * How one probe kind asks its question and reads the answer. The interesting property is that
 * `satisfied` is a plain predicate over the response: the model proposed the question, and
 * nothing but code decides whether the world agrees.
 */
export interface ToolQuestion {
  /** What to ask the broker's tool search for. Said in words, never as a slug. */
  intent(probe: Probe): string;
  satisfied(payload: unknown, probe: Probe): boolean;
}

export interface ToolProbeRunnerDeps {
  readonly tools: ToolBroker;
  readonly question: ToolQuestion;
  readonly logger: Logger;
}

/**
 * The shared body of every observable probe. It used to be one class with a table of eight
 * questions in it, which meant a new kind edited a file in a connector library that had nothing
 * else to do with it. Now each kind brings its own question and this brings the machinery.
 */
export class ToolProbeRunner implements ProbeRunner {
  public constructor(private readonly deps: ToolProbeRunnerDeps) {}

  public canRun(_probe: Probe): boolean {
    return true;
  }

  public async run(request: ProbeRequest): Promise<Evidence> {
    const provider = probeProvider(request.probe);
    try {
      const execution = await this.deps.tools.execute({
        query: this.deps.question.intent(request.probe),
        ...(provider === undefined ? {} : { providers: [provider] }),
      });
      if (execution?.ok !== true) {
        return this.inconclusive(request, execution?.error ?? 'no matching tool');
      }
      const satisfied = this.deps.question.satisfied(execution.data, request.probe);
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

  /**
   * Everything that is not a clear yes or no is inconclusive, and inconclusive evidence is
   * deliberately skipped when completion is assessed. A rate-limited call must not be able to
   * reopen a loop that was closed an hour ago.
   */
  private inconclusive(request: ProbeRequest, reason: string): Evidence {
    this.deps.logger.debug('probe inconclusive', { reason, kind: request.probe.kind });
    return {
      criterionId: request.criterionId,
      verdict: EvidenceVerdict.Inconclusive,
      observedAt: request.at,
      summary: reason,
    };
  }
}
