import type { Instant, SourceProvider } from '@open-loops/kernel';
import type { Probe } from '@open-loops/loops';
import { ProbeKind } from '@open-loops/loops';
import type { ProbeDraft } from './schemas.js';

interface BuildInput {
  readonly draft: ProbeDraft;
  readonly now: Instant;
  readonly describedAs: string;
}

type Builder = (input: BuildInput) => Probe | undefined;

const provider = (draft: ProbeDraft): SourceProvider => draft.provider ?? 'MANUAL';

const pick = <TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): Record<TKey, TValue> | Record<string, never> =>
  value === undefined ? {} : ({ [key]: value } as Record<TKey, TValue>);

/**
 * One tiny builder per probe kind. Each returns `undefined` when the model left out something
 * the probe genuinely needs, and the caller downgrades that to a manual check — an
 * under-specified probe would otherwise be unsatisfiable and pin the loop open forever.
 *
 * The draft carries five general fields rather than one per probe variant. That is not only
 * tidier: a dozen optional siblings inside an array is enough to make Anthropic's structured
 * output refuse the schema outright ("Schema is too complex"), which is how this shape was found.
 */
const BUILDERS: Record<ProbeKind, Builder> = {
  [ProbeKind.PullRequestExists]: ({ draft, now, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.PullRequestExists,
          describedAs,
          provider: provider(draft),
          repository: draft.target,
          createdAfter: now,
          ...pick('titleContains', draft.contains),
          ...pick('branchContains', draft.ref),
        },

  [ProbeKind.PullRequestMerged]: ({ draft, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.PullRequestMerged,
          describedAs,
          provider: provider(draft),
          repository: draft.target,
          ...pick('pullRequestRef', draft.ref),
          ...pick('titleContains', draft.contains),
        },

  [ProbeKind.ReviewSubmitted]: ({ draft, describedAs }) =>
    draft.target === undefined || draft.ref === undefined
      ? undefined
      : {
          kind: ProbeKind.ReviewSubmitted,
          describedAs,
          provider: provider(draft),
          repository: draft.target,
          pullRequestRef: draft.ref,
        },

  [ProbeKind.IssueClosed]: ({ draft, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.IssueClosed,
          describedAs,
          provider: provider(draft),
          issueRef: draft.target,
        },

  [ProbeKind.IssueStatusIs]: ({ draft, describedAs }) =>
    draft.target === undefined || draft.status === undefined
      ? undefined
      : {
          kind: ProbeKind.IssueStatusIs,
          describedAs,
          provider: provider(draft),
          issueRef: draft.target,
          status: draft.status,
        },

  [ProbeKind.RepliedInThread]: ({ draft, now, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.RepliedInThread,
          describedAs,
          provider: provider(draft),
          threadRef: draft.target,
          after: now,
        },

  [ProbeKind.MessageSentTo]: ({ draft, now, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.MessageSentTo,
          describedAs,
          provider: provider(draft),
          recipientRef: draft.target,
          after: now,
          ...pick('bodyContains', draft.contains),
        },

  [ProbeKind.EmailSent]: ({ draft, now, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.EmailSent,
          describedAs,
          toEmail: draft.target,
          after: now,
          ...pick('subjectContains', draft.contains),
        },

  [ProbeKind.CalendarEventExists]: ({ draft, now, describedAs }) => ({
    kind: ProbeKind.CalendarEventExists,
    describedAs,
    titleContains: draft.contains ?? describedAs,
    after: now,
  }),

  [ProbeKind.DocumentUpdated]: ({ draft, now, describedAs }) =>
    draft.target === undefined
      ? undefined
      : {
          kind: ProbeKind.DocumentUpdated,
          describedAs,
          provider: provider(draft),
          documentRef: draft.target,
          after: now,
        },

  [ProbeKind.ManualConfirmation]: ({ describedAs }) => ({
    kind: ProbeKind.ManualConfirmation,
    describedAs,
  }),
};

/** Narrows the model's flat draft into the strict domain union. */
export const toProbe = (input: { draft: ProbeDraft; now: Instant }): Probe => {
  const describedAs = input.draft.describedAs;
  const built = BUILDERS[input.draft.kind]({ ...input, describedAs });
  return built ?? { kind: ProbeKind.ManualConfirmation, describedAs };
};
