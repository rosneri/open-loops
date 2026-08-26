import type { ZodType } from 'zod';

export interface StructuredRequest<TResult> {
  /** Names the shape for providers that use it as a tool or schema name. */
  readonly name: string;
  readonly system: string;
  readonly prompt: string;
  readonly schema: ZodType<TResult>;
  readonly temperature?: number;
}

/**
 * The single seam between "what to ask" and "who answers". Both reasoning steps are written
 * against this, so running on a hosted API key or on the Claude Code already logged in on this
 * machine is a binding choice, not two copies of the prompt logic.
 */
export interface StructuredGenerator {
  readonly label: string;
  generate<TResult>(request: StructuredRequest<TResult>): Promise<TResult>;
}
