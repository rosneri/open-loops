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
});
