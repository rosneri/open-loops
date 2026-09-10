import { describe, expect, it } from 'vitest';
import { focusPhrase, githubSetupStep, readOrganizations } from './organizations.js';

describe('reading organisations out of a tool result', () => {
  it('takes the logins GitHub returns for /user/orgs', () => {
    expect(
      readOrganizations([
        { login: 'acme', description: 'Work' },
        { login: 'beta', description: '' },
      ]),
    ).toEqual([{ login: 'acme', description: 'Work' }, { login: 'beta' }]);
  });

  /** The broker wraps its payloads differently per tool version; the shape is not ours to fix. */
  it('finds them however deeply the broker wrapped them', () => {
    expect(
      readOrganizations({ data: { response_data: { organizations: [{ login: 'acme' }] } } }),
    ).toEqual([{ login: 'acme' }]);
  });

  /** An account object has a login too, and a person is not an organisation. */
  it('leaves users out', () => {
    expect(readOrganizations([{ login: 'neri', type: 'User' }, { login: 'acme' }])).toEqual([
      { login: 'acme' },
    ]);
  });

  it('offers each organisation once, sorted, however often it appears', () => {
    expect(
      readOrganizations([
        { login: 'beta' },
        { repository: { owner: { login: 'Beta' } } },
        { login: 'acme' },
      ]).map((org) => org.login),
    ).toEqual(['acme', 'beta']);
  });

  it('finds nothing in an empty or unexpected answer', () => {
    expect(readOrganizations(undefined)).toEqual([]);
    expect(readOrganizations('no')).toEqual([]);
    expect(readOrganizations({ error: 'not connected' })).toEqual([]);
  });
});

describe('narrowing the fetch', () => {
  it('says nothing when nothing was picked, so the intent is unchanged', () => {
    expect(focusPhrase([])).toBeUndefined();
    expect(focusPhrase(['  '])).toBeUndefined();
  });

  it('names one organisation in the singular', () => {
    expect(focusPhrase(['acme'])).toBe(
      'limited to repositories owned by the acme organization on GitHub',
    );
  });

  it('names several as a list a model can read', () => {
    expect(focusPhrase(['acme', 'beta', 'gamma'])).toBe(
      'limited to repositories owned by the acme, beta or gamma organizations on GitHub',
    );
  });

  it('adds the personal account when it is meant to count too', () => {
    expect(focusPhrase(['acme'], true)).toBe(
      'limited to repositories owned by the acme organization or by my own personal account on GitHub',
    );
  });

  it('leaves the phrase alone when only the organisations count', () => {
    expect(focusPhrase(['acme'], false)).toBe(
      'limited to repositories owned by the acme organization on GitHub',
    );
  });

  /**
   * Nothing named is already everything, and everything includes this account's own
   * repositories — narrowing to them would be the opposite of what the box says.
   */
  it('stays silent with no organisations, even when personal is ticked', () => {
    expect(focusPhrase([], true)).toBeUndefined();
  });
});

describe('the question GitHub asks before it will connect', () => {
  const step = githubSetupStep();

  const scopeWith = (input: {
    organizations: readonly string[];
    available?: readonly unknown[];
    includePersonal?: boolean;
  }): Parameters<typeof step.complete>[0] =>
    ({
      settings: () =>
        Promise.resolve({
          organizations: input.organizations,
          includePersonal: input.includePersonal ?? false,
        }),
      logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      tools: {
        execute: () =>
          Promise.resolve({ ok: true, data: { organizations: input.available ?? [] }, logId: 'log' }),
      },
    }) as unknown as Parameters<typeof step.complete>[0];

  it('is answered once an organisation has been picked', async () => {
    await expect(step.complete(scopeWith({ organizations: ['acme'] }))).resolves.toBe(true);
  });

  it('is unanswered while organisations exist and none are picked', async () => {
    const scope = scopeWith({ organizations: [], available: [{ login: 'acme' }] });
    await expect(step.complete(scope)).resolves.toBe(false);
  });

  /**
   * A personal account belongs to nothing, and gating it behind a picker with no options would
   * make GitHub unconnectable for the person who needs no filter at all.
   */
  it('is answered when there is nothing to choose from', async () => {
    await expect(step.complete(scopeWith({ organizations: [] }))).resolves.toBe(true);
  });

  /** Ticking only "my own repositories" says the personal account is the whole of what counts. */
  it('is answered by choosing the personal account alone', async () => {
    const scope = scopeWith({
      organizations: [],
      includePersonal: true,
      available: [{ login: 'acme' }],
    });
    await expect(step.complete(scope)).resolves.toBe(true);
  });
});
