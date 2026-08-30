import { Body, Controller, Get, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type {
  ComposioToolExplorer,
  DiscoveredTool,
  ToolExecution,
  ToolkitState,
} from '@open-loops/connectors-composio';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { Owner } from '../auth/owner.decorator.js';

const searchSchema = z.object({
  query: z.string().min(2).max(300),
  toolkit: z.string().min(1).optional(),
});

const executeSchema = z.object({
  slug: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

/**
 * A thin window onto Composio's tool router, used by the integrations screen to prove a
 * connection actually works. Tool slugs are always discovered through `search` first, never
 * assumed — a renamed tool surfaces as "nothing matched" instead of a wrong call.
 *
 * Every route names an owner and gets that owner's explorer, so a tool call here runs against
 * the caller's own connected accounts — searching, and executing, as nobody else.
 */
@Controller('api/composio')
export class ComposioController {
  public constructor(private readonly workspaces: WorkspaceFactory) {}

  @Get('toolkits')
  public async toolkits(@Owner() ownerId: string): Promise<{ toolkits: readonly ToolkitState[] }> {
    return { toolkits: await this.explorerFor(ownerId).toolkits() };
  }

  @Get('tools')
  public async tools(
    @Owner() ownerId: string,
    @Query('query') query: string,
    @Query('toolkit') toolkit: string | undefined,
  ): Promise<{ tools: readonly DiscoveredTool[] }> {
    const parsed = searchSchema.parse({ query, ...(toolkit === undefined ? {} : { toolkit }) });
    return {
      tools: await this.explorerFor(ownerId).search({
        query: parsed.query,
        ...(parsed.toolkit === undefined ? {} : { toolkits: [parsed.toolkit] }),
      }),
    };
  }

  @Post('execute')
  public async execute(@Owner() ownerId: string, @Body() body: unknown): Promise<ToolExecution> {
    const parsed = executeSchema.parse(body);
    return await this.explorerFor(ownerId).execute({ slug: parsed.slug, args: parsed.args });
  }

  private explorerFor(ownerId: string): ComposioToolExplorer {
    const { explorer } = this.workspaces.for(ownerId);
    if (explorer === undefined) {
      throw new ServiceUnavailableException(
        'COMPOSIO_API_KEY is not set, so hosted tool calls are unavailable.',
      );
    }
    return explorer;
  }
}
