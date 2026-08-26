import type { Instant, SourceProvider } from '@open-loops/kernel';

/**
 * A probe is the machine-checkable definition of "this part is done". The model proposes probes
 * when it extracts a loop; deterministic code is what actually runs them. That split is the
 * spine of the design: the model decides what would count as evidence, never whether it
 * happened.
 */
export const ProbeKind = {
  PullRequestExists: 'PULL_REQUEST_EXISTS',
  PullRequestMerged: 'PULL_REQUEST_MERGED',
  ReviewSubmitted: 'REVIEW_SUBMITTED',
  IssueClosed: 'ISSUE_CLOSED',
  IssueStatusIs: 'ISSUE_STATUS_IS',
  RepliedInThread: 'REPLIED_IN_THREAD',
  MessageSentTo: 'MESSAGE_SENT_TO',
  EmailSent: 'EMAIL_SENT',
  CalendarEventExists: 'CALENDAR_EVENT_EXISTS',
  DocumentUpdated: 'DOCUMENT_UPDATED',
  /** Nothing observable exists; only the human can close this one. */
  ManualConfirmation: 'MANUAL_CONFIRMATION',
} as const;
export type ProbeKind = (typeof ProbeKind)[keyof typeof ProbeKind];

interface ProbeBase<TKind extends ProbeKind> {
  readonly kind: TKind;
  /** The sentence shown in the UI: "a PR titled ~'rate limiting' exists in acme/api". */
  readonly describedAs: string;
}

export interface PullRequestExistsProbe extends ProbeBase<typeof ProbeKind.PullRequestExists> {
  readonly provider: SourceProvider;
  readonly repository: string;
  readonly titleContains?: string;
  readonly branchContains?: string;
  readonly createdAfter?: Instant;
}

export interface PullRequestMergedProbe extends ProbeBase<typeof ProbeKind.PullRequestMerged> {
  readonly provider: SourceProvider;
  readonly repository: string;
  readonly pullRequestRef?: string;
  readonly titleContains?: string;
}

export interface ReviewSubmittedProbe extends ProbeBase<typeof ProbeKind.ReviewSubmitted> {
  readonly provider: SourceProvider;
  readonly repository: string;
  readonly pullRequestRef: string;
}

export interface IssueClosedProbe extends ProbeBase<typeof ProbeKind.IssueClosed> {
  readonly provider: SourceProvider;
  readonly issueRef: string;
}

export interface IssueStatusIsProbe extends ProbeBase<typeof ProbeKind.IssueStatusIs> {
  readonly provider: SourceProvider;
  readonly issueRef: string;
  readonly status: string;
}

export interface RepliedInThreadProbe extends ProbeBase<typeof ProbeKind.RepliedInThread> {
  readonly provider: SourceProvider;
  readonly threadRef: string;
  readonly after: Instant;
}

export interface MessageSentToProbe extends ProbeBase<typeof ProbeKind.MessageSentTo> {
  readonly provider: SourceProvider;
  readonly recipientRef: string;
  readonly after: Instant;
  readonly bodyContains?: string;
}

export interface EmailSentProbe extends ProbeBase<typeof ProbeKind.EmailSent> {
  readonly toEmail: string;
  readonly after: Instant;
  readonly subjectContains?: string;
}

export interface CalendarEventExistsProbe extends ProbeBase<typeof ProbeKind.CalendarEventExists> {
  readonly titleContains: string;
  readonly after: Instant;
}

export interface DocumentUpdatedProbe extends ProbeBase<typeof ProbeKind.DocumentUpdated> {
  readonly provider: SourceProvider;
  readonly documentRef: string;
  readonly after: Instant;
}

export type ManualConfirmationProbe = ProbeBase<typeof ProbeKind.ManualConfirmation>;

export type Probe =
  | PullRequestExistsProbe
  | PullRequestMergedProbe
  | ReviewSubmittedProbe
  | IssueClosedProbe
  | IssueStatusIsProbe
  | RepliedInThreadProbe
  | MessageSentToProbe
  | EmailSentProbe
  | CalendarEventExistsProbe
  | DocumentUpdatedProbe
  | ManualConfirmationProbe;

/** Which provider a probe must run against, if any. `undefined` means "not observable there". */
export const probeProvider = (probe: Probe): SourceProvider | undefined => {
  switch (probe.kind) {
    case ProbeKind.EmailSent:
    case ProbeKind.CalendarEventExists:
    case ProbeKind.ManualConfirmation:
      return undefined;
    default:
      return probe.provider;
  }
};

export const isObservable = (probe: Probe): boolean => probe.kind !== ProbeKind.ManualConfirmation;
