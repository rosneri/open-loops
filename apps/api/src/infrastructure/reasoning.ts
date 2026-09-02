import type { Logger } from '@open-loops/kernel';
import type { StructuredGenerator } from '@open-loops/orchestration';
import type { PluginHost } from '@open-loops/plugin-host';
import { FallbackGenerator } from '@open-loops/reasoning';

/**
 * The one place that decides who does the thinking. The preferred provider — `AI_PROVIDER`, or
 * Claude Code locally and Anthropic hosted — goes first; every other provider a plugin
 * registered and this deployment can actually use goes behind it, so a usage limit degrades to
 * a bill instead of to an outage. Nothing here knows the name of any provider.
 */
export const generatorFor = (input: {
  host: PluginHost;
  preferred: string;
  /** The explicit `AI_MODEL`, handed only to the preferred provider — it is in that provider's vocabulary. */
  model: string | undefined;
  logger: Logger;
}): StructuredGenerator => {
  const registered = input.host.reasoningProviders().map((entry) => entry.definition);
  const known = registered.map((provider) => provider.id);
  if (!known.includes(input.preferred)) {
    throw new Error(
      `AI_PROVIDER is "${input.preferred}", but the installed plugins provide: ${known.join(', ')}.`,
    );
  }

  const ordered = [
    ...registered.filter((provider) => provider.id === input.preferred),
    ...registered.filter((provider) => provider.id !== input.preferred),
  ];
  const chain: StructuredGenerator[] = [];
  for (const provider of ordered) {
    const generator = provider.create({
      model: provider.id === input.preferred ? input.model : undefined,
      logger: input.logger,
    });
    if (generator !== undefined) chain.push(generator);
    else if (provider.id === input.preferred) {
      input.logger.warn('preferred reasoning provider is not usable here; falling back', {
        provider: provider.id,
      });
    }
  }

  const [first, ...rest] = chain;
  if (first === undefined) {
    throw new Error(
      'No reasoning provider is available. Install Claude Code, or set an API key for one of: ' +
        `${known.join(', ')}.`,
    );
  }
  return rest.length === 0 ? first : new FallbackGenerator({ generators: chain, logger: input.logger });
};
