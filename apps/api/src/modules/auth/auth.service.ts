import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaUserRepository } from '@open-loops/persistence';
import { Tokens } from '../../tokens.js';
import { verifyPassword } from './password.js';
import type { SessionPayload } from './jwt.strategy.js';

export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
}

@Injectable()
export class AuthService {
  public constructor(
    @Inject(Tokens.UserRepository) private readonly users: PrismaUserRepository,
    private readonly jwt: JwtService,
  ) {}

  /**
   * A wrong username and a wrong password fail identically, and both pay the cost of a bcrypt
   * comparison, so the answer neither says nor times which one it was.
   */
  public async validate(input: {
    username: string;
    password: string;
  }): Promise<AuthenticatedUser | undefined> {
    const user = await this.users.findByUsername(input.username);
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!ok || user === undefined) return undefined;
    return { id: user.id, username: user.username };
  }

  /** Expiry and signing algorithm come from the module's `JwtModule` registration. */
  public async issue(user: AuthenticatedUser): Promise<string> {
    const record = await this.users.findById(user.id);
    const payload: SessionPayload = {
      sub: user.id,
      username: user.username,
      ver: record?.tokenVersion ?? 0,
    };
    return await this.jwt.signAsync(payload);
  }
}

/**
 * A real bcrypt hash of a value nothing will match, so the unknown-username path does the same
 * work as the wrong-password path instead of returning immediately.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.EFqAvQlpkEHFhOGnbrmuUiRbF7ES/nO';
