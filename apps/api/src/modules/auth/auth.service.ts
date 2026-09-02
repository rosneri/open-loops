import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaUserRepository } from '@open-loops/persistence';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { hashPassword, verifyPassword } from './password.js';
import { inviteAccepted, type RegistrationInput } from './registration.js';
import type { SessionPayload } from './jwt.strategy.js';
import { type AuthenticatedUser } from '@open-loops/plugin-nest';

@Injectable()
export class AuthService {
  public constructor(
    @Inject(Tokens.UserRepository) private readonly users: PrismaUserRepository,
    @Inject(Tokens.Config) private readonly config: AppConfig,
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

  /**
   * Creates an account for a caller holding the invite code. The code is checked before the
   * password is hashed, so an unconfigured deployment never spends a bcrypt round on a stranger,
   * and a wrong code is refused identically whether or not the username was available — telling
   * the two apart would turn the route into a way to enumerate accounts without an invite.
   */
  public async register(input: RegistrationInput): Promise<AuthenticatedUser> {
    if (!inviteAccepted(input.inviteCode, this.config.AUTH_SIGNUP_INVITE_CODE)) {
      throw new ForbiddenException('That invite code is not valid.');
    }

    const user = await this.users.create({
      username: input.username,
      passwordHash: await hashPassword(input.password),
    });
    // Past the invite gate the caller is a guest, not a stranger, so this may say what happened.
    if (user === undefined) throw new ConflictException('That username is taken.');
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
