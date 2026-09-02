import { z } from 'zod';
import { Capability, definePlugin } from '@open-loops/plugin-api';
import { AiSdkGenerator, lazyModel } from '@open-loops/reasoning';

const options = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

const present = (key: string | undefined): key is string => key !== undefined && key.length > 0;

/**
 * The paid path, in both flavours. Each offers itself only when its key is set: a provider that
 * cannot answer is `undefined` here, not an error at the first request.
 */
export default definePlugin({
  id: 'reasoning-ai-sdk',
  version: '1.0.0',
  description: 'Reasoning through a hosted API key — Anthropic or OpenAI.',
  capabilities: [Capability.ProvideReasoning],
  setup: (context) => {
    const keys = options.parse(context.env);

    context.reasoningProviders.register({
      id: 'anthropic',
      label: 'Anthropic',
      create: ({ model }) => {
        if (!present(keys.ANTHROPIC_API_KEY)) return undefined;
        const chosen = model ?? 'claude-sonnet-5';
        return new AiSdkGenerator({
          label: `anthropic/${chosen}`,
          model: lazyModel({
            provider: 'anthropic',
            model: chosen,
            anthropicApiKey: keys.ANTHROPIC_API_KEY,
          }),
        });
      },
    });

    context.reasoningProviders.register({
      id: 'openai',
      label: 'OpenAI',
      create: ({ model }) => {
        if (!present(keys.OPENAI_API_KEY)) return undefined;
        const chosen = model ?? 'gpt-5.2';
        return new AiSdkGenerator({
          label: `openai/${chosen}`,
          model: lazyModel({ provider: 'openai', model: chosen, openaiApiKey: keys.OPENAI_API_KEY }),
        });
      },
    });
  },
});
