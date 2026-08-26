import { optional } from '@open-loops/kernel';
import type { SourceProvider } from '@open-loops/kernel';
import { asMinutes } from '@open-loops/kernel';
import type {
  CompletionCriterion,
  Evidence,
  OpenLoopProps,
  Party,
  Probe,
  SourceRef,
} from '@open-loops/loops';
import { OpenLoop, asCriterionId, asOpenLoopId, sourceKey } from '@open-loops/loops';
import type {
  Criterion,
  EvidenceRecord,
  OpenLoop as OpenLoopRow,
  Prisma,
} from '../generated/prisma/client.js';
import { toDate, toInstant, toJson } from './primitives.js';

export type OpenLoopRowWithRelations = OpenLoopRow & {
  criteria: Criterion[];
  evidence: EvidenceRecord[];
};

export type CriterionWrite = Omit<Criterion, 'loopId' | 'probe'> & {
  probe: Prisma.InputJsonValue;
};

const toCriterion = (row: Criterion): CompletionCriterion => ({
  id: asCriterionId(row.id),
  role: row.role as CompletionCriterion['role'],
  optional: row.optional,
  probe: row.probe as unknown as Probe,
});

const toEvidence = (row: EvidenceRecord): Evidence => ({
  criterionId: asCriterionId(row.criterionId),
  verdict: row.verdict as Evidence['verdict'],
  observedAt: toInstant(row.observedAt),
  summary: row.summary,
  ...optional('url', row.url),
});

const toSource = (row: OpenLoopRow): SourceRef => ({
  provider: row.provider as SourceProvider,
  externalId: row.externalId,
  occurredAt: toInstant(row.occurredAt),
  ...optional('threadRef', row.threadRef),
  ...optional('url', row.url),
  ...optional('channel', row.channel),
});

const toParty = (row: OpenLoopRow): Party | undefined => {
  if (row.counterpartyName === null) return undefined;
  return {
    displayName: row.counterpartyName,
    ...optional('handle', row.counterpartyHandle),
    ...optional('email', row.counterpartyEmail),
    ...optional('importance', row.counterpartyImportance as Party['importance']),
  };
};

export const toDomain = (row: OpenLoopRowWithRelations): OpenLoop => {
  const counterparty = toParty(row);
  const props: OpenLoopProps = {
    id: asOpenLoopId(row.id),
    kind: row.kind as OpenLoopProps['kind'],
    title: row.title,
    summary: row.summary,
    source: toSource(row),
    ...optional('counterparty', counterparty),
    criteria: row.criteria.map(toCriterion),
    evidence: row.evidence.map(toEvidence),
    ...optional('dueAt', row.dueAt === null ? null : toInstant(row.dueAt)),
    ...optional('promisedFor', row.promisedFor === null ? null : toInstant(row.promisedFor)),
    estimate: asMinutes(row.estimateMinutes),
    priority: row.priority,
    confidence: row.confidence,
    ...optional(
      'manualResolution',
      row.manualState === null
        ? null
        : { state: row.manualState as 'DONE' | 'DROPPED', reason: row.manualReason ?? '' },
    ),
    ...optional('snoozedUntil', row.snoozedUntil === null ? null : toInstant(row.snoozedUntil)),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
    ...optional('lastCheckedAt', row.lastCheckedAt === null ? null : toInstant(row.lastCheckedAt)),
  };
  return OpenLoop.rehydrate(props);
};

const sourceColumns = (props: OpenLoopProps) => ({
  sourceKey: sourceKey(props.source),
  provider: props.source.provider,
  externalId: props.source.externalId,
  threadRef: props.source.threadRef ?? null,
  url: props.source.url ?? null,
  channel: props.source.channel ?? null,
  occurredAt: toDate(props.source.occurredAt),
});

const partyColumns = (props: OpenLoopProps) => ({
  counterpartyName: props.counterparty?.displayName ?? null,
  counterpartyHandle: props.counterparty?.handle ?? null,
  counterpartyEmail: props.counterparty?.email ?? null,
  counterpartyImportance: props.counterparty?.importance ?? null,
});

const scheduleColumns = (props: OpenLoopProps) => ({
  dueAt: props.dueAt === undefined ? null : toDate(props.dueAt),
  promisedFor: props.promisedFor === undefined ? null : toDate(props.promisedFor),
  estimateMinutes: Math.round(props.estimate),
  priority: Math.round(props.priority),
  confidence: props.confidence,
  manualState: props.manualResolution?.state ?? null,
  manualReason: props.manualResolution?.reason ?? null,
  snoozedUntil: props.snoozedUntil === undefined ? null : toDate(props.snoozedUntil),
  createdAt: toDate(props.createdAt),
  updatedAt: toDate(props.updatedAt),
  lastCheckedAt: props.lastCheckedAt === undefined ? null : toDate(props.lastCheckedAt),
});

export const toScalars = (props: OpenLoopProps): Omit<OpenLoopRow, 'id'> => ({
  kind: props.kind,
  title: props.title,
  summary: props.summary,
  ...sourceColumns(props),
  ...partyColumns(props),
  ...scheduleColumns(props),
});

export const criterionRows = (props: OpenLoopProps): readonly CriterionWrite[] =>
  props.criteria.map((criterion) => ({
    id: criterion.id,
    role: criterion.role,
    optional: criterion.optional,
    probe: toJson(criterion.probe),
  }));

export const evidenceRows = (
  props: OpenLoopProps,
): readonly Omit<EvidenceRecord, 'id' | 'loopId'>[] =>
  props.evidence.map((item) => ({
    criterionId: item.criterionId,
    verdict: item.verdict,
    observedAt: toDate(item.observedAt),
    summary: item.summary,
    url: item.url ?? null,
  }));
