import { createPrismaClient, PrismaUserRepository } from '@open-loops/persistence';
import { loadConfig } from './config/env.js';
import { hashPassword } from './modules/auth/password.js';

/**
 * How the first account on a machine is made, and the only way to make one without an invite:
 * a signup route open to anyone who can reach the deployment would undo the login it sits
 * behind, so `POST /api/auth/register` exists only where AUTH_SIGNUP_INVITE_CODE is set.
 *
 * This script may also overwrite — re-running it for an existing username sets a new password
 * and ends every session that username already had — which registration deliberately cannot.
 *
 *   bun run apps/api/src/create-user.ts <username> [password]
 *
 * With the password omitted, one is generated and printed — which is the better habit, since a
 * password passed as an argument is visible in the process list and the shell history.
 */
const main = async (): Promise<void> => {
  const [username, provided] = process.argv.slice(2);
  if (username === undefined || username.trim().length === 0) {
    process.stderr.write('Usage: bun run apps/api/src/create-user.ts <username> [password]\n');
    process.exitCode = 1;
    return;
  }

  const password = provided ?? generatePassword();
  if (password.length < 12) {
    process.stderr.write('Password must be at least 12 characters.\n');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const prisma = createPrismaClient(config.DATABASE_URL);
  const users = new PrismaUserRepository(prisma);

  try {
    const user = await users.upsert({ username, passwordHash: await hashPassword(password) });
    process.stdout.write(`User ${user.username} ready.\n`);
    if (provided === undefined) process.stdout.write(`Password: ${password}\n`);
  } finally {
    await prisma.$disconnect();
  }
};

/** Base64url of 18 random bytes: 24 characters, no ambiguity about shell quoting. */
const generatePassword = (): string => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
};

await main();
