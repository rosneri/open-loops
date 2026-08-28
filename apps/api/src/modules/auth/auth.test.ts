import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { signSession, verifySession } from './jwt.js';

const SECRET = 'a-secret-long-enough-to-be-realistic-32+';
const NOW = 1_700_000_000_000;

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
  });

  it('salts, so the same password never produces the same hash twice', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  /** The unknown-username path verifies against a dummy hash; it must not throw or pass. */
  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$1$2$3$bm90LWJhc2U2NA==$zzz')).toBe(false);
  });
});

describe('session tokens', () => {
  const claims = { sub: 'user-1', username: 'neri', ver: 0 };
  const options = { secret: SECRET, ttlSeconds: 3600, now: NOW };

  it('round-trips the claims it was given', () => {
    const verified = verifySession(signSession(claims, options), { secret: SECRET, now: NOW });
    expect(verified).toMatchObject(claims);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession(claims, { ...options, secret: 'a-completely-different-secret-32+++' });
    expect(verifySession(token, { secret: SECRET, now: NOW })).toBeUndefined();
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = signSession(claims, options).split('.') as [
      string,
      string,
      string,
    ];
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'someone-else' })).toString(
      'base64url',
    );
    expect(verifySession(`${header}.${forged}.${signature}`, { secret: SECRET, now: NOW })).toBeUndefined();
  });

  /** `alg: none` and RS256→HS256 both start by rewriting the header, so the header is pinned. */
  it('rejects a token whose header claims a different algorithm', () => {
    const [, payload, signature] = signSession(claims, options).split('.') as [
      string,
      string,
      string,
    ];
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifySession(`${header}.${payload}.${signature}`, { secret: SECRET, now: NOW })).toBeUndefined();
  });

  it('rejects an expired token', () => {
    const token = signSession(claims, options);
    expect(verifySession(token, { secret: SECRET, now: NOW + 3601 * 1000 })).toBeUndefined();
  });

  it('rejects a token that is not three parts', () => {
    expect(verifySession('nonsense', { secret: SECRET, now: NOW })).toBeUndefined();
    expect(verifySession('a.b', { secret: SECRET, now: NOW })).toBeUndefined();
  });
});
