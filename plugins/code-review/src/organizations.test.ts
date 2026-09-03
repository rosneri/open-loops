import { describe, expect, it } from 'vitest';
import { focusPhrase, readOrganizations } from './organizations.js';

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
});
