import type { Clock, DayKey, IdGenerator, Instant, Logger } from '@open-loops/kernel';
import { asMinutes } from '@open-loops/kernel';
import type { OpenLoopRepository, OpenLoopView } from '@open-loops/loops';
import { AcknowledgementState, LoopKind, LoopStatus, isActionable } from '@open-loops/loops';
import type {
  BusyInterval,
  BusyTimeProvider,
  DailyPlan,
  DailyPlanRepository,
  PlanCandidate,
  PlannedBlock,
} from '@open-loops/planning';
import { BlockDisposition, DailyPlan as Plan, asDailyPlanId, asWorkRef } from '@open-loops/planning';

export interface RebalanceDayDeps {
  readonly loops: OpenLoopRepository;
  readonly plans: DailyPlanRepository;
  readonly busyTime: BusyTimeProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface DayWindowPreference {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface RebalanceDayResult {
  readonly day: DayKey;
  readonly blocks: readonly PlannedBlock[];
  readonly deferred: number;
}

const DEFAULT_WINDOW: DayWindowPreference = { startMinute: 9 * 60, endMinute: 18 * 60 };

/**
 * The anticorruption layer between loops and planning, and the tick's last step. A loop that
 * should have been finished at 11:00 and is still open at 12:00 simply lands after whatever is
 * now more urgent, and its slip count goes up — which is how the UI can say "moved four times".
 */
export class RebalanceDayUseCase {
  public constructor(private readonly deps: RebalanceDayDeps) {}

  public async execute(
    preference: DayWindowPreference = DEFAULT_WINDOW,
  ): Promise<RebalanceDayResult> {
    const now = this.deps.clock.now();
    const day = this.deps.clock.dayKey(now);
    const dayStartAt = this.deps.clock.startOfDay(now);

    const plan = await this.loadPlan({ day, dayStartAt, preference, now });
    const views = (await this.deps.loops.list({ actionableOnly: true, limit: 200 })).map((loop) =>
      loop.view(now),
    );
    const busy = await this.busyFor(dayStartAt);

    const blocks = plan.rebalanceWith({
      candidates: views.filter((view) => isActionable(view.status)).map(toCandidate),
      busy,
      now,
    });
    await this.deps.plans.save(plan);

    const deferred = blocks.filter(
      (block) => block.disposition === BlockDisposition.Deferred,
    ).length;
    this.deps.logger.info('rebalanced day', { day, blocks: blocks.length, deferred });
    return { day, blocks, deferred };
  }

  private async loadPlan(input: {
    day: DayKey;
    dayStartAt: Instant;
    preference: DayWindowPreference;
    now: Instant;
  }): Promise<DailyPlan> {
    const existing = await this.deps.plans.findByDay(input.day);
    if (existing !== undefined) return existing;
    return Plan.startDay({
      id: asDailyPlanId(this.deps.ids.next()),
      day: input.day,
      window: {
        dayStartAt: input.dayStartAt,
        startMinute: asMinutes(input.preference.startMinute),
        endMinute: asMinutes(input.preference.endMinute),
      },
      at: input.now,
    });
  }

  private async busyFor(dayStartAt: Instant): Promise<readonly BusyInterval[]> {
    try {
      return await this.deps.busyTime.listBusy({ dayStartAt });
    } catch (error) {
      this.deps.logger.warn('calendar unavailable; planning without meetings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

/**
 * The translation itself. The scheduler learns four booleans about a loop and nothing else —
 * it has no idea what a "loop kind" is, which is what keeps the two contexts independent.
 */
const toCandidate = (view: OpenLoopView): PlanCandidate => ({
  ref: asWorkRef(view.id),
  estimate: view.estimate,
  weight: view.priority,
  isOverdue: view.isOverdue,
  awaitingOnlyAcknowledgement:
    view.status === LoopStatus.DoneUnconfirmed ||
    view.assessment.acknowledgement === AcknowledgementState.Pending,
  isStarted: view.status === LoopStatus.InProgress,
  isExternalRequest: view.kind === LoopKind.IncomingRequest,
  ...(view.dueAt === undefined ? {} : { dueAt: view.dueAt }),
});
