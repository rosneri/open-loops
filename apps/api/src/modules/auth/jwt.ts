import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A deliberately small HS256 implementation. The alternative was another dependency inside a
 * bundle that already has to be self-contained, for a token with three claims. The one rule
 * worth stating: `alg` is never read from the header — it is fixed here, which is what stops
 * the classic "alg: none" and RS256-to-HS256 confusion attacks.
 */
export interface SessionClaims {
  /** User id. */
  readonly sub: string;
  readonly username: string;
  /** Matched against the row so a password change invalidates tokens already issued. */
  readonly ver: number;
  readonly iat: number;
  readonly exp: number;
}

const HEADER = base64Url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

export const signSession = (
  claims: Omit<SessionClaims, 'iat' | 'exp'>,
  input: { secret: string; ttlSeconds: number; now: number },
): string => {
  const issuedAt = Math.floor(input.now / 1000);
  const payload: SessionClaims = {
    ...claims,
    iat: issuedAt,
    exp: issuedAt + input.ttlSeconds,
  };
  const body = `${HEADER}.${base64Url(Buffer.from(JSON.stringify(payload)))}`;
  return `${body}.${sign(body, input.secret)}`;
};

/** Returns undefined for every failure — a caller that cannot tell them apart cannot leak them. */
export const verifySession = (
  token: string,
  input: { secret: string; now: number },
): SessionClaims | undefined => {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;

  const [header, payload, signature] = parts as [string, string, string];
  if (header !== HEADER) return undefined;

  const expected = Buffer.from(sign(`${header}.${payload}`, input.secret));
  const presented = Buffer.from(signature);
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    return undefined;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return undefined;
    if (claims.exp * 1000 <= input.now) return undefined;
    return claims;
  } catch {
    return undefined;
  }
};

const sign = (body: string, secret: string): string =>
  base64Url(createHmac('sha256', secret).update(body).digest());

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}
