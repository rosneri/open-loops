import type { DayKey } from '@open-loops/kernel';
import type { DailyPlan, DailyPlanRepository } from '@open-loops/planning';
import type { PrismaClient } from '../prisma-client.js';
import { blockRows, toDomain, toScalars } from '../mappers/daily-plan.mapper.js';

export class PrismaDailyPlanRepository implements DailyPlanRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findByDay(day: DayKey): Promise<DailyPlan | undefined> {
    const row = await this.prisma.dailyPlan.findUnique({
      where: { day },
      include: { blocks: true },
    });
    return row === null ? undefined : toDomain(row);
  }

  public async save(plan: DailyPlan): Promise<void> {
    const props = plan.snapshot();
    const scalars = toScalars(props);
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyPlan.upsert({
        where: { id: props.id },
        create: { id: props.id, ...scalars },
        update: scalars,
      });
      await tx.planBlock.deleteMany({ where: { planId: props.id } });
      const rows = blockRows(props);
      if (rows.length > 0) {
        await tx.planBlock.createMany({
          data: rows.map((block) => ({ ...block, planId: props.id })),
        });
      }
    });
  }
}
