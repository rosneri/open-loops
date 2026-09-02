import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limits by caller rather than by whatever the caller says it is. The stock guard reads the
 * leftmost `x-forwarded-for` entry, which behind a proxy is a header the client wrote — anyone
 * guessing at an invite code could rotate it every request and never meet the limit.
 *
 * Vercel sets `x-vercel-forwarded-for` itself and overwrites what arrived, so it is the one
 * value here that a client cannot choose. Everywhere else the connection's own address is the
 * honest answer, because nothing sits in front of the app to forward anything.
 */
@Injectable()
export class CredentialThrottleGuard extends ThrottlerGuard {
  // The base signature is async; nothing here needs to be, so the answer is simply resolved.
  protected override getTracker(request: Request): Promise<string> {
    const forwarded = request.headers['x-vercel-forwarded-for'];
    const platform = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return Promise.resolve(platform ?? request.socket.remoteAddress ?? 'unknown');
  }
}
