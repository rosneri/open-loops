import { describe, expect, it } from 'vitest';
import { siteUrl, type AppConfig } from './env.js';

const config = (overrides: Partial<AppConfig> = {}): AppConfig =>
  ({ PORT: 4455, ...overrides }) as AppConfig;

describe('the address this deployment answers on', () => {
  it('falls back to localhost on the configured port, which is right for a laptop', () => {
    expect(siteUrl(config())).toBe('http://localhost:4455');
  });

  it('prefers the configured site URL, which is right for everything else', () => {
    expect(siteUrl(config({ OPEN_LOOPS_SITE_URL: 'https://open-loops.example.com' }))).toBe(
      'https://open-loops.example.com',
    );
  });

  /**
   * Paths are appended to this value, so a trailing slash would produce `//api/...`. The schema
   * strips it on the way in; this pins that the stripping is what reaches the call sites.
   */
  it('composes with an appended path rather than doubling the slash', () => {
    const site = siteUrl(config({ OPEN_LOOPS_SITE_URL: 'https://open-loops.example.com' }));
    expect(`${site}/api/integrations/sentry/callback`).toBe(
      'https://open-loops.example.com/api/integrations/sentry/callback',
    );
  });
});
