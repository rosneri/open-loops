/**
 * "Go and look this up in one of my connected apps." Deliberately not a Composio interface: the
 * hosted broker, a local MCP host and a hand-written client are all the same question asked
 * three ways, and a probe should not care which one this deployment has.
 *
 * There is no `undefined` provider filter by accident — a query with no provider searches every
 * connected app, which is occasionally what you want and usually slower and vaguer.
 */
export interface ToolCall {
  /** Said in words, never as a slug: "list open pull requests in acme/api". */
  readonly query: string;
  readonly providers?: readonly string[] | undefined;
}

export interface ToolResult {
  readonly ok: boolean;
  /** Which tool actually ran, for the evidence summary. */
  readonly slug: string;
  readonly data: unknown;
  readonly error?: string | undefined;
}

export interface ToolBroker {
  execute(call: ToolCall): Promise<ToolResult | undefined>;
}
