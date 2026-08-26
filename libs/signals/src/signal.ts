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
