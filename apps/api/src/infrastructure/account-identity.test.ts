import { describe, expect, it } from 'vitest';
import type { PrismaUserRepository, UserRecord } from '@open-loops/persistence';
import { AccountIdentities } from './account-identity.service.js';
import type { AppConfig } from '../config/env.js';

const config = (overrides: Partial<AppConfig> = {}): AppConfig =>
  ({
    OPEN_LOOPS_USER_ID: 'neri',
    OPEN_LOOPS_HANDLES: 'neri.coder@gmail.com, @neri',
    ...overrides,
  }) as AppConfig;

/**
 * The claim is a conditional update in the real repository; here it is the same rule written
 * plainly — first writer wins, and a Composio id may belong to exactly one account.
 */
class FakeUsers {
  public claims = 0;
  private readonly rows = new Map<string, UserRecord & { composioUserId?: string }>();
  private readonly order: string[] = [];

  public add(user: { id: string; username: string; handles?: readonly string[] }): void {
    this.rows.set(user.id, {
      id: user.id,
      username: user.username,
      passwordHash: 'x',
      tokenVersion: 0,
      handles: user.handles ?? [],
    });
    this.order.push(user.id);
  }

  public findById(id: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  public firstUser(): Promise<UserRecord | undefined> {
    return Promise.resolve(this.rows.get(this.order[0] ?? ''));
  }

  public setHandles(id: string, handles: readonly string[]): Promise<UserRecord> {
    const row = this.rows.get(id);
    if (row === undefined) throw new Error('no such user');
    const next = { ...row, handles };
    this.rows.set(id, next);
    return Promise.resolve(next);
  }

  public claimComposioIdentity(input: {
    userId: string;
    preferred: string;
    handles: readonly string[];
  }): Promise<UserRecord> {
    this.claims += 1;
    const row = this.rows.get(input.userId);
    if (row === undefined) throw new Error('no such user');
    if (row.composioUserId !== undefined) return Promise.resolve(row);

    const taken = [...this.rows.values()].some(
      (other) => other.composioUserId === input.preferred,
    );
    const next = {
      ...row,
      composioUserId: taken ? input.userId : input.preferred,
      handles: input.handles.length === 0 ? row.handles : [...input.handles],
    };
    this.rows.set(input.userId, next);
    return Promise.resolve(next);
  }

  public asRepository(): PrismaUserRepository {
    return this as unknown as PrismaUserRepository;
  }
}

const identities = (users: FakeUsers, overrides?: Partial<AppConfig>): AccountIdentities =>
  new AccountIdentities(users.asRepository(), config(overrides));

describe('composio identity per account', () => {
  it('gives the first account the identity its connections were already made under', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri' });

    const identity = await identities(users).identity('user-1');

    expect(identity.composioUserId).toBe('neri');
    // Seeded from the environment exactly once, so the sync keeps recognising the same person.
    expect(identity.handles).toEqual(['neri', 'neri.coder@gmail.com', '@neri']);
  });

  it('never lets a second account inherit the first one’s connected apps', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri' });
    users.add({ id: 'user-2', username: 'sam' });
    const service = identities(users);

    const first = await service.identity('user-1');
    const second = await service.identity('user-2');

    expect(second.composioUserId).toBe('user-2');
    expect(second.composioUserId).not.toBe(first.composioUserId);
    // The environment seeds one account, not everybody: sam is not neri.
    expect(second.handles).toEqual([]);
    expect(second.meHandles).toEqual(['sam']);
  });

  it('falls back to its own id when another account already holds the legacy one', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri' });
    users.add({ id: 'user-2', username: 'sam' });
    // Someone else got there first, which the unique index reports as a collision.
    await users.claimComposioIdentity({ userId: 'user-2', preferred: 'neri', handles: [] });

    expect((await identities(users).identity('user-1')).composioUserId).toBe('user-1');
  });

  it('claims once and answers from memory after that', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri' });
    const service = identities(users);

    const [a, b] = await Promise.all([service.identity('user-1'), service.identity('user-1')]);
    await service.identity('user-1');

    expect(users.claims).toBe(1);
    expect(a).toEqual(b);
  });

  it('re-reads after the account edits its handles', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri' });
    const service = identities(users);
    await service.identity('user-1');

    await users.setHandles('user-1', ['neri@work.com']);
    service.forget('user-1');

    expect((await service.identity('user-1')).meHandles).toEqual(['neri', 'neri@work.com']);
  });

  it('counts the sign-in name and a hand-picked composio id as handles, without repeating', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri', handles: ['neri'] });

    const identity = await identities(users, { OPEN_LOOPS_HANDLES: '' }).identity('user-1');

    expect(identity.meHandles).toEqual(['neri']);
  });

  it('does not remember a failed lookup as the answer', async () => {
    const users = new FakeUsers();
    users.add({ id: 'user-1', username: 'neri' });
    const service = identities(users);

    await expect(service.identity('ghost')).rejects.toThrow();
    users.add({ id: 'ghost', username: 'ghost' });
    expect((await service.identity('ghost')).composioUserId).toBe('ghost');
  });
});
