import type { Logger } from '@open-loops/kernel';
import type { PendingProbeDto, ProbeAnswerDto } from '@open-loops/contracts';
import type { Probe } from '@open-loops/loops';
import type { PrismaClient } from '../prisma-client.js';
import { toJson } from '../mappers/primitives.js';

export interface EnqueuedProbe {
  readonly loopId: string;
  readonly criterionId: string;
  readonly probe: Probe;
  readonly at: number;
}

export interface AnsweredProbe {
  readonly verdict: string;
  readonly summary: string;
  readonly url: string | null;
}

/**
 * The queue behind local mode. A tick asks a question, the agent answers it out of band, and
 * the answer is consumed exactly once — so a stale verdict can never be counted twice.
 */
export class PrismaProbeTaskStore {
  public constructor(private readonly deps: { prisma: PrismaClient; logger: Logger }) {}

  public async takeAnswer(criterionId: string, at: number): Promise<AnsweredProbe | undefined> {
    const answered = await this.deps.prisma.probeTask.findFirst({
      where: { criterionId, answeredAt: { not: null }, consumedAt: null },
      orderBy: { answeredAt: 'desc' },
    });
    if (answered === null) return undefined;
    await this.deps.prisma.probeTask.update({
      where: { id: answered.id },
      data: { consumedAt: new Date(at) },
    });
    return { verdict: answered.verdict ?? '', summary: answered.summary ?? '', url: answered.url };
  }

  /** Only one open question per criterion; re-asking every hour would flood the agent. */
  public async enqueue(request: EnqueuedProbe): Promise<void> {
    const pending = await this.deps.prisma.probeTask.count({
      where: { criterionId: request.criterionId, answeredAt: null },
    });
    if (pending > 0) return;
    await this.deps.prisma.probeTask.create({
      data: {
        loopId: request.loopId,
        criterionId: request.criterionId,
        probe: toJson(request.probe),
        describedAs: request.probe.describedAs,
        requestedAt: new Date(request.at),
      },
    });
  }

  public async pending(limit = 50): Promise<readonly PendingProbeDto[]> {
    const rows = await this.deps.prisma.probeTask.findMany({
      where: { answeredAt: null },
      orderBy: { requestedAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      loopId: row.loopId,
      criterionId: row.criterionId,
      describedAs: row.describedAs,
      probe: row.probe as Readonly<Record<string, unknown>>,
      requestedAt: row.requestedAt.toISOString(),
    }));
  }

  public async answer(answers: readonly ProbeAnswerDto[]): Promise<number> {
    let applied = 0;
    for (const answer of answers) {
      const result = await this.deps.prisma.probeTask.updateMany({
        where: { id: answer.id, answeredAt: null },
        data: {
          answeredAt: new Date(),
          verdict: answer.verdict,
          summary: answer.summary,
          url: answer.url ?? null,
        },
      });
      applied += result.count;
    }
    this.deps.logger.info('agent answered probes', { applied, requested: answers.length });
    return applied;
  }
}
