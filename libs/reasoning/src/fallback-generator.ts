import type { Logger } from '@open-loops/kernel';
import type { StructuredGenerator, StructuredRequest } from './structured-generator.port.js';

export interface FallbackGeneratorDeps {
  /** Tried in order. The first that answers wins. */
  readonly generators: readonly StructuredGenerator[];
  readonly logger: Logger;
}

/**
 * Prefers the Claude Code already signed in on this machine and falls back to a keyed provider
 * when it cannot answer — hitting a usage limit, or no CLI at all on a server. Free when it can
 * be, working when it must be, and the switch is invisible to both reasoning steps.
 */
export class FallbackGenerator implements StructuredGenerator {
  public readonly label: string;

  public constructor(private readonly deps: FallbackGeneratorDeps) {
    if (deps.generators.length === 0) {
      throw new Error('A fallback generator needs at least one generator.');
    }
    this.label = deps.generators.map((generator) => generator.label).join(' → ');
  }

  public async generate<TResult>(request: StructuredRequest<TResult>): Promise<TResult> {
    const failures: string[] = [];

    for (const generator of this.deps.generators) {
      try {
        return await generator.generate(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${generator.label}: ${message}`);
        this.deps.logger.warn('generator unavailable; trying the next one', {
          generator: generator.label,
          error: message,
        });
      }
    }

    throw new Error(`Every reasoning provider failed. ${failures.join(' | ')}`);
  }
}
