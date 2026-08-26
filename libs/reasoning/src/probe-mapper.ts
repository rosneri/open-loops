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
 */
const BUILDERS: Record<ProbeKind, Builder> = {
  [ProbeKind.PullRequestExists]: ({ draft, now, describedAs }) =>
    draft.repository === undefined
      ? undefined
      : {
          kind: ProbeKind.PullRequestExists,
          describedAs,
          provider: provider(draft),
          repository: draft.repository,
          createdAfter: now,
          ...pick('titleContains', draft.titleContains),
          ...pick('branchContains', draft.branchContains),
        },

  [ProbeKind.PullRequestMerged]: ({ draft, describedAs }) =>
    draft.repository === undefined
      ? undefined
      : {
          kind: ProbeKind.PullRequestMerged,
          describedAs,
          provider: provider(draft),
          repository: draft.repository,
          ...pick('pullRequestRef', draft.pullRequestRef),
          ...pick('titleContains', draft.titleContains),
        },

  [ProbeKind.ReviewSubmitted]: ({ draft, describedAs }) =>
    draft.repository === undefined || draft.pullRequestRef === undefined
      ? undefined
      : {
          kind: ProbeKind.ReviewSubmitted,
          describedAs,
          provider: provider(draft),
          repository: draft.repository,
          pullRequestRef: draft.pullRequestRef,
        },

  [ProbeKind.IssueClosed]: ({ draft, describedAs }) =>
    draft.issueRef === undefined
      ? undefined
      : {
          kind: ProbeKind.IssueClosed,
          describedAs,
          provider: provider(draft),
          issueRef: draft.issueRef,
        },

  [ProbeKind.IssueStatusIs]: ({ draft, describedAs }) =>
    draft.issueRef === undefined || draft.status === undefined
      ? undefined
      : {
          kind: ProbeKind.IssueStatusIs,
          describedAs,
          provider: provider(draft),
          issueRef: draft.issueRef,
          status: draft.status,
        },

  [ProbeKind.RepliedInThread]: ({ draft, now, describedAs }) =>
    draft.threadRef === undefined
      ? undefined
      : {
          kind: ProbeKind.RepliedInThread,
          describedAs,
          provider: provider(draft),
          threadRef: draft.threadRef,
          after: now,
        },

  [ProbeKind.MessageSentTo]: ({ draft, now, describedAs }) =>
    draft.recipientRef === undefined
      ? undefined
      : {
          kind: ProbeKind.MessageSentTo,
          describedAs,
          provider: provider(draft),
          recipientRef: draft.recipientRef,
          after: now,
        },

  [ProbeKind.EmailSent]: ({ draft, now, describedAs }) =>
    draft.toEmail === undefined
      ? undefined
      : {
          kind: ProbeKind.EmailSent,
          describedAs,
          toEmail: draft.toEmail,
          after: now,
          ...pick('subjectContains', draft.subjectContains),
        },

  [ProbeKind.CalendarEventExists]: ({ draft, now, describedAs }) => ({
    kind: ProbeKind.CalendarEventExists,
    describedAs,
    titleContains: draft.titleContains ?? describedAs,
    after: now,
  }),

  [ProbeKind.DocumentUpdated]: ({ draft, now, describedAs }) =>
    draft.documentRef === undefined
      ? undefined
      : {
          kind: ProbeKind.DocumentUpdated,
          describedAs,
          provider: provider(draft),
          documentRef: draft.documentRef,
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
