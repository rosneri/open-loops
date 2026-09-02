import { Inject } from '@nestjs/common';
import type { OwnerScope } from '@open-loops/plugin-api';

/**
 * A plugin controller's way to reach one person's data: the same `OwnerScope` its schedule and
 * tick steps get, built by the host per owner and carrying only what the manifest declared.
 * Nothing here takes a plugin id at call time — the host binds one of these per plugin that
 * mounted routes, already closed over that plugin's identity.
 */
export interface PluginScopes {
  for(ownerId: string): OwnerScope;
}

/** The host provides this token for every plugin that registered routes, and only for those. */
export const pluginScopesToken = (pluginId: string): string => `ol:plugin-scopes:${pluginId}`;

/**
 * `@InjectPluginScopes('podcast') private readonly scopes: PluginScopes`. The id is stated at
 * the injection site rather than discovered, so reading the controller tells you whose data it
 * can see.
 */
export const InjectPluginScopes = (pluginId: string): ParameterDecorator =>
  Inject(pluginScopesToken(pluginId));
