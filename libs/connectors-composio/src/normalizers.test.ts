import { describe, expect, it } from 'vitest';
import { SourceProvider, asInstant } from '@open-loops/kernel';
import { normalise, type NormaliseContext } from './normalizers.js';

const ctx = (provider: SourceProvider): NormaliseContext => ({
  provider,
  meHandles: ['neri', 'neri.coder@gmail.com'],
  fallbackAt: asInstant(1_700_000_000_000),
});

describe('normalise', () => {
  /** The shape GITHUB_LIST_NOTIFICATIONS actually returns — the key that broke the first sync. */
  it('reads a GitHub notification from its own shape, not the search shape', () => {
    const [signal] = normalise({
      payload: {
        etag: 'W/"abc"',
        notifications: [
          {
            id: '24787149003',
            reason: 'review_requested',
            unread: true,
            subject: {
              title: 'Fix the rate limiter',
              type: 'PullRequest',
              url: 'https://api.github.com/repos/rosneri/personal-site/pulls/412',
            },
            updated_at: '2026-07-27T06:43:51Z',
            repository: { full_name: 'rosneri/personal-site' },
          },
        ],
      },
      ctx: ctx(SourceProvider.GitHub),
    });

    expect(signal?.externalId).toBe('24787149003');
    // The regression that produced fifty rows titled "GitHub item" with empty bodies.
    expect(signal?.title).toBe('Fix the rate limiter');
    expect(signal?.kind).toBe('PULL_REQUEST');
    expect(signal?.body).toContain('your review was requested');
    expect(signal?.channel).toBe('rosneri/personal-site');
    expect(signal?.url).toBe('https://github.com/rosneri/personal-site/pull/412');
  });

  it('still reads the GitHub search shape, which has no subject', () => {
    const [signal] = normalise({
      payload: {
        items: [
          {
            id: 991,
            title: 'Rate limit the public API',
            body: 'we keep getting hammered',
            user: { login: 'dana' },
            updated_at: '2026-07-27T06:43:51Z',
          },
        ],
      },
      ctx: ctx(SourceProvider.GitHub),
    });
    expect(signal?.title).toBe('Rate limit the public API');
    expect(signal?.author.displayName).toBe('dana');
    expect(signal?.kind).toBe('ISSUE');
  });

  it('falls back to the first array of objects when the key is unknown', () => {
    const signals = normalise({
      payload: { somethingNobodyNamed: [{ id: 'x1', title: 'hello' }] },
      ctx: ctx(SourceProvider.Notion),
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.title).toBe('hello');
  });

  it('digs through a wrapper object', () => {
    const signals = normalise({
      payload: { response: { data: { items: [{ id: 'y1', title: 'nested' }] } } },
      ctx: ctx(SourceProvider.Jira),
    });
    expect(signals).toHaveLength(1);
  });

  it('ignores arrays of scalars, which are never a result set', () => {
    const signals = normalise({
      payload: { scopes: ['repo', 'read:org'], items: [{ id: 'z1', title: 'real' }] },
      ctx: ctx(SourceProvider.GitHub),
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.externalId).toBe('z1');
  });

  it('marks my own Slack message as mine, so a promise is not read as a request', () => {
    const [signal] = normalise({
      payload: {
        messages: [
          { ts: '1730900000.001', user: 'neri', text: "I'll get the PR up today", channel: { id: 'C1', name: 'eng' } },
        ],
      },
      ctx: ctx(SourceProvider.Slack),
    });
    expect(signal?.author.isMe).toBe(true);
    expect(signal?.isDirectedAtMe).toBe(false);
    expect(signal?.threadRef).toBe('C1/1730900000.001');
  });

  it('returns nothing rather than guessing when there is no collection', () => {
    expect(normalise({ payload: { ok: true }, ctx: ctx(SourceProvider.GitHub) })).toHaveLength(0);
  });

  /**
   * The hydrated shape: a `search_meetings` row merged with what `get_meeting` added. The action
   * items live in the summary, which is the only reason the hydrate step exists.
   */
  it('reads a hydrated Wispr Flow meeting as a meeting note', () => {
    const [signal] = normalise({
      payload: {
        count: 1,
        has_more: false,
        meetings: [
          {
            meeting_id: '9c4b3c35-a2f4-479a-ba72-95b9df97d587',
            title: 'Eng standup',
            started_at: '2026-08-26T09:30:00.000Z',
            share_link: 'https://notes.wisprflow.ai/shared/abc',
            attendees: [{ name: 'Neriya Rosner' }, { name: 'Dana', email: 'dana@acme.com' }],
            summary: '## Flow Summary\n### Next steps\n- Neri to open the rate-limiting PR today',
            content: '## Notes\nWe argued about the limiter.',
          },
        ],
      },
      ctx: ctx('WISPR_FLOW'),
    });

    expect(signal?.kind).toBe('MEETING_NOTE');
    // Namespaced the way the local agent's pushes already are.
    expect(signal?.externalId).toBe('wispr:meeting:9c4b3c35-a2f4-479a-ba72-95b9df97d587');
    expect(signal?.title).toBe('Eng standup');
    // Both halves, because the recap is sent whole and the extractor decides what is owed.
    expect(signal?.body).toContain('Neri to open the rate-limiting PR today');
    expect(signal?.body).toContain('We argued about the limiter.');
    expect(signal?.occurredAt).toBe(Date.parse('2026-08-26T09:30:00.000Z'));
    expect(signal?.url).toBe('https://notes.wisprflow.ai/shared/abc');
    expect(signal?.isDirectedAtMe).toBe(true);
    expect(signal?.participants.map((person) => person.displayName)).toContain('Dana');
  });

  /**
   * An unhydrated row still becomes a signal rather than being dropped — the cap and every
   * failure path in the connector produce exactly this shape.
   */
  it('keeps a Wispr Flow meeting that was never expanded', () => {
    const [signal] = normalise({
      payload: { meetings: [{ meeting_id: 'm1', title: 'Retro', started_at: '2026-08-26T09:30:00.000Z' }] },
      ctx: ctx('WISPR_FLOW'),
    });

    expect(signal?.kind).toBe('MEETING_NOTE');
    expect(signal?.externalId).toBe('wispr:meeting:m1');
    expect(signal?.body).toBe('');
  });

  /** The scratchpad is the same toolkit and a different kind; its rows carry no meeting id. */
  it('reads a Wispr Flow scratchpad note as a document, not a meeting', () => {
    const [signal] = normalise({
      payload: {
        notes: [
          {
            id: '2acd2a3a-fca7-4e4f-b9fd-4a7ed5385cef',
            title: 'Hiring loop',
            content_excerpt: 'Owe Dana the scorecard by Thursday.',
            modified_at: '2026-08-31T12:30:16.206823Z',
          },
        ],
      },
      ctx: ctx('WISPR_FLOW'),
    });

    expect(signal?.kind).toBe('DOCUMENT');
    expect(signal?.externalId).toBe('wispr:note:2acd2a3a-fca7-4e4f-b9fd-4a7ed5385cef');
    expect(signal?.body).toBe('Owe Dana the scorecard by Thursday.');
    // A note you wrote to yourself is still addressed to you.
    expect(signal?.isDirectedAtMe).toBe(true);
  });
});
