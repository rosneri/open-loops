import type { Instant, SourceProvider } from '@open-loops/kernel';

export const SignalKind = {
  ChatMessage: 'CHAT_MESSAGE',
  Email: 'EMAIL',
  Issue: 'ISSUE',
  PullRequest: 'PULL_REQUEST',
  ReviewRequest: 'REVIEW_REQUEST',
  CalendarEvent: 'CALENDAR_EVENT',
  Comment: 'COMMENT',
  Document: 'DOCUMENT',
  /** A meeting recap. Its action items are the densest source of commitments there is. */
  MeetingNote: 'MEETING_NOTE',
} as const;
export type SignalKind = (typeof SignalKind)[keyof typeof SignalKind];

export interface SignalActor {
  readonly displayName: string;
  readonly handle?: string;
  readonly email?: string;
  /** Whether this actor is the person the app belongs to. Drives "I said" vs "they said". */
  readonly isMe: boolean;
}

/**
 * The one shape every provider is flattened into before anything downstream — including the
 * model — ever sees it. Adapters own the mapping; nothing else knows whether a signal came
 * from Slack or Jira except by reading `provider`.
 */
export interface Signal {
  readonly provider: SourceProvider;
  readonly externalId: string;
  readonly kind: SignalKind;
  readonly title: string;
  readonly body: string;
  readonly author: SignalActor;
  readonly participants: readonly SignalActor[];
  readonly occurredAt: Instant;
  readonly threadRef?: string;
  readonly url?: string;
  readonly channel?: string;
  readonly isDirectedAtMe: boolean;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export const signalKey = (signal: Pick<Signal, 'provider' | 'externalId'>): string =>
  `${signal.provider}:${signal.externalId}`;

/**
 * The parts of a stored signal worth comparing a re-fetch against. Deliberately not the whole
 * row: `receivedAt` moves on its own, and `processedAt` is our bookkeeping rather than anything
 * the source said.
 */
export interface StoredSignalFacts {
  readonly title: string;
  readonly body: string;
  readonly kind: string;
  readonly isDirectedAtMe: boolean;
  readonly occurredAt: number;
}

/**
 * Whether a re-fetched signal actually says something new. A connector re-reads the same items
 * every sweep, so answering this wrongly in one direction leaves stale content forever and in
 * the other re-extracts the entire history on every tick.
 */
export const signalChanged = (signal: Signal, stored: StoredSignalFacts): boolean =>
  stored.title !== signal.title ||
  stored.body !== signal.body ||
  stored.kind !== signal.kind ||
  stored.isDirectedAtMe !== signal.isDirectedAtMe ||
  stored.occurredAt !== signal.occurredAt;
