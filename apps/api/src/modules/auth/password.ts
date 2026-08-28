import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** `promisify` cannot see through scrypt's overloads, so the options-taking one is named here. */
interface ScryptRequest {
  readonly password: string;
  readonly salt: Buffer;
  readonly keyLength: number;
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelism: number;
}

const scryptRaw = promisify(scryptCallback) as (
  ...args: [string | Buffer, string | Buffer, number, ScryptOptions]
) => Promise<Buffer>;

interface ScryptOptions {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly maxmem: number;
}

/** One object rather than four positional arguments, which the lint rule rightly dislikes. */
const derive = async (request: ScryptRequest): Promise<Buffer> =>
  await scryptRaw(request.password.normalize('NFKC'), request.salt, request.keyLength, {
    N: request.cost,
    r: request.blockSize,
    p: request.parallelism,
    maxmem: MAX_MEMORY,
  });

/**
 * scrypt from `node:crypto` rather than bcrypt or argon2: both of those are native modules, and
 * this API is bundled into a single file for a Vercel function, where a `.node` binary would not
 * survive the build. scrypt is memory-hard, in the standard library, and needs no build step.
 *
 * Parameters are stored alongside the hash so raising the cost later does not invalidate the
 * passwords already in the database.
 */
const KEY_LENGTH = 64;
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
/** scrypt needs roughly 128 * COST * BLOCK_SIZE bytes; Node's 32 MB default is below that. */
const MAX_MEMORY = 256 * 1024 * 1024;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = await derive({
    password,
    salt,
    keyLength: KEY_LENGTH,
    cost: COST,
    blockSize: BLOCK_SIZE,
    parallelism: PARALLELISM,
  });
  return [
    'scrypt',
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELISM),
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
};

/**
 * Never throws on a malformed hash and never returns early on a mismatch: both would let the
 * caller distinguish "no such user" from "wrong password" by timing alone.
 */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, cost, blockSize, parallelism, salt, expected] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expectedBytes = Buffer.from(expected, 'base64');

  try {
    const derived = await derive({
      password,
      salt: Buffer.from(salt, 'base64'),
      keyLength: expectedBytes.length,
      cost: Number(cost),
      blockSize: Number(blockSize),
      parallelism: Number(parallelism),
    });
    return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes);
  } catch {
    return false;
  }
};
