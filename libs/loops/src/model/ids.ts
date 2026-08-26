import type { Brand } from '@open-loops/kernel';

export type OpenLoopId = Brand<string, 'OpenLoopId'>;
export type CriterionId = Brand<string, 'CriterionId'>;

export const asOpenLoopId = (value: string): OpenLoopId => value as OpenLoopId;
export const asCriterionId = (value: string): CriterionId => value as CriterionId;
