import { Body, Controller, Get, Inject, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type {
  ComposioToolExplorer,
  DiscoveredTool,
  ToolExecution,
  ToolkitState,
} from '@open-loops/connectors-composio';
import { Tokens } from '../../tokens.js';

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
 */
@Controller('api/composio')
export class ComposioController {
  public constructor(
    @Inject(Tokens.ToolExplorer) private readonly explorer: ComposioToolExplorer | undefined,
  ) {}

  @Get('toolkits')
  public async toolkits(): Promise<{ toolkits: readonly ToolkitState[] }> {
    return { toolkits: await this.require$().toolkits() };
  }

  @Get('tools')
  public async tools(
    @Query('query') query: string,
    @Query('toolkit') toolkit: string | undefined,
  ): Promise<{ tools: readonly DiscoveredTool[] }> {
    const parsed = searchSchema.parse({ query, ...(toolkit === undefined ? {} : { toolkit }) });
    return {
      tools: await this.require$().search({
        query: parsed.query,
        ...(parsed.toolkit === undefined ? {} : { toolkits: [parsed.toolkit] }),
      }),
    };
  }

  @Post('execute')
  public async execute(@Body() body: unknown): Promise<ToolExecution> {
    const parsed = executeSchema.parse(body);
    return await this.require$().execute({ slug: parsed.slug, args: parsed.args });
  }

  private require$(): ComposioToolExplorer {
    if (this.explorer === undefined) {
      throw new ServiceUnavailableException(
        'COMPOSIO_API_KEY is not set, so hosted tool calls are unavailable.',
      );
    }
    return this.explorer;
  }
}
