import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaUserRepository } from '@open-loops/persistence';
import type { AppConfig } from '../config/env.js';
import { seedHandles } from '../config/env.js';
import { Tokens } from '../tokens.js';

/** Who an account is to everything outside this app. */
export interface AccountIdentity {
  /** The identity Composio scopes this account's connected apps to. */
  readonly composioUserId: string;
  /** The handles this account typed into Settings, which is also what Settings edits. */
  readonly handles: readonly string[];
  /**
   * What actually decides whether a signal is "to me": the stored handles plus the ones this
   * account cannot help having — its email address, and a Composio identity chosen by hand.
   */
  readonly meHandles: readonly string[];
}

/**
 * Identity used to be the deployment's: one `OPEN_LOOPS_USER_ID` named the Composio account
 * every connection hung off, and one `OPEN_LOOPS_HANDLES` decided what counted as addressed to
 * "me". With more than one account that is not a limitation, it is a leak — connect Slack once
 * and everybody has it, and one person's mail reads as directed at all of them.
 *
 * Both now live on the account row. The environment variables are reduced to what `TICK_CRON`
 * already is: a seed for the first row and nothing after that.
 *
 * The first account claims the old `OPEN_LOOPS_USER_ID` verbatim, which is what keeps the apps
 * it has already connected connected. Everyone else gets their own id, and the unique index on
 * the column is what guarantees no second account can land on somebody's OAuth grants.
 */
@Injectable()
export class AccountIdentities {
  /**
   * Resolved once per account per process. The promise rather than the value is cached, so a
   * burst of concurrent requests on a cold start performs one claim rather than racing.
   */
  private readonly resolved = new Map<string, Promise<AccountIdentity>>();

  public constructor(
    @Inject(Tokens.UserRepository) private readonly users: PrismaUserRepository,
    @Inject(Tokens.Config) private readonly config: AppConfig,
  ) {}

  public identity(ownerId: string): Promise<AccountIdentity> {
    const existing = this.resolved.get(ownerId);
    if (existing !== undefined) return existing;

    const pending = this.resolve(ownerId).catch((error: unknown) => {
      // A failed lookup must not be remembered as this account's answer.
      this.resolved.delete(ownerId);
      throw error;
    });
    this.resolved.set(ownerId, pending);
    return pending;
  }

  public async composioUserId(ownerId: string): Promise<string> {
    return (await this.identity(ownerId)).composioUserId;
  }

  public async meHandles(ownerId: string): Promise<readonly string[]> {
    return (await this.identity(ownerId)).meHandles;
  }

  /**
   * Replaces the handles this account answers to. Forgetting the cached identity here rather
   * than at the call site is what stops a save from taking effect only after a restart.
   */
  public async setHandles(ownerId: string, handles: readonly string[]): Promise<AccountIdentity> {
    await this.users.setHandles(ownerId, handles);
    this.forget(ownerId);
    return await this.identity(ownerId);
  }

  /** Called when anything behind an identity changes, so the next read is from the database. */
  public forget(ownerId: string): void {
    this.resolved.delete(ownerId);
  }

  private async resolve(ownerId: string): Promise<AccountIdentity> {
    const user = await this.users.findById(ownerId);
    if (user === undefined) throw new NotFoundException(`No account ${ownerId}.`);
    if (user.composioUserId !== undefined) return identityOf(user);

    const legacy = this.config.OPEN_LOOPS_USER_ID.trim();
    const first = await this.users.firstUser();
    // Only the account that set this install up may inherit the deployment-wide identity: it is
    // the one whose consent screens produced the connections that identity holds.
    const inherits = legacy.length > 0 && first?.id === ownerId;

    return identityOf(
      await this.users.claimComposioIdentity({
        userId: ownerId,
        preferred: inherits ? legacy : ownerId,
        handles: inherits ? seedHandles(this.config) : [],
      }),
    );
  }
}

/**
 * The sign-in address is a handle too, and so is a Composio identity somebody chose by hand —
 * those are how a person is addressed on the providers they connected, so neither is something
 * to remember to type into Settings. A generated identity is just this row's id and names
 * nobody, so it is left out rather than matched against message text.
 */
const identityOf = (user: {
  id: string;
  email: string;
  composioUserId?: string;
  handles: readonly string[];
}): AccountIdentity => {
  const composioUserId = user.composioUserId ?? user.id;
  const named = composioUserId === user.id ? [] : [composioUserId];
  const meHandles = [user.email, ...named, ...user.handles]
    .map((handle) => handle.trim())
    .filter((handle) => handle.length > 0);
  return { composioUserId, handles: user.handles, meHandles: [...new Set(meHandles)] };
};
