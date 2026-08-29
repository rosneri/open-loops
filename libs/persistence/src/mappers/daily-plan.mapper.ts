import { asDayKey, asMinutes } from '@open-loops/kernel';
import type { DailyPlanProps, PlannedBlock, WorkRef } from '@open-loops/planning';
import { DailyPlan, asDailyPlanId, asWorkRef } from '@open-loops/planning';
import type { DailyPlan as DailyPlanRow, PlanBlock, Prisma } from '../generated/prisma/client.js';
import { toDate, toInstant, toJson } from './primitives.js';

export type DailyPlanRowWithBlocks = DailyPlanRow & { blocks: PlanBlock[] };

export type DailyPlanWrite = Omit<DailyPlanRow, 'id' | 'ownerId' | 'manualOrder'> & {
  manualOrder: Prisma.InputJsonValue;
};

const toManualOrder = (raw: unknown): ReadonlyMap<WorkRef, number> => {
  if (typeof raw !== 'object' || raw === null) return new Map();
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([key, value]): [WorkRef, number] => [asWorkRef(key), value]);
  return new Map(entries);
};

const toBlock = (row: PlanBlock): PlannedBlock => ({
  ref: asWorkRef(row.loopId),
  range: { startAt: toInstant(row.startAt), endAt: toInstant(row.endAt) },
  order: row.position,
  disposition: row.disposition as PlannedBlock['disposition'],
  slipCount: row.slipCount,
  pinned: row.pinned,
});

export const toDomain = (row: DailyPlanRowWithBlocks): DailyPlan =>
  DailyPlan.rehydrate({
    id: asDailyPlanId(row.id),
    day: asDayKey(row.day),
    window: {
      dayStartAt: toInstant(row.dayStartAt),
      startMinute: asMinutes(row.startMinute),
      endMinute: asMinutes(row.endMinute),
    },
    blocks: row.blocks.map(toBlock).sort((left, right) => left.order - right.order),
    manualOrder: toManualOrder(row.manualOrder),
    generatedAt: toInstant(row.generatedAt),
  });

export const toScalars = (props: DailyPlanProps): DailyPlanWrite => ({
  day: props.day,
  dayStartAt: toDate(props.window.dayStartAt),
  startMinute: Math.round(props.window.startMinute),
  endMinute: Math.round(props.window.endMinute),
  manualOrder: toJson(Object.fromEntries(props.manualOrder)),
  generatedAt: toDate(props.generatedAt),
});

export const blockRows = (props: DailyPlanProps): readonly Omit<PlanBlock, 'id' | 'planId'>[] =>
  props.blocks.map((block) => ({
    loopId: block.ref,
    startAt: toDate(block.range.startAt),
    endAt: toDate(block.range.endAt),
    position: block.order,
    disposition: block.disposition,
    slipCount: block.slipCount,
    pinned: block.pinned,
  }));
