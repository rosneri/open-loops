import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export interface ModelConfig {
  readonly provider: 'anthropic' | 'openai';
  readonly model: string;
  readonly anthropicApiKey?: string;
  readonly openaiApiKey?: string;
}

/**
 * The point of routing through the Vercel AI SDK: both reasoning steps are written once
 * against `LanguageModel`, and swapping Anthropic for OpenAI is one environment variable.
 */
export const resolveModel = (config: ModelConfig): LanguageModel => {
  if (config.provider === 'openai') {
    return createOpenAI({ apiKey: require$('OPENAI_API_KEY', config.openaiApiKey) })(config.model);
  }
  return createAnthropic({ apiKey: require$('ANTHROPIC_API_KEY', config.anthropicApiKey) })(
    config.model,
  );
};

const require$ = (name: string, value: string | undefined): string => {
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the reasoning half of Open Loops.`);
  }
  return value;
};

/** Resolved on first use, so a missing API key never breaks the rest of the app. */
export type ModelProvider = () => LanguageModel;

export const lazyModel = (config: ModelConfig): ModelProvider => {
  let cached: LanguageModel | undefined;
  return () => (cached ??= resolveModel(config));
};
