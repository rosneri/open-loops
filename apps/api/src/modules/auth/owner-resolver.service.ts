import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PrismaUserRepository } from '@open-loops/persistence';
import { Tokens } from '../../tokens.js';

/**
 * Resolves an owner for callers that have a shared secret instead of a session: the local agent
 * and the scheduler. They name the account in a header rather than a body field, so the same
 * value works on every endpoint regardless of shape.
 *
 * With exactly one account, the header may be omitted — that is the single-user install, and
 * making it name itself would be ceremony. With several, guessing would be worse than failing.
 */
@Injectable()
export class OwnerResolver {
  public constructor(
    @Inject(Tokens.UserRepository) private readonly users: PrismaUserRepository,
  ) {}

  public async resolve(email: string | undefined): Promise<string> {
    if (email !== undefined && email.length > 0) {
      const user = await this.users.findByEmail(email);
      if (user === undefined) throw new BadRequestException(`No account for "${email}".`);
      return user.id;
    }

    const only = await this.users.onlyUser();
    if (only === undefined) {
      throw new BadRequestException(
        'There is more than one account, so the x-open-loops-user header is required.',
      );
    }
    return only.id;
  }
}
