import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { UseCasesModule } from './infrastructure/use-cases.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { LoopsController } from './modules/loops/loops.controller.js';
import { PlanController } from './modules/plan/plan.controller.js';
import { IntegrationsController } from './modules/integrations/integrations.controller.js';
import { AgentController } from './modules/agent/agent.controller.js';
import { ComposioController } from './modules/composio/composio.controller.js';
import { TickController } from './modules/tick/tick.controller.js';
import { TickScheduler } from './modules/tick/tick.scheduler.js';
import { AuthModule } from './modules/auth/auth.module.js';

/**
 * The HTTP surface is one flat module on purpose: the interesting boundaries are the libraries,
 * not the controllers. Each controller is a thin translation of one context's use cases.
 */
@Module({
  imports: [InfrastructureModule, UseCasesModule, AuthModule],
  controllers: [
    HealthController,
    LoopsController,
    PlanController,
    IntegrationsController,
    AgentController,
    ComposioController,
    TickController,
  ],
  providers: [TickScheduler],
})
export class AppModule {}
