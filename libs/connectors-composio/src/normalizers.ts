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

/**
 * Every provider buries its list under a different key — `notifications`, `items`, `nodes`,
 * `threads`. Naming them all is a losing game, so the well-known ones are tried first for
 * predictability and anything else falls back to "the first array of objects we can find".
 */
const PREFERRED_KEYS = [
  'items',
  'meetings',
  'notes',
  'notifications',
  'messages',
  'issues',
  'pull_requests',
  'nodes',
  'results',
  'events',
  'threads',
  'files',
  'value',
  'data',
  'response_data',
] as const;

const isObjectArray = (value: unknown): value is Payload[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'object' && item !== null);

const namedCollection = (record: Payload): readonly Payload[] | undefined => {
  for (const key of PREFERRED_KEYS) {
    const value = record[key];
    if (isObjectArray(value)) return value;
  }
  return undefined;
};

const anyCollection = (record: Payload): readonly Payload[] | undefined =>
  Object.values(record).find(isObjectArray);

const nestedCollection = (record: Payload, depth: number): readonly Payload[] | undefined => {
  for (const value of Object.values(record)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const nested = collectionOf(value, depth + 1);
    if (nested.length > 0) return nested;
  }
  return undefined;
};

export const collectionOf = (payload: unknown, depth = 0): readonly Payload[] => {
  if (Array.isArray(payload)) return payload.map(asRecord);
  if (depth > 4 || typeof payload !== 'object' || payload === null) return [];
  const record = payload as Payload;
  return (
    namedCollection(record) ?? anyCollection(record) ?? nestedCollection(record, depth) ?? []
  );
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

/** Slack reports the channel as either a bare id or a nested object, depending on the tool. */
const slackChannel = (item: Payload): { id: string; name: string | undefined } => {
  const channel = asRecord(item['channel']);
  return {
    id: str(channel['id']) ?? str(item['channel']) ?? 'dm',
    name: str(channel['name']),
  };
};

const slackAuthor = (item: Payload, ctx: NormaliseContext): SignalActor =>
  actor({
    name: str(asRecord(item['user'])['name']) ?? str(item['username']) ?? str(item['user']),
    handle: str(item['user']) ?? str(item['user_id']),
    ctx,
  });

const slackSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const ts = str(item['ts']) ?? str(item['timestamp']) ?? '';
  const channel = slackChannel(item);
  const text = str(item['text']) ?? '';
  const author = slackAuthor(item, ctx);
  return {
    ...base({
      item,
      ctx,
      kind: SignalKind.ChatMessage,
      externalId: `${channel.id}/${ts}`,
      title: text.split('\n')[0] ?? 'Slack message',
      body: text,
      author,
      occurredAt: instantFrom(ts, ctx.fallbackAt),
    }),
    threadRef: `${channel.id}/${str(item['thread_ts']) ?? ts}`,
    ...(channel.name === undefined ? {} : { channel: channel.name }),
  };
};

const GITHUB_SUBJECT_KINDS: Record<string, SignalKind> = {
  PullRequest: SignalKind.PullRequest,
  Issue: SignalKind.Issue,
  Discussion: SignalKind.Comment,
  Release: SignalKind.Document,
};

/**
 * Why the notification is in your inbox, in the model's language. `reason` is the single most
 * useful field GitHub gives us: "review_requested" is an obligation, "subscribed" usually isn't.
 */
const GITHUB_REASONS: Record<string, string> = {
  assign: 'you were assigned to it',
  author: 'you opened it',
  comment: 'you commented on it',
  mention: 'you were mentioned',
  review_requested: 'your review was requested',
  team_mention: 'your team was mentioned',
  state_change: 'its state changed',
  subscribed: 'you are watching the repository',
};

/**
 * A notification and a search result are different shapes from the same provider: notifications
 * carry `subject`, searches carry a top-level `title`. Getting this wrong is not loud — it
 * yields fifty rows titled "GitHub item" that the extractor correctly refuses to act on.
 */
const githubNotification = (item: Payload, ctx: NormaliseContext): Signal => {
  const subject = asRecord(item['subject']);
  const repository = str(asRecord(item['repository'])['full_name']) ?? '';
  const reason = str(item['reason']) ?? '';
  const type = str(subject['type']) ?? 'Issue';

  return {
    ...base({
      item,
      ctx,
      kind: GITHUB_SUBJECT_KINDS[type] ?? SignalKind.Issue,
      externalId: idOf(item) ?? '',
      title: str(subject['title']) ?? 'GitHub notification',
      body: [
        `${type} in ${repository}`,
        GITHUB_REASONS[reason] ?? `notification reason: ${reason}`,
        str(item['unread']) === undefined && item['unread'] === true ? 'still unread' : '',
      ]
        .filter((line) => line.length > 0)
        .join('. '),
      author: actor({ name: repository === '' ? 'GitHub' : repository, ctx }),
      occurredAt: instantFrom(item['updated_at'], ctx.fallbackAt),
    }),
    ...(repository === '' ? {} : { channel: repository }),
    url: webUrlOf(subject),
  };
};

