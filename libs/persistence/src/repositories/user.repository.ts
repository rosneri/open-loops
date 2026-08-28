import type { PrismaClient } from '../prisma-client.js';

/**
 * Authentication has no domain library of its own: there is no invariant here beyond "this
 * username maps to this hash". The record is deliberately flat, and the hash never leaves the
 * auth module, which is the only code that knows how to verify one.
 */
export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly tokenVersion: number;
}

export class PrismaUserRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /** Usernames are compared case-insensitively; storing them lowercased keeps that honest. */
  public async findByUsername(username: string): Promise<UserRecord | undefined> {
    const row = await this.prisma.user.findUnique({ where: { username: normalise(username) } });
    return row === null ? undefined : toRecord(row);
  }

  public async findById(id: string): Promise<UserRecord | undefined> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row === null ? undefined : toRecord(row);
  }

  public async count(): Promise<number> {
    return await this.prisma.user.count();
  }

  /** Upsert rather than create, so re-running the setup script rotates a password in place. */
  public async upsert(input: { username: string; passwordHash: string }): Promise<UserRecord> {
    const username = normalise(input.username);
    const row = await this.prisma.user.upsert({
      where: { username },
      create: { username, passwordHash: input.passwordHash },
      update: { passwordHash: input.passwordHash, tokenVersion: { increment: 1 } },
    });
    return toRecord(row);
  }
}

const normalise = (username: string): string => username.trim().toLowerCase();

const toRecord = (row: {
  id: string;
  username: string;
  passwordHash: string;
  tokenVersion: number;
}): UserRecord => ({
  id: row.id,
  username: row.username,
  passwordHash: row.passwordHash,
  tokenVersion: row.tokenVersion,
});
