import type { OpenLoop, OpenLoopId, OpenLoopProps, OpenLoopQuery, OpenLoopRepository } from '@open-loops/loops';
import { LoopStatus } from '@open-loops/loops';
import type { PrismaClient } from '../prisma-client.js';
import { criterionRows, evidenceRows, toDomain, toScalars } from '../mappers/open-loop.mapper.js';

const INCLUDE = { criteria: true, evidence: true } as const;

/**
 * Writes the whole aggregate in one transaction. Criteria are replaced wholesale — they are the
 * model's revisable opinion of "done" — while evidence is only ever appended, because losing an
 * observation would silently reopen a closed loop.
 */
export class PrismaOpenLoopRepository implements OpenLoopRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findById(id: OpenLoopId): Promise<OpenLoop | undefined> {
    const row = await this.prisma.openLoop.findUnique({ where: { id }, include: INCLUDE });
    return row === null ? undefined : toDomain(row);
  }

  public async findBySourceKey(key: string): Promise<OpenLoop | undefined> {
    const row = await this.prisma.openLoop.findUnique({
      where: { sourceKey: key },
      include: INCLUDE,
    });
    return row === null ? undefined : toDomain(row);
  }

  public async list(query: OpenLoopQuery): Promise<readonly OpenLoop[]> {
    const rows = await this.prisma.openLoop.findMany({
      where: {
        ...(query.providers === undefined ? {} : { provider: { in: [...query.providers] } }),
        ...(query.updatedSince === undefined
          ? {}
          : { updatedAt: { gte: new Date(query.updatedSince) } }),
        ...(query.actionableOnly === true ? { manualState: null } : {}),
      },
      include: INCLUDE,
      orderBy: { updatedAt: 'desc' },
      ...(query.limit === undefined ? {} : { take: query.limit }),
    });
    const loops = rows.map(toDomain);
    return query.actionableOnly === true ? loops.filter(isStillOpen) : loops;
  }

  public async save(loop: OpenLoop): Promise<void> {
    await this.persist(loop.snapshot());
  }

  public async saveMany(loops: readonly OpenLoop[]): Promise<void> {
    for (const loop of loops) await this.persist(loop.snapshot());
  }

  public async delete(id: OpenLoopId): Promise<void> {
    await this.prisma.openLoop.deleteMany({ where: { id } });
  }

  /**
   * One batched round trip rather than an interactive transaction. The old version read the
   * evidence count mid-transaction to decide what to append, which meant holding a connection
   * across several round trips — fine against localhost, pool exhaustion from a lambda talking
   * to a hosted database. The unique key on evidence makes the append idempotent instead.
   */
  private async persist(props: OpenLoopProps): Promise<void> {
    const scalars = toScalars(props);
    const criteria = criterionRows(props);
    const evidence = evidenceRows(props);

    await this.prisma.$transaction([
      this.prisma.openLoop.upsert({
        where: { id: props.id },
        create: { id: props.id, ...scalars },
        update: scalars,
      }),
      this.prisma.criterion.deleteMany({
        where: { loopId: props.id, id: { notIn: props.criteria.map((item) => item.id) } },
      }),
      ...criteria.map((criterion) =>
        this.prisma.criterion.upsert({
          where: { id: criterion.id },
          create: { ...criterion, loopId: props.id },
          update: { probe: criterion.probe, role: criterion.role, optional: criterion.optional },
        }),
      ),
      this.prisma.evidenceRecord.createMany({
        data: evidence.map((item) => ({ ...item, loopId: props.id })),
        skipDuplicates: true,
      }),
    ]);
  }
}

/** The `manualState` filter cannot see snoozes, which depend on the clock; finish the job here. */
const isStillOpen = (loop: OpenLoop): boolean => {
  const status = loop.view(loop.snapshot().updatedAt).status;
  return status !== LoopStatus.Done && status !== LoopStatus.Dropped;
};
