import type { Clock } from '@open-loops/kernel';
import type { LoopDto, LoopStatusDto, TodayDto } from '@open-loops/contracts';
import type { OpenLoopRepository, OpenLoopView } from '@open-loops/loops';
import { EvidenceVerdict, isActionable, latestConclusiveByCriterion } from '@open-loops/loops';
import type { DailyPlanRepository, PlannedBlock } from '@open-loops/planning';
import { asWorkRef } from '@open-loops/planning';

export interface TodayViewDeps {
  readonly loops: OpenLoopRepository;
  readonly plans: DailyPlanRepository;
  readonly clock: Clock;
  readonly timeZone: string;
}

const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_END_MINUTE = 18 * 60;
const MINUTE_MS = 60_000;

/**
 * A read model, not a use case: it assembles exactly what a client renders and mutates nothing.
 * Keeping it separate is what stops the timeline from slowly growing business rules of its own.
 */
export class TodayViewQuery {
  public constructor(private readonly deps: TodayViewDeps) {}

  public async execute(): Promise<TodayDto> {
    const now = this.deps.clock.now();
    const day = this.deps.clock.dayKey(now);
    const dayStartAt = this.deps.clock.startOfDay(now);

    const plan = await this.deps.plans.findByDay(day);
    const blocks = new Map((plan?.blocks() ?? []).map((block) => [String(block.ref), block]));
    const views = (await this.deps.loops.list({ limit: 300 })).map((loop) => loop.view(now));

    const items = views
      .filter((view) => isActionable(view.status) || blocks.has(view.id))
      .map((view) => toLoopDto({ view, block: blocks.get(String(asWorkRef(view.id))) }))
      .sort((left, right) => (left.startAt ?? Infinity) - (right.startAt ?? Infinity));

    const window = plan?.snapshot().window;
    return {
      day,
      now,
      timeZone: this.deps.timeZone,
      windowStartAt: dayStartAt + (window?.startMinute ?? DEFAULT_START_MINUTE) * MINUTE_MS,
      windowEndAt: dayStartAt + (window?.endMinute ?? DEFAULT_END_MINUTE) * MINUTE_MS,
      items,
      counts: tally(views.map((view) => view.status)),
    };
  }
}

const toLoopDto = (input: { view: OpenLoopView; block: PlannedBlock | undefined }): LoopDto => {
  const { view, block } = input;
  const latest = latestConclusiveByCriterion(view.evidence);
  return {
    id: view.id,
    title: view.title,
    summary: view.summary,
    kind: view.kind,
    status: view.status,
    provider: view.source.provider,
    progress: view.assessment.progress,
    estimateMinutes: view.estimate,
    slipCount: block?.slipCount ?? 0,
    isOverdue: view.isOverdue,
    ...(view.source.url === undefined ? {} : { url: view.source.url }),
    ...(view.counterparty === undefined ? {} : { counterparty: view.counterparty.displayName }),
    ...(view.dueAt === undefined ? {} : { dueAt: view.dueAt }),
    ...(view.lastCheckedAt === undefined ? {} : { lastCheckedAt: view.lastCheckedAt }),
    ...(block === undefined
      ? {}
      : {
          startAt: block.range.startAt,
          endAt: block.range.endAt,
          disposition: block.disposition,
        }),
    criteria: view.criteria.map((criterion) => ({
      id: criterion.id,
      role: criterion.role,
      label: criterion.probe.describedAs,
      satisfied: latest.get(criterion.id)?.verdict === EvidenceVerdict.Satisfied,
    })),
  };
};

const tally = (statuses: readonly LoopStatusDto[]): Record<LoopStatusDto, number> => {
  const counts: Record<LoopStatusDto, number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    DONE_UNCONFIRMED: 0,
    DONE: 0,
    SNOOZED: 0,
    DROPPED: 0,
  };
  for (const status of statuses) counts[status] += 1;
  return counts;
};
