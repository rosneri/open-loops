import { describe, expect, it } from 'vitest';
import { resolveReturnUrl } from './return-url.js';

const SITE = 'https://open-loops.example.com';

describe('where a finished handshake sends the browser', () => {
  it('lands on the integrations screen of this deployment when nothing was asked for', () => {
    expect(resolveReturnUrl({ returnTo: undefined, site: SITE, provider: 'SENTRY' })).toBe(
      `${SITE}/integrations?provider=SENTRY`,
    );
  });

  it('uses the site URL rather than localhost, which is the whole point of having one', () => {
    const url = resolveReturnUrl({ returnTo: undefined, site: SITE, provider: 'NOTION' });
    expect(url.startsWith(SITE)).toBe(true);
    expect(url).not.toContain('localhost');
  });

  it('honours a relative returnTo, which cannot leave this site', () => {
    expect(resolveReturnUrl({ returnTo: '/settings', site: SITE, provider: 'SLACK' })).toBe(
      `${SITE}/settings?provider=SLACK`,
    );
  });

  it('honours an absolute returnTo that is already on this site', () => {
    const returnTo = `${SITE}/integrations`;
    expect(resolveReturnUrl({ returnTo, site: SITE, provider: 'SLACK' })).toBe(
      `${SITE}/integrations?provider=SLACK`,
    );
  });

  /**
   * The reason this function exists. Without the origin check the route is an open redirect on a
   * domain the user has just been asked to trust with an OAuth grant.
   */
  it.each([
    'https://evil.example.com/phish',
    '//evil.example.com/phish',
    'https://open-loops.example.com.evil.example.com/phish',
    'javascript:alert(1)',
  ])('refuses to forward a browser to %s', (returnTo) => {
    const url = resolveReturnUrl({ returnTo, site: SITE, provider: 'SLACK' });
    expect(url).toBe(`${SITE}/integrations?provider=SLACK`);
    expect(url).not.toContain('evil.example.com');
    expect(url).not.toContain('javascript:');
  });

  it('keeps an existing query on the returnTo instead of writing a second question mark', () => {
    const url = resolveReturnUrl({ returnTo: '/integrations?tab=all', site: SITE, provider: 'JIRA' });
    expect(url).toBe(`${SITE}/integrations?tab=all&provider=JIRA`);
    expect(url.split('?')).toHaveLength(2);
  });
});
