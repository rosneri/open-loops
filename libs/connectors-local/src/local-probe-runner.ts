import type { Instant } from '@open-loops/kernel';
import type { Evidence, Probe, ProbeRequest, ProbeRunner } from '@open-loops/loops';
import { EvidenceVerdict, isObservable } from '@open-loops/loops';

/** The slice of the probe queue this runner needs. The Prisma store satisfies it structurally. */
export interface ProbeTaskQueue {
  takeAnswer(
    criterionId: string,
    at: number,
  ): Promise<{ verdict: string; summary: string; url: string | null } | undefined>;
  enqueue(input: {
    loopId: string;
    criterionId: string;
    probe: Probe;
    at: number;
  }): Promise<void>;
}

/**
 * The local answer to "did it actually happen". A tick cannot call Slack itself, so it leaves
 * the question on a queue; the agent polls `GET /api/agent/probes`, checks the real world with
 * the sessions it already holds, and posts the answer back. The next tick picks it up.
 */
export class LocalProbeRunner implements ProbeRunner {
  public constructor(private readonly queue: ProbeTaskQueue) {}

  public canRun(probe: Probe): boolean {
    return isObservable(probe);
  }

  public async run(request: ProbeRequest): Promise<Evidence> {
    const answered = await this.queue.takeAnswer(request.criterionId, request.at);
    if (answered !== undefined) {
      return {
        criterionId: request.criterionId,
        verdict: toVerdict(answered.verdict),
        observedAt: request.at,
        summary: answered.summary.length > 0 ? answered.summary : request.probe.describedAs,
        ...(answered.url === null ? {} : { url: answered.url }),
      };
    }

    await this.queue.enqueue({
      loopId: request.loopId,
      criterionId: request.criterionId,
      probe: request.probe,
      at: request.at,
    });
    return pending(request.criterionId, request.at);
  }
}

const toVerdict = (raw: string): Evidence['verdict'] =>
  raw === EvidenceVerdict.Satisfied || raw === EvidenceVerdict.NotSatisfied
    ? raw
    : EvidenceVerdict.Inconclusive;

const pending = (criterionId: Evidence['criterionId'], at: Instant): Evidence => ({
  criterionId,
  verdict: EvidenceVerdict.Inconclusive,
  observedAt: at,
  summary: 'queued for the local agent to verify',
});
