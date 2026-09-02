import { z } from 'zod';

/**
 * The model is given one flat probe shape rather than the domain's discriminated union.
 * Models are markedly better at filling a wide object than at picking a variant, and
 * `toProbe` narrows it back into the strict domain type, dropping anything unusable.
 */
export const probeDraftSchema = z.object({
  kind: z.enum([
    'PULL_REQUEST_EXISTS',
    'PULL_REQUEST_MERGED',
    'REVIEW_SUBMITTED',
    'ISSUE_CLOSED',
    'ISSUE_STATUS_IS',
    'REPLIED_IN_THREAD',
    'MESSAGE_SENT_TO',
    'EMAIL_SENT',
    'CALENDAR_EVENT_EXISTS',
    'DOCUMENT_UPDATED',
    'MANUAL_CONFIRMATION',
  ]),
  describedAs: z.string().min(3).max(200),
  provider: z
    .enum([
      'SLACK',
      'GMAIL',
      'GOOGLE_CALENDAR',
      'GOOGLE_DRIVE',
      'GITHUB',
      'GITLAB',
      'LINEAR',
      'JIRA',
      'NOTION',
      'ASANA',
      'WHATSAPP',
      'WISPR_FLOW',
      'RISEUP',
      'DISCORD',
      'MICROSOFT_TEAMS',
      'OUTLOOK',
      'MANUAL',
    ])
    .optional(),
  /** What to look at: a repository, an issue key, a thread id, a person, an email address. */
  target: z.string().optional(),
  /** A second identifier when the probe needs one, e.g. the pull request inside a repository. */
  ref: z.string().optional(),
  /** Text the result must contain — a title fragment, a branch name, a subject line. */
  contains: z.string().optional(),
  /** The state the target must be in, for trackers that have more than open/closed. */
  status: z.string().optional(),
});

export const criterionDraftSchema = z.object({
  role: z.enum(['DELIVERABLE', 'ACKNOWLEDGEMENT']),
  optional: z.boolean().default(false),
  probe: probeDraftSchema,
});

export const extractedLoopSchema = z.object({
  sourceExternalId: z.string().min(1),
  kind: z.enum([
    'ASSIGNED_TASK',
    'INCOMING_REQUEST',
    'OUTGOING_COMMITMENT',
    'AWAITING_OTHER',
    'WORK_IN_FLIGHT',
  ]),
  title: z.string().min(3).max(160),
  summary: z.string().max(600),
  counterpartyName: z.string().optional(),
  counterpartyHandle: z.string().optional(),
  counterpartyImportance: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  criteria: z.array(criterionDraftSchema).min(1).max(4),
  dueAtIso: z.string().optional(),
  estimateMinutes: z.number().int().min(5).max(480),
  priority: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
});

export const extractionResultSchema = z.object({
  loops: z.array(extractedLoopSchema).max(25),
});

export const verdictSchema = z.object({
  loopId: z.string().min(1),
  criterionVerdicts: z
    .array(
      z.object({
        criterionId: z.string().min(1),
        verdict: z.enum(['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE']),
        summary: z.string().max(300),
        url: z.string().optional(),
      }),
    )
    .max(6),
  rationale: z.string().max(600),
  suggestedPriority: z.number().int().min(0).max(100).optional(),
});

export const reconciliationResultSchema = z.object({
  verdicts: z.array(verdictSchema).max(60),
});

export type ProbeDraft = z.infer<typeof probeDraftSchema>;
export type ExtractedLoopDraft = z.infer<typeof extractedLoopSchema>;
