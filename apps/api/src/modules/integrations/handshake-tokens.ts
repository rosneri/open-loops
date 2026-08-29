import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * An OAuth consent screen sends the browser back to a route that cannot require a session — the
 * user may have taken twenty minutes on the provider's page, and a third-party redirect is
 * exactly the shape a lapsed cookie fails on.
 *
 * So the account that started the handshake is carried in the redirect itself, signed with the
 * same secret as a session and valid only briefly. A plain query parameter would let anyone
 * attach their own provider account to somebody else's workspace by editing one field.
 */
const TTL_SECONDS = 30 * 60;

@Injectable()
export class HandshakeTokens {
  public constructor(private readonly jwt: JwtService) {}

  public mint(ownerId: string): string {
    return this.jwt.sign({ sub: ownerId, use: 'integration-handshake' }, { expiresIn: TTL_SECONDS });
  }

  /** Undefined for anything that is missing, expired, forged, or minted for another purpose. */
  public read(state: string | undefined): string | undefined {
    if (state === undefined) return undefined;
    try {
      const claims = this.jwt.verify<{ sub?: string; use?: string }>(state);
      if (claims.use !== 'integration-handshake') return undefined;
      return claims.sub;
    } catch {
      return undefined;
    }
  }
}
