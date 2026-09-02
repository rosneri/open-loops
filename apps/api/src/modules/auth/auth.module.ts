import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { AgentTokenGuard } from '../agent/agent-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CredentialThrottleGuard } from './credential-throttle.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtStrategy } from './jwt.strategy.js';
import { LocalStrategy } from './local.strategy.js';
import { SessionOrTokenGuard } from './session-or-token.guard.js';
import { OwnerResolver } from './owner-resolver.service.js';
import { HandshakeTokens } from '../integrations/handshake-tokens.js';

/**
 * `session: false` throughout: the token in the cookie is the whole session, so Passport has no
 * server-side state to keep and nothing to serialise between requests.
 */
@Module({
  imports: [
    PassportModule.register({ session: false }),
    /**
     * Only the credential routes are throttled, so this is registered here rather than globally:
     * a sweep posting to /api/tick and a plugin panel refreshing a page are not guessing at
     * anything, and a limit that applied to them would be a limit someone has to keep raising.
     *
     * The store is in-process. On the long-lived machine that is the whole story; on Vercel each
     * warm instance counts on its own, so this is a speed bump across a fleet rather than a wall
     * — which is why the invite code still has to be worth guessing at, not just the limit.
     */
    ThrottlerModule.forRoot([{ name: 'credentials', ttl: 60_000, limit: 10 }]),
    JwtModule.registerAsync({
      inject: [Tokens.Config],
      useFactory: (config: AppConfig) => ({
        secret: config.AUTH_JWT_SECRET,
        // Seconds rather than a "168h" string: `expiresIn` types the string form as a closed
        // union of literals, which a computed value can never satisfy.
        signOptions: { expiresIn: config.AUTH_SESSION_TTL_HOURS * 60 * 60 },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CredentialThrottleGuard,
    JwtStrategy,
    LocalStrategy,
    AgentTokenGuard,
    SessionOrTokenGuard,
    OwnerResolver,
    // Signs the OAuth handshake state, so it needs the same JwtService a session does.
    HandshakeTokens,
    // Global rather than per-controller: a route is protected by default and has to opt out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, SessionOrTokenGuard, AgentTokenGuard, OwnerResolver, HandshakeTokens],
})
export class AuthModule {}
