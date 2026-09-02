import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * What a signup request must look like before anything is hashed or written. The rules are the
 * ones `create-user` has always applied from the command line, moved somewhere a stranger's
 * request passes through too: a username that is a name rather than a sentence, and a password
 * long enough that the bcrypt cost is not the only thing standing in the way.
 *
 * The maximum matters as much as the minimum — bcrypt silently ignores everything past 72
 * bytes, so accepting a longer one would be promising strength that is not there.
 */
export const registrationSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Username must be at least 2 characters.')
    .max(40, 'Username must be at most 40 characters.')
    // `@` and `+` are in the set because the accounts this app already has are email
    // addresses; the characters left out are the ones that make a name ambiguous to read.
    .regex(/^[a-zA-Z0-9._+@-]+$/, 'Username may use letters, digits and . _ + @ -'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(72, 'Password must be at most 72 characters.'),
  inviteCode: z.string().min(1, 'An invite code is required.'),
});

export type RegistrationInput = Readonly<z.infer<typeof registrationSchema>>;

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
