import type { Instant, SourceProvider } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { Signal, SignalActor } from '@open-loops/signals';
import { SignalKind } from '@open-loops/signals';

export interface NormaliseContext {
  readonly provider: SourceProvider;
  /** Handles and emails that identify the user, so we can tell "I said" from "they said". */
  readonly meHandles: readonly string[];
  readonly fallbackAt: Instant;
}

type Payload = Record<string, unknown>;

const asRecord = (value: unknown): Payload =>
  typeof value === 'object' && value !== null ? (value as Payload) : {};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const instantFrom = (value: unknown, fallback: Instant): Instant => {
  if (typeof value === 'number') return asInstant(value > 1e12 ? value : value * 1000);
  const text = str(value);
  if (text === undefined) return fallback;
  if (/^\d+\.\d+$/.test(text)) return asInstant(Math.round(Number(text) * 1000));
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? fallback : asInstant(parsed);
};

/** Tool results nest their list under different keys; dig out the first array we recognise. */
const collectionOf = (payload: unknown, depth = 0): readonly Payload[] => {
  if (Array.isArray(payload)) return payload.map(asRecord);
  if (depth > 4) return [];
  const record = asRecord(payload);
  for (const key of ['items', 'messages', 'issues', 'nodes', 'results', 'data', 'events', 'value', 'response_data']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.map(asRecord);
    if (typeof candidate === 'object' && candidate !== null) {
      const nested = collectionOf(candidate, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  return [];
};

const urlOf = (item: Payload): string | undefined =>
  str(item['permalink']) ?? str(item['html_url']) ?? str(item['url']);

const idOf = (item: Payload): string | undefined => {
  const raw = item['id'] ?? item['number'] ?? item['node_id'] ?? item['messageId'];
  if (typeof raw === 'string') return raw.length > 0 ? raw : undefined;
  return typeof raw === 'number' ? String(raw) : undefined;
};

const actor = (input: {
  name: string | undefined;
  handle?: string | undefined;
  email?: string | undefined;
  ctx: NormaliseContext;
}): SignalActor => {
  const identifiers = [input.handle, input.email, input.name].filter(
    (value): value is string => value !== undefined,
  );
  return {
    displayName: input.name ?? input.handle ?? input.email ?? 'unknown',
    ...(input.handle === undefined ? {} : { handle: input.handle }),
    ...(input.email === undefined ? {} : { email: input.email }),
    isMe: identifiers.some((value) =>
      input.ctx.meHandles.some((mine) => mine.toLowerCase() === value.toLowerCase()),
    ),
  };
};

const base = (input: {
  item: Payload;
  ctx: NormaliseContext;
  kind: SignalKind;
  externalId: string;
  title: string;
  body: string;
  author: SignalActor;
  occurredAt: Instant;
}): Signal => ({
  provider: input.ctx.provider,
  externalId: input.externalId,
  kind: input.kind,
  title: input.title.slice(0, 400),
  body: input.body.slice(0, 8000),
  author: input.author,
  participants: [input.author],
  occurredAt: input.occurredAt,
  isDirectedAtMe: !input.author.isMe,
  ...(urlOf(input.item) === undefined ? {} : { url: urlOf(input.item) ?? '' }),
});

const slackSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const ts = str(item['ts']) ?? str(item['timestamp']) ?? '';
  const channel = asRecord(item['channel']);
  const channelId = str(channel['id']) ?? str(item['channel']) ?? 'dm';
  const text = str(item['text']) ?? '';
  const author = actor({
    name: str(asRecord(item['user'])['name']) ?? str(item['username']) ?? str(item['user']),
    handle: str(item['user']) ?? str(item['user_id']),
    ctx,
  });
  return {
    ...base({
      item,
      ctx,
      kind: SignalKind.ChatMessage,
      externalId: `${channelId}/${ts}`,
      title: text.split('\n')[0] ?? 'Slack message',
      body: text,
      author,
      occurredAt: instantFrom(ts, ctx.fallbackAt),
    }),
    threadRef: `${channelId}/${str(item['thread_ts']) ?? ts}`,
    ...(str(channel['name']) === undefined ? {} : { channel: str(channel['name']) ?? '' }),
  };
};

const githubSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const user = asRecord(item['user']);
  const isPull = item['pull_request'] !== undefined || item['head'] !== undefined;
  return base({
    item,
    ctx,
    kind: isPull ? SignalKind.PullRequest : SignalKind.Issue,
    externalId: idOf(item) ?? '',
    title: str(item['title']) ?? 'GitHub item',
    body: str(item['body']) ?? '',
    author: actor({ name: str(user['login']), handle: str(user['login']), ctx }),
    occurredAt: instantFrom(item['updated_at'] ?? item['created_at'], ctx.fallbackAt),
  });
};

const linearSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const creator = asRecord(item['creator']);
  return base({
    item,
    ctx,
    kind: SignalKind.Issue,
    externalId: idOf(item) ?? str(item['identifier']) ?? '',
    title: `${str(item['identifier']) ?? ''} ${str(item['title']) ?? ''}`.trim(),
    body: str(item['description']) ?? '',
    author: actor({
      name: str(creator['name']),
      handle: str(creator['displayName']),
      email: str(creator['email']),
      ctx,
    }),
    occurredAt: instantFrom(item['updatedAt'] ?? item['createdAt'], ctx.fallbackAt),
  });
};

const gmailSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const from = str(item['sender']) ?? str(item['from']) ?? '';
  return {
    ...base({
      item,
      ctx,
      kind: SignalKind.Email,
      externalId: idOf(item) ?? '',
      title: str(item['subject']) ?? 'Email',
      body: str(item['messageText']) ?? str(item['snippet']) ?? '',
      author: actor({ name: from, email: from, ctx }),
      occurredAt: instantFrom(item['messageTimestamp'] ?? item['internalDate'], ctx.fallbackAt),
    }),
    ...(str(item['threadId']) === undefined ? {} : { threadRef: str(item['threadId']) ?? '' }),
  };
};

const calendarSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const start = asRecord(item['start']);
  const end = asRecord(item['end']);
  const organizer = asRecord(item['organizer']);
  const event = base({
    item,
    ctx,
    kind: SignalKind.CalendarEvent,
    externalId: idOf(item) ?? '',
    title: str(item['summary']) ?? 'Event',
    body: str(item['description']) ?? '',
    author: actor({ name: str(organizer['displayName']), email: str(organizer['email']), ctx }),
    occurredAt: instantFrom(start['dateTime'] ?? start['date'], ctx.fallbackAt),
  });
  return {
    ...event,
    metadata: { endsAt: instantFrom(end['dateTime'] ?? end['date'], event.occurredAt) },
  };
};

const genericSignal = (item: Payload, ctx: NormaliseContext): Signal =>
  base({
    item,
    ctx,
    kind: SignalKind.Comment,
    externalId: idOf(item) ?? JSON.stringify(item).slice(0, 64),
    title: str(item['title']) ?? str(item['name']) ?? str(item['summary']) ?? 'Item',
    body: str(item['body']) ?? str(item['description']) ?? str(item['text']) ?? JSON.stringify(item),
    author: actor({ name: str(item['author']) ?? 'unknown', ctx }),
    occurredAt: instantFrom(
      item['updatedAt'] ?? item['updated_at'] ?? item['created_at'],
      ctx.fallbackAt,
    ),
  });

const BY_PROVIDER: Partial<Record<SourceProvider, (item: Payload, ctx: NormaliseContext) => Signal>> =
  {
    SLACK: slackSignal,
    GITHUB: githubSignal,
    LINEAR: linearSignal,
    GMAIL: gmailSignal,
    GOOGLE_CALENDAR: calendarSignal,
  };

/**
 * Flattens a raw tool result into `Signal`s. Providers without a hand-written mapper fall
 * through to a heuristic one — good enough for the model to reason over, and the obvious seam
 * for an AI normaliser later.
 */
export const normalise = (input: { payload: unknown; ctx: NormaliseContext }): readonly Signal[] => {
  const mapper = BY_PROVIDER[input.ctx.provider] ?? genericSignal;
  return collectionOf(input.payload)
    .map((item) => mapper(item, input.ctx))
    .filter((signal) => signal.externalId.trim().length > 1);
};
