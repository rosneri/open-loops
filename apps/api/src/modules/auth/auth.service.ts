import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaUserRepository } from '@open-loops/persistence';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  inviteAccepted,
  type PasswordResetInput,
  type RegistrationInput,
} from './registration.js';
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
   * A wrong address and a wrong password fail identically, and both pay the cost of a bcrypt
   * comparison, so the answer neither says nor times which one it was.
   */
  public async validate(input: {
    email: string;
    password: string;
  }): Promise<AuthenticatedUser | undefined> {
    const user = await this.users.findByEmail(input.email);
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!ok || user === undefined) return undefined;
    return { id: user.id, email: user.email };
  }

  /**
   * Creates an account for a caller holding the invite code. The code is checked before the
   * password is hashed, so an unconfigured deployment never spends a bcrypt round on a stranger,
   * and a wrong code is refused identically whether or not the address was taken — telling the
   * two apart would turn the route into a way to enumerate accounts without an invite.
   */
  public async register(input: RegistrationInput): Promise<AuthenticatedUser> {
    if (!inviteAccepted(input.inviteCode, this.config.AUTH_SIGNUP_INVITE_CODE)) {
      throw new ForbiddenException('That invite code is not valid.');
    }

    const user = await this.users.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
    });
    // Past the invite gate the caller is a guest, not a stranger, so this may say what happened.
    if (user === undefined) throw new ConflictException('That email address already has an account.');
    return { id: user.id, email: user.email };
  }

  /**
   * Sets a new password for someone who has forgotten theirs. There is no mail sender in this
   * deployment, so what stands in for a link in an inbox is the invite code — the same secret
   * that decides who may have an account here at all. It is checked first and in constant time,
   * before a lookup or a hash, so a wrong code costs nothing and says nothing.
   *
   * Past that gate the answer may be specific: somebody holding the code can already create an
   * account with any address, so refusing to say whether one exists would protect nothing.
   *
   * Every existing session for the account ends — `setPassword` bumps `tokenVersion` — and the
   * caller is signed in on the new one, because the alternative is a screen that congratulates
   * you and then asks for the password you typed a second ago.
   */
  public async resetPassword(input: PasswordResetInput): Promise<AuthenticatedUser> {
    if (!inviteAccepted(input.inviteCode, this.config.AUTH_SIGNUP_INVITE_CODE)) {
      throw new ForbiddenException('That invite code is not valid.');
    }

    const existing = await this.users.findByEmail(input.email);
    if (existing === undefined) {
      throw new NotFoundException('No account uses that email address.');
    }

    const user = await this.users.setPassword({
      userId: existing.id,
      passwordHash: await hashPassword(input.password),
    });
    if (user === undefined) throw new NotFoundException('No account uses that email address.');
    return { id: user.id, email: user.email };
  }

  /** Expiry and signing algorithm come from the module's `JwtModule` registration. */
  public async issue(user: AuthenticatedUser): Promise<string> {
    const record = await this.users.findById(user.id);
    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      ver: record?.tokenVersion ?? 0,
    };
    return await this.jwt.signAsync(payload);
  }
}

/**
 * A real bcrypt hash of a value nothing will match, so the unknown-address path does the same
 * work as the wrong-password path instead of returning immediately.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.EFqAvQlpkEHFhOGnbrmuUiRbF7ES/nO';
