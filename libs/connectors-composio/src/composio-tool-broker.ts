import type { ToolBroker, ToolCall, ToolResult } from '@open-loops/plugin-api';
import type { SourceCatalog } from '@open-loops/plugin-host';
import type { ComposioToolExplorer } from './composio-tool-explorer.js';

/**
 * Composio, said in the plugin contract's words. The probe kinds used to reach a Composio type
 * directly, which meant every one of them knew how this deployment happens to be authenticated;
 * they ask for "list open pull requests in acme/api" now and this is the only thing that knows
 * what a toolkit slug is.
 */
export class ComposioToolBroker implements ToolBroker {
  public constructor(
    private readonly explorer: ComposioToolExplorer,
    private readonly sources: SourceCatalog,
  ) {}

  public async execute(call: ToolCall): Promise<ToolResult | undefined> {
    // A provider Composio has no toolkit for is dropped from the filter rather than failing the
    // call: an unfiltered search is vaguer, but it is still an answer.
    const toolkits = (call.providers ?? [])
      .map((provider) => this.sources.toolkitFor(provider))
      .filter((slug): slug is string => slug !== undefined);

    const execution = await this.explorer.searchAndExecute({
      query: call.query,
      ...(toolkits.length === 0 ? {} : { toolkits }),
    });
    if (execution === undefined) return undefined;

    return {
      ok: execution.ok,
      slug: execution.slug,
      data: execution.data,
      ...(execution.error === undefined ? {} : { error: execution.error }),
    };
  }
}
