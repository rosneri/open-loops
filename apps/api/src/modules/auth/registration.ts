import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * The address an account is. Lower-cased and trimmed before it is validated, so "  Neri@X.com "
 * and "neri@x.com" are one account rather than two — the column is unique on exactly this value
 * and the repository normalises the same way.
 *
 * 254 is the longest address SMTP will carry, so anything past it is not an address anybody
 * could be reached at.
 */
const emailField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.email('Enter an email address.').max(254, 'That email address is too long.'),
);

/**
 * The maximum matters as much as the minimum — bcrypt silently ignores everything past 72
 * bytes, so accepting a longer one would be promising strength that is not there.
 */
const passwordField = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(72, 'Password must be at most 72 characters.');

/**
 * What a signup request must look like before anything is hashed or written. The rules are the
 * ones `create-user` has always applied from the command line, moved somewhere a stranger's
 * request passes through too — except that the name is now an email address, because it is the
 * address a person is reachable at rather than a handle they invented, and every account this
 * app has ever had was created with one anyway.
 */
export const registrationSchema = z.object({
  email: emailField,
  password: passwordField,
  inviteCode: z.string().min(1, 'An invite code is required.'),
});

export type RegistrationInput = Readonly<z.infer<typeof registrationSchema>>;

/**
 * What a password reset must look like. Same three fields as a signup, and deliberately so: this
 * deployment has no way to send mail, so the invite code — the secret that already decides who
 * may have an account here at all — is what proves the request is not a stranger's.
 *
 * That is a real trade: anybody holding the code can take over any account on this deployment,
 * so the code is as sensitive as the accounts it protects and should be rotated when it spreads.
 */
export const passwordResetSchema = z.object({
  email: emailField,
  password: passwordField,
  inviteCode: z.string().min(1, 'An invite code is required.'),
});

export type PasswordResetInput = Readonly<z.infer<typeof passwordResetSchema>>;

/**
 * Compares the presented code against the configured one without leaking its length or how far
 * a guess got. `timingSafeEqual` throws on differing lengths, so both sides are digested first:
 * the digests are always 32 bytes, and the comparison is then genuinely constant-time.
 *
 * An unconfigured code is never "no code required" — it means registration is closed, and every
 * presented code is wrong.
 */
export const inviteAccepted = (presented: string, configured: string | undefined): boolean => {
  if (configured === undefined) return false;
  return timingSafeEqual(digest(presented), digest(configured));
};

const digest = (value: string): Buffer =>
  createHash('sha256').update(value.normalize('NFKC')).digest();
