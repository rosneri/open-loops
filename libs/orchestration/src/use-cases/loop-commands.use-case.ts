import type { Clock, Instant, TimeRange } from '@open-loops/kernel';
import { DomainError } from '@open-loops/kernel';
import type { LoopEventPublisher, OpenLoop, OpenLoopId, OpenLoopRepository } from '@open-loops/loops';
import type { DailyPlanRepository } from '@open-loops/planning';
import { asWorkRef } from '@open-loops/planning';

export interface LoopCommandsDeps {
  readonly loops: OpenLoopRepository;
  readonly plans: DailyPlanRepository;
  readonly events: LoopEventPublisher;
  readonly clock: Clock;
}

/**
 * The handful of things a human may do to a loop by hand. Everything else about a loop's state
 * is derived, so this surface stays deliberately small.
 */
export class LoopCommandsUseCase {
  public constructor(private readonly deps: LoopCommandsDeps) {}

  public async snooze(input: { loopId: OpenLoopId; until: Instant }): Promise<void> {
    await this.mutate(input.loopId, (loop, at) => loop.snooze({ until: input.until, at }));
  }

  public async drop(input: { loopId: OpenLoopId; reason: string }): Promise<void> {
    await this.mutate(input.loopId, (loop, at) => loop.drop({ reason: input.reason, at }));
  }

  public async confirmDone(input: { loopId: OpenLoopId; reason: string }): Promise<void> {
    await this.mutate(input.loopId, (loop, at) => loop.confirmDone({ reason: input.reason, at }));
  }

  public async reopen(loopId: OpenLoopId): Promise<void> {
    await this.mutate(loopId, (loop, at) => loop.reopen(at));
  }

  public async pinBlock(input: { loopId: OpenLoopId; range: TimeRange }): Promise<void> {
    const plan = await this.todaysPlan();
    plan.pin({ ref: asWorkRef(input.loopId), range: input.range });
    await this.deps.plans.save(plan);
  }

  public async reorder(input: { loopId: OpenLoopId; rank: number }): Promise<void> {
    const plan = await this.todaysPlan();
    plan.setManualRank({ ref: asWorkRef(input.loopId), rank: input.rank });
    await this.deps.plans.save(plan);
  }

  private async todaysPlan() {
    const now = this.deps.clock.now();
    const plan = await this.deps.plans.findByDay(this.deps.clock.dayKey(now));
    if (plan === undefined) throw new DomainError('NO_PLAN', 'There is no plan for today yet.');
    return plan;
  }

  private async mutate(
    loopId: OpenLoopId,
    change: (loop: OpenLoop, at: Instant) => void,
  ): Promise<void> {
    const loop = await this.deps.loops.findById(loopId);
    if (loop === undefined) throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}.`);
    change(loop, this.deps.clock.now());
    await this.deps.loops.save(loop);
    await this.deps.events.publish(loop.pullEvents());
  }
}
