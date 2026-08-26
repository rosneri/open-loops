import { Output, generateText } from 'ai';
import type { StructuredGenerator, StructuredRequest } from './structured-generator.port.js';
import type { ModelProvider } from './model-registry.js';

/** The hosted path: a real API key, through the Vercel AI SDK's structured output. */
export class AiSdkGenerator implements StructuredGenerator {
  public readonly label: string;

  public constructor(
    private readonly deps: { model: ModelProvider; label: string },
  ) {
    this.label = deps.label;
  }

  public async generate<TResult>(request: StructuredRequest<TResult>): Promise<TResult> {
    const { output } = await generateText({
      model: this.deps.model(),
      output: Output.object({ schema: request.schema, name: request.name }),
      system: request.system,
      prompt: request.prompt,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    });
    return output;
  }
}