/** Notification subjects carry the API url; the human one is the same path on the web host. */
const webUrlOf = (subject: Payload): string => {
  const apiUrl = str(subject['url']) ?? '';
  return apiUrl
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/');
};

const githubSearchResult = (item: Payload, ctx: NormaliseContext): Signal => {
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

const githubSignal = (item: Payload, ctx: NormaliseContext): Signal =>
  item['subject'] === undefined ? githubSearchResult(item, ctx) : githubNotification(item, ctx);

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

/**
 * Wispr Flow arrives over a project-owned custom MCP toolkit, and its two collections are two
 * different kinds: a recorded meeting is a MEETING_NOTE, a scratchpad jotting is a DOCUMENT.
 * Nothing in the payload flags which is which, so they are told apart by shape — a meeting has
 * attendees or a summary, a note has neither.
 *
 * The keys are read tolerantly on purpose. A custom MCP toolkit declares no output schema, so
 * the spellings below are the ones the server's own tool descriptions name, with the obvious
 * alternates behind them; a rename upstream costs a wrong timestamp rather than a lost signal.
 */
const wisprAttendees = (item: Payload, ctx: NormaliseContext): readonly SignalActor[] => {
  const raw = item['attendees'] ?? item['participants'] ?? item['attendee_preview'];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === 'string') return actor({ name: entry, ctx });
    const person = asRecord(entry);
    return actor({
      name: str(person['name']) ?? str(person['display_name']) ?? str(person['displayName']),
      email: str(person['email']),
      ctx,
    });
  });
};

/**
 * `summary` is the Flow Summary, whose next-steps section holds the action items; `content` is
 * the markdown note body. Both arrive only after the hydrate call — a bare search row has
 * neither, which is exactly why the hydrate step exists.
 */
const wisprBody = (item: Payload): string =>
  [
    str(item['summary']),
    str(item['content']) ?? str(item['notes']) ?? str(item['content_excerpt']),
  ]
    .filter((part): part is string => part !== undefined)
    .join('\n\n');

const wisprOccurredAt = (item: Payload, fallback: Instant): Instant =>
  instantFrom(
    item['started_at'] ?? item['start_time'] ?? item['start'] ?? item['occurred_at'] ??
      item['modified_at'] ?? item['updated_at'] ?? item['created_at'],
    fallback,
  );

/** A meeting has attendees or a summary; a scratchpad note has neither. */
const isWisprMeeting = (item: Payload, attendees: readonly SignalActor[]): boolean =>
  wisprMeetingId(item) !== undefined || attendees.length > 0 || str(item['summary']) !== undefined;

const wisprMeetingId = (item: Payload): string | undefined =>
  str(item['meeting_id']) ?? str(item['meetingId']);

const wisprSignal = (item: Payload, ctx: NormaliseContext): Signal => {
  const attendees = wisprAttendees(item, ctx);
  const isMeeting = isWisprMeeting(item, attendees);

  const author = actor({ name: isMeeting ? 'Wispr Flow Notetaker' : 'Wispr Flow', ctx });
  const id = wisprMeetingId(item) ?? idOf(item) ?? '';
  const shareLink = str(item['share_link']);

  const signal = base({
    item,
    ctx,
    kind: isMeeting ? SignalKind.MeetingNote : SignalKind.Document,
    // Namespaced the way the local agent's pushes already are, and separately per collection so
    // a note and a meeting that share an id cannot collide.
    externalId: id.length === 0 ? '' : `wispr:${isMeeting ? 'meeting' : 'note'}:${id}`,
    title: str(item['title']) ?? (isMeeting ? 'Meeting' : 'Note'),
    body: wisprBody(item),
    author,
    occurredAt: wisprOccurredAt(item, ctx.fallbackAt),
  });

  return {
    ...signal,
    ...(attendees.length === 0 ? {} : { participants: [author, ...attendees] }),
    ...(shareLink === undefined ? {} : { url: shareLink }),
    // Both kinds are the user's own record of their own commitments. A note you wrote to
    // yourself is still addressed to you, and `!author.isMe` would read it the other way.
    isDirectedAtMe: true,
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
    // `lastSeen` is Sentry's; without it every Sentry issue would carry the sync's clock rather
    // than its own and the day would order them arbitrarily.
    occurredAt: instantFrom(
      item['updatedAt'] ?? item['updated_at'] ?? item['lastSeen'] ?? item['created_at'],
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
    WISPR_FLOW: wisprSignal,
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
