import { compare, hash } from 'bcryptjs';

/**
 * bcrypt through `bcryptjs` — the pure-JavaScript implementation rather than the native `bcrypt`
 * package. This API is bundled into a single file for a Vercel function, where a `.node` binary
 * would not survive the build; bcryptjs has no build step and no binary.
 *
 * The cost factor is stored inside the hash, so raising it later leaves existing passwords
 * working and only changes what new ones cost.
 */
const COST = 12;

export const hashPassword = async (password: string): Promise<string> =>
  await hash(password.normalize('NFKC'), COST);

/** Returns false rather than throwing on a malformed hash: the caller cannot act on the reason. */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  try {
    return await compare(password.normalize('NFKC'), stored);
  } catch {
    return false;
  }
};
