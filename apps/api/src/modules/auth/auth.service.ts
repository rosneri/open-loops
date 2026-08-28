import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { PrismaUserRepository, UserRecord } from '@open-loops/persistence';
import type { Clock } from '@open-loops/kernel';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { verifyPassword } from './password.js';
import { signSession, verifySession, type SessionClaims } from './jwt.js';

export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
}

@Injectable()
export class AuthService {
  public constructor(
    @Inject(Tokens.UserRepository) private readonly users: PrismaUserRepository,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    @Inject(Tokens.Clock) private readonly clock: Clock,
  ) {}

  /**
   * A wrong username and a wrong password fail identically, and both pay the cost of a hash
   * verification, so the response neither says nor times which one it was.
   */
  public async login(input: {
    username: string;
    password: string;
  }): Promise<{ user: AuthenticatedUser; token: string }> {
    const user = await this.users.findByUsername(input.username);
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!ok || user === undefined) {
      throw new UnauthorizedException('Wrong username or password.');
    }

    return { user: toUser(user), token: this.issue(user) };
  }

  /**
   * Verifies the signature first and only then touches the database — an unsigned token must
   * not be able to cost a query. `ver` is what makes a password change end existing sessions.
   */
  public async authenticate(token: string): Promise<AuthenticatedUser | undefined> {
    const claims = this.claims(token);
    if (claims === undefined) return undefined;

    const user = await this.users.findById(claims.sub);
    if (user?.tokenVersion !== claims.ver) return undefined;
    return toUser(user);
  }

  private claims(token: string): SessionClaims | undefined {
    return verifySession(token, {
      secret: this.config.AUTH_JWT_SECRET,
      now: this.clock.now(),
    });
  }

  private issue(user: UserRecord): string {
    return signSession(
      { sub: user.id, username: user.username, ver: user.tokenVersion },
      {
        secret: this.config.AUTH_JWT_SECRET,
        ttlSeconds: this.config.AUTH_SESSION_TTL_HOURS * 60 * 60,
        now: this.clock.now(),
      },
    );
  }
}

const toUser = (user: UserRecord): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
});

/**
 * A real scrypt hash of a value nothing can match, so the unknown-username path does the same
 * work as the wrong-password path instead of returning immediately.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
