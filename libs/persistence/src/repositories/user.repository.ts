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
  /** Undefined until the account claims one; see `claimComposioIdentity`. */
  readonly composioUserId?: string;
  readonly handles: readonly string[];
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

  public async listAll(): Promise<readonly UserRecord[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toRecord);
  }

  /**
   * The single account, or undefined when there are none or several. Callers use it to make a
   * user header optional on a single-user install without ever guessing between two people.
   */
  public async onlyUser(): Promise<UserRecord | undefined> {
    const rows = await this.prisma.user.findMany({ take: 2 });
    return rows.length === 1 ? toRecord(rows[0] as UserRow) : undefined;
  }

  /**
   * The account that set this install up. It is the one that owns whatever was connected before
   * the app had accounts, which is why it — and only it — may claim the legacy Composio id.
   */
  public async firstUser(): Promise<UserRecord | undefined> {
    const row = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    return row === null ? undefined : toRecord(row);
  }

  /**
   * Binds this account to a Composio identity, once. `preferred` is tried first — that is how
   * the original account keeps the connections it made under OPEN_LOOPS_USER_ID — and the
   * account's own id is the fallback when another account already holds it.
   *
   * Written as a conditional update rather than a read-then-write: two requests racing on a
   * cold start would otherwise both see NULL and the loser would silently rebind an identity
   * whose connections are already in use. The `WHERE composioUserId IS NULL` clause makes the
   * second one a no-op, and the unique index makes a collision an error rather than a theft.
   */
  public async claimComposioIdentity(input: {
    userId: string;
    preferred: string;
    handles: readonly string[];
  }): Promise<UserRecord> {
    const candidates =
      input.preferred === input.userId ? [input.userId] : [input.preferred, input.userId];

    for (const composioUserId of candidates) {
      try {
        await this.prisma.user.updateMany({
          where: { id: input.userId, composioUserId: null },
          data: {
            composioUserId,
            // Seeded alongside the claim and never again, so a later edit is not overwritten.
            ...(input.handles.length === 0 ? {} : { handles: [...input.handles] }),
          },
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    const claimed = await this.findById(input.userId);
    if (claimed?.composioUserId === undefined) {
      throw new Error(`Could not assign a Composio identity to ${input.userId}.`);
    }
    return claimed;
  }

  /** Blank entries are dropped and duplicates collapsed, so the stored list is the honest one. */
  public async setHandles(userId: string, handles: readonly string[]): Promise<UserRecord> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { handles: cleanHandles(handles) },
    });
    return toRecord(row);
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

export const cleanHandles = (handles: readonly string[]): string[] => [
  ...new Set(handles.map((handle) => handle.trim()).filter((handle) => handle.length > 0)),
];

/** Prisma reports a broken unique index as P2002 regardless of the database underneath. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

const normalise = (username: string): string => username.trim().toLowerCase();

interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  tokenVersion: number;
  composioUserId: string | null;
  handles: string[];
}

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  username: row.username,
  passwordHash: row.passwordHash,
  tokenVersion: row.tokenVersion,
  ...(row.composioUserId === null ? {} : { composioUserId: row.composioUserId }),
  handles: row.handles,
});
