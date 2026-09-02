import { z } from 'zod';

/**
 * The model is given one flat probe shape rather than a discriminated union. Models are markedly
 * better at filling a wide object than at picking a variant, and a dozen optional siblings inside
 * an array is enough to make structured output refuse the schema outright ("Schema is too
 * complex"). The registered probe kind is what narrows it back afterwards, dropping anything
 * unusable.
 *
 * The kinds are a parameter now. They used to be a literal list here and the same eleven strings
 * appeared in three other files; a deployment that ships fewer probe plugins should genuinely
 * offer the model fewer choices, not offer it choices nothing can answer.
 */
const probeDraftSchemaFor = (kinds: readonly [string, ...string[]]) =>
  z.object({
    kind: z.enum(kinds),
    describedAs: z.string().min(3).max(200),
    /** Which app to look in. Open, because which apps exist is a registration too. */
    provider: z.string().optional(),
    /** What to look at: a repository, an issue key, a thread id, a person, an email address. */
    target: z.string().optional(),
    /** A second identifier when the probe needs one, e.g. the pull request inside a repository. */
    ref: z.string().optional(),
    /** Text the result must contain — a title fragment, a branch name, a subject line. */
    contains: z.string().optional(),
    /** The state the target must be in, for trackers that have more than open/closed. */
    status: z.string().optional(),
  });

const extractedLoopSchemaFor = (kinds: readonly [string, ...string[]]) =>
  z.object({
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
    criteria: z
      .array(
        z.object({
          role: z.enum(['DELIVERABLE', 'ACKNOWLEDGEMENT']),
          optional: z.boolean().default(false),
          probe: probeDraftSchemaFor(kinds),
        }),
      )
      .min(1)
      .max(4),
    dueAtIso: z.string().optional(),
    estimateMinutes: z.number().int().min(5).max(480),
    priority: z.number().int().min(0).max(100),
    confidence: z.number().min(0).max(1),
  });

export interface ExtractionResult {
  readonly loops: readonly ExtractedLoopDraft[];
}

export const extractionResultSchemaFor = (
  kinds: readonly string[],
): z.ZodType<ExtractionResult> => {
  const [first, ...rest] = kinds;
  if (first === undefined) throw new Error('No probe kinds are registered.');
  return z.object({ loops: z.array(extractedLoopSchemaFor([first, ...rest])).max(25) });
};

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

export type ExtractedLoopDraft = z.infer<ReturnType<typeof extractedLoopSchemaFor>>;
