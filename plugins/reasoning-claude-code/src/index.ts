import { z } from 'zod';
import { Capability, definePlugin } from '@open-loops/plugin-api';
import { ClaudeCodeGenerator } from '@open-loops/reasoning';

const options = z.object({
  CLAUDE_CODE_BIN: z.string().default('claude'),
  CLAUDE_CODE_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(900_000).default(240_000),
});

/** A CLI alias, not an API id: the CLI resolves it to whatever it currently means. */
const DEFAULT_MODEL = 'sonnet';

/**
 * The free path. It always offers itself — whether the CLI is installed and signed in is only
 * knowable by asking it, and the fallback chain the host builds is what handles "no".
 */
export default definePlugin({
  id: 'reasoning-claude-code',
  version: '1.0.0',
  description: 'Reasoning through the Claude Code CLI on this machine.',
  capabilities: [Capability.ProvideReasoning],
  setup: (context) => {
    const parsed = options.parse(context.env);
    context.reasoningProviders.register({
      id: 'claude-code',
      label: 'Claude Code',
      create: ({ model, logger }) =>
        new ClaudeCodeGenerator({
          logger,
          model: model ?? DEFAULT_MODEL,
          binary: parsed.CLAUDE_CODE_BIN,
          timeoutMs: parsed.CLAUDE_CODE_TIMEOUT_MS,
        }),
    });
  },
});
