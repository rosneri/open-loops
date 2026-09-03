import { describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, verifyPassword } from './password.js';
import { inviteAccepted, passwordResetSchema, registrationSchema } from './registration.js';
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

  /** The unknown-address path verifies against a dummy hash; it must not throw or pass. */
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
  const payload: SessionPayload = { sub: 'user-1', email: 'neri@example.com', ver: 0 };
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

const CODE = 'an-invite-code-long-enough';

describe('invite codes', () => {
  it('accepts the configured code and rejects a near miss', () => {
    expect(inviteAccepted(CODE, CODE)).toBe(true);
    expect(inviteAccepted(`${CODE}x`, CODE)).toBe(false);
    expect(inviteAccepted(CODE.toUpperCase(), CODE)).toBe(false);
  });

  /** An unset code closes registration; it must never read as "no code required". */
  it('rejects everything when no code is configured', () => {
    expect(inviteAccepted(CODE, undefined)).toBe(false);
    expect(inviteAccepted('', undefined)).toBe(false);
  });

  /** Lengths differ on almost every wrong guess; the comparison must survive that, not throw. */
  it('compares codes of different lengths without throwing', () => {
    expect(inviteAccepted('short', CODE)).toBe(false);
    expect(inviteAccepted(`${CODE}${CODE}`, CODE)).toBe(false);
  });
});

describe('registration input', () => {
  const valid = {
    email: 'neri@example.com',
    password: 'correct horse battery',
    inviteCode: CODE,
  };

  /** Two people typing the same address with different spacing and case are one account. */
  it('accepts a plausible signup and normalises the address', () => {
    const parsed = registrationSchema.parse({ ...valid, email: '  Neri@Example.COM ' });
    expect(parsed.email).toBe('neri@example.com');
  });

  it('rejects a password bcrypt would silently truncate', () => {
    expect(registrationSchema.safeParse({ ...valid, password: 'x'.repeat(73) }).success).toBe(
      false,
    );
    expect(registrationSchema.safeParse({ ...valid, password: 'x'.repeat(72) }).success).toBe(true);
  });

  it('rejects a password short enough to guess', () => {
    expect(registrationSchema.safeParse({ ...valid, password: 'hunter2' }).success).toBe(false);
  });

  it('rejects what is not an email address', () => {
    for (const email of ['', 'neri', 'has space@example.com', 'neri@', '@example.com']) {
      expect(registrationSchema.safeParse({ ...valid, email }).success).toBe(false);
    }
  });

  it('accepts the tagged addresses people actually sign up with', () => {
    expect(
      registrationSchema.safeParse({ ...valid, email: 'neri.coder+ol@gmail.com' }).success,
    ).toBe(true);
  });

  it('requires an invite code to be present at all', () => {
    expect(registrationSchema.safeParse({ ...valid, inviteCode: '' }).success).toBe(false);
    expect(
      registrationSchema.safeParse({ email: valid.email, password: valid.password }).success,
    ).toBe(false);
  });
});

/**
 * A reset writes a password, so it has to be as hard to get wrong as a signup: the same address
 * rules, the same length floor and ceiling, and the invite code that stands in for a mailer.
 */
describe('password reset input', () => {
  const valid = {
    email: 'neri@example.com',
    password: 'a brand new password',
    inviteCode: CODE,
  };

  it('accepts a plausible reset and normalises the address', () => {
    expect(passwordResetSchema.parse({ ...valid, email: ' NERI@example.com ' }).email).toBe(
      'neri@example.com',
    );
  });

  it('refuses a reset that would set a password login could not hold', () => {
    expect(passwordResetSchema.safeParse({ ...valid, password: 'hunter2' }).success).toBe(false);
    expect(passwordResetSchema.safeParse({ ...valid, password: 'x'.repeat(73) }).success).toBe(
      false,
    );
  });

  it('refuses a reset with nothing to prove the caller belongs here', () => {
    expect(passwordResetSchema.safeParse({ ...valid, inviteCode: '' }).success).toBe(false);
  });
});
