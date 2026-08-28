import { describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, verifyPassword } from './password.js';
import type { SessionPayload } from './jwt.strategy.js';

const SECRET = 'a-secret-long-enough-to-be-realistic-32+';

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
    expect(await verifyPassword('anything', '')).toBe(false);
  });
});

/**
 * Signature, expiry and algorithm are `jsonwebtoken`'s job via `@nestjs/jwt`; these cover the
 * way this app configures it, which is the part that could be got wrong here.
 */
describe('session tokens', () => {
  const payload: SessionPayload = { sub: 'user-1', username: 'neri', ver: 0 };
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '168h' } });

  it('round-trips the claims it was given', () => {
    expect(jwt.verify<SessionPayload>(jwt.sign(payload))).toMatchObject(payload);
  });

  it('rejects a token signed with a different secret', () => {
    const other = new JwtService({ secret: 'a-completely-different-secret-32+++' });
    expect(() => {
      jwt.verify(other.sign(payload));
    }).toThrow();
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = jwt.sign(payload).split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ ...payload, sub: 'someone-else' })).toString(
      'base64url',
    );
    expect(() => {
      jwt.verify(`${header}.${forged}.${signature}`);
    }).toThrow();
  });

  /** `alg: none` is the classic downgrade; the verifier must not take the header's word for it. */
  it('rejects a token that claims no algorithm', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => {
      jwt.verify(`${header}.${body}.`);
    }).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = new JwtService({ secret: SECRET, signOptions: { expiresIn: '-1s' } });
    expect(() => {
      jwt.verify(expired.sign(payload));
    }).toThrow();
  });

  it('rejects a token that is not three parts', () => {
    expect(() => {
      jwt.verify('nonsense');
    }).toThrow();
  });
});
