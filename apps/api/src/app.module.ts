import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { LoopsController } from './modules/loops/loops.controller.js';
import { PlanController } from './modules/plan/plan.controller.js';
import { IntegrationsController } from './modules/integrations/integrations.controller.js';
import { AgentController } from './modules/agent/agent.controller.js';
import { ComposioController } from './modules/composio/composio.controller.js';
import { TickController } from './modules/tick/tick.controller.js';
import { SettingsController } from './modules/settings/settings.controller.js';
import { SettingsService } from './modules/settings/settings.service.js';
import { SchedulesService } from './modules/settings/schedules.service.js';
import { SchedulesController } from './modules/settings/schedules.controller.js';
import { WorkspaceFactory, SharedServices } from './infrastructure/workspace.factory.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PluginHost } from '@open-loops/plugin-host';
import { pluginScopesToken, type PluginScopes } from '@open-loops/plugin-nest';
import { JsonLogger } from './system/json-logger.js';
import { enabledPlugins } from './plugins/enabled.js';
import { isLocalMode, loadConfig } from './config/env.js';

/** The routes the product itself owns. Anything else on the HTTP surface came from a plugin. */
const CORE_CONTROLLERS = [
  HealthController,
  LoopsController,
  PlanController,
  IntegrationsController,
  AgentController,
  ComposioController,
  TickController,
  SettingsController,
  SchedulesController,
];

/**
 * The HTTP surface is one flat module on purpose: the interesting boundaries are the libraries,
 * not the controllers. Each controller is a thin translation of one context's use cases — and
 * now, of one plugin's.
 */
@Module({})
export class AppModule {}

/**
 * Boot, in the only order that works: load the plugins, then build a container out of what they
 * registered. A plugin's controllers are mounted here rather than discovered, so a route that
 * exists is a route something declared and the host has already refused any two plugins that
 * would answer on the same path.
 */
export const createAppModule = async (): Promise<DynamicModule> => {
  const config = loadConfig();
  const logger = new JsonLogger(isLocalMode(config) ? 'debug' : 'info');
  const host = await PluginHost.load({
    plugins: enabledPlugins(config.OPEN_LOOPS_PLUGINS),
    logger,
    env: process.env,
  });

  const contributed = host.http();
  return {
    module: AppModule,
    imports: [InfrastructureModule.forHost(host), AuthModule],
    controllers: [
      ...CORE_CONTROLLERS,
      ...contributed.flatMap((entry) => entry.definition.controllers),
    ],
    providers: [
      SettingsService,
      SchedulesService,
      WorkspaceFactory,
      SharedServices,
      // Opaque in the contract, because a plugin library that imported Nest would drag the
      // container into every one of them. This is the one place that knows what they are.
      ...(contributed.flatMap((entry) => entry.definition.providers ?? []) as Provider[]),
      // One `PluginScopes` per plugin with routes, already closed over that plugin's id: a
      // controller asks for an owner's scope and gets only what its own manifest declared.
      ...contributed.map(
        ({ pluginId }): Provider => ({
          provide: pluginScopesToken(pluginId),
          inject: [WorkspaceFactory],
          useFactory: (workspaces: WorkspaceFactory): PluginScopes => ({
            for: (ownerId) => workspaces.for(ownerId).scopeFor(pluginId),
          }),
        }),
      ),
    ],
  };
};
