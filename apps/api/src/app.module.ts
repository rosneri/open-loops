import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { UseCasesModule } from './infrastructure/use-cases.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { LoopsController } from './modules/loops/loops.controller.js';
import { PlanController } from './modules/plan/plan.controller.js';
import { IntegrationsController } from './modules/integrations/integrations.controller.js';
import { AgentController } from './modules/agent/agent.controller.js';
import { AgentTokenGuard } from './modules/agent/agent-token.guard.js';
import { ComposioController } from './modules/composio/composio.controller.js';
import { TickController } from './modules/tick/tick.controller.js';
import { TickScheduler } from './modules/tick/tick.scheduler.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SessionGuard } from './modules/auth/session.guard.js';
import { SessionOrTokenGuard } from './modules/auth/session-or-token.guard.js';

/**
 * The HTTP surface is one flat module on purpose: the interesting boundaries are the libraries,
 * not the controllers. Each controller is a thin translation of one context's use cases.
 */
@Module({
  imports: [InfrastructureModule, UseCasesModule],
  controllers: [
    AuthController,
    HealthController,
    LoopsController,
    PlanController,
    IntegrationsController,
    AgentController,
    ComposioController,
    TickController,
  ],
  providers: [
    AgentTokenGuard,
    TickScheduler,
    AuthService,
    SessionOrTokenGuard,
    // Global rather than per-controller: a route is protected by default and has to opt out.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
