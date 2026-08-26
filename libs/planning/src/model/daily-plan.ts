import { DomainError, type DayKey, type Instant, type TimeRange } from '@open-loops/kernel';
import type { DailyPlanId, WorkRef } from './ids.js';
import type { PlanCandidate } from './plan-candidate.js';
import type { BusyInterval, PlannedBlock } from './planned-block.js';
import type { PlanWindow } from './plan-scheduler.js';
import { rebalance } from './plan-scheduler.js';

export interface DailyPlanProps {
  readonly id: DailyPlanId;
  readonly day: DayKey;
  readonly window: PlanWindow;
  readonly blocks: readonly PlannedBlock[];
  readonly manualOrder: ReadonlyMap<WorkRef, number>;
  readonly generatedAt: Instant;
}

/**
 * One day, one plan. The aggregate stores only what a human touched — the pin and the drag
 * order. Everything else is recomputed on every tick, which is why "I didn't do it, push it
 * down" needs no migration logic at all.
 */
export class DailyPlan {
  private props: DailyPlanProps;

  private constructor(props: DailyPlanProps) {
    this.props = props;
  }

  public static rehydrate(props: DailyPlanProps): DailyPlan {
    return new DailyPlan(props);
  }

  public static startDay(input: {
    id: DailyPlanId;
    day: DayKey;
    window: PlanWindow;
    at: Instant;
  }): DailyPlan {
    return new DailyPlan({
      id: input.id,
      day: input.day,
      window: input.window,
      blocks: [],
      manualOrder: new Map(),
      generatedAt: input.at,
    });
  }

  public get id(): DailyPlanId {
    return this.props.id;
  }

  public get day(): DayKey {
    return this.props.day;
  }

  public snapshot(): DailyPlanProps {
    return this.props;
  }

  public blocks(): readonly PlannedBlock[] {
    return this.props.blocks;
  }

  public rebalanceWith(input: {
    candidates: readonly PlanCandidate[];
    busy: readonly BusyInterval[];
    now: Instant;
  }): readonly PlannedBlock[] {
    const blocks = rebalance({
      now: input.now,
      window: this.props.window,
      candidates: input.candidates,
      busy: input.busy,
      previous: this.props.blocks,
      manualOrder: this.props.manualOrder,
    });
    this.props = { ...this.props, blocks, generatedAt: input.now };
    return blocks;
  }

  /** Dragging a block pins its time and records the intent, so later ticks respect it. */
  public pin(input: { ref: WorkRef; range: TimeRange }): void {
    if (!this.props.blocks.some((block) => block.ref === input.ref)) {
      throw new DomainError('BLOCK_NOT_IN_PLAN', `${input.ref} is not in today's plan.`);
    }
    this.props = {
      ...this.props,
      blocks: this.props.blocks.map((block) =>
        block.ref === input.ref ? { ...block, range: input.range, pinned: true } : block,
      ),
    };
  }

  public unpin(ref: WorkRef): void {
    this.props = {
      ...this.props,
      blocks: this.props.blocks.map((block) =>
        block.ref === ref ? { ...block, pinned: false } : block,
      ),
    };
  }

  public setManualRank(input: { ref: WorkRef; rank: number }): void {
    const manualOrder = new Map(this.props.manualOrder);
    manualOrder.set(input.ref, input.rank);
    this.props = { ...this.props, manualOrder };
  }

  public clearManualOrder(): void {
    this.props = { ...this.props, manualOrder: new Map() };
  }
}
