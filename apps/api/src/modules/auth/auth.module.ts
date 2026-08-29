import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { AgentTokenGuard } from '../agent/agent-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
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
