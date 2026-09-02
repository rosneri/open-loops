import type { Logger } from '@open-loops/kernel';
import type { StructuredGenerator } from '@open-loops/orchestration';

/**
 * A way of answering structured requests: the Claude Code already signed in on this machine, a
 * keyed API, a local model server. The host picks one as preferred from `AI_PROVIDER`, tries the
 * rest behind it, and hands the result out as `scope.reasoning` to everything that asked — so
 * which model the deployment thinks with is one decision, made by which plugins are installed
 * and one variable, and never by the code that asks a question.
 */
export interface ReasoningProviderDefinition {
  /** What `AI_PROVIDER` names: `claude-code`, `anthropic`, `openai`. */
  readonly id: string;
  readonly label: string;
  /**
   * Build the generator, or `undefined` when this deployment cannot use it — no key, no binary.
   * `model` is the explicit `AI_MODEL` override when this provider is the preferred one and
   * `undefined` otherwise, because a CLI alias like `sonnet` means nothing to a hosted API.
   */
  create(input: {
    readonly model: string | undefined;
    readonly logger: Logger;
  }): StructuredGenerator | undefined;
}

export interface ReasoningRegistry {
  register(definition: ReasoningProviderDefinition): void;
}
