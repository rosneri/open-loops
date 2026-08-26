import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { Logger } from '@open-loops/kernel';
import { z } from 'zod';
import type { ZodType } from 'zod';
import type { StructuredGenerator, StructuredRequest } from './structured-generator.port.js';
import { StructuredParseError, parseStructured } from './json-extraction.js';

export interface ClaudeCodeOptions {
  readonly logger: Logger;
  /** `sonnet`, `opus`, or a full model id. Omitted means whatever the CLI defaults to. */
  readonly model?: string;
  readonly binary?: string;
  readonly timeoutMs?: number;
}

interface CliEnvelope {
  readonly is_error?: boolean;
  readonly result?: string;
  readonly total_cost_usd?: number;
  readonly terminal_reason?: string;
}

/** Raised when the CLI is present but cannot answer right now — no login, or out of quota. */
export class ClaudeCodeUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ClaudeCodeUnavailableError';
  }
}

const UNAVAILABLE = [/usage limit/i, /not logged in/i, /rate limit/i, /please run \/login/i];

const DEFAULT_TIMEOUT_MS = 240_000;

/**
 * Tools are off because this is a pure transformation: text in, JSON out. Leaving them on
 * would let a reasoning step read the filesystem of whatever directory it happened to run in.
 */
const DISALLOWED_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'NotebookEdit',
];

const JSON_ONLY = [
  'Respond with a single JSON value and nothing else.',
  'No prose, no explanation, no markdown fence.',
].join(' ');

/**
 * The AI SDK hands the model a JSON Schema behind the scenes. The CLI has no such channel, so
 * the schema goes in the prompt — without it the model invents its own field names, which is
 * exactly what happened the first time this ran.
 */
const describeSchema = (schema: ZodType<unknown>): string =>
  JSON.stringify(z.toJSONSchema(schema, { io: 'output' }));

/**
 * Uses the Claude Code already logged in on this machine instead of an API key. That is the
 * point of local mode: the user has a subscription and a session, and asking them to mint a
 * separate key to run software on their own laptop is friction with nothing behind it.
 *
 * The CLI is driven headlessly — prompt on stdin, `--output-format json` back — so nothing
 * about it is interactive, and the prompt can be arbitrarily long without hitting argv limits.
 */
export class ClaudeCodeGenerator implements StructuredGenerator {
  public readonly label = 'claude-code';

  public constructor(private readonly options: ClaudeCodeOptions) {}

  public async generate<TResult>(request: StructuredRequest<TResult>): Promise<TResult> {
    const first = await this.invoke(this.buildPrompt({ request }));
    try {
      return parseStructured({ raw: first, schema: request.schema });
    } catch (error) {
      if (!(error instanceof StructuredParseError)) throw error;
      this.options.logger.warn('claude-code returned unusable JSON; retrying once', {
        name: request.name,
        reason: error.message,
      });
      // The correction carries the validator's own complaint, which is far more useful to the
      // model than a generic "try again".
      const second = await this.invoke(this.buildPrompt({ request, correction: error.message }));
      return parseStructured({ raw: second, schema: request.schema });
    }
  }

  private buildPrompt<TResult>(input: {
    request: StructuredRequest<TResult>;
    correction?: string;
  }): string {
    const { request, correction } = input;
    return [
      request.system,
      '',
      JSON_ONLY,
      `The JSON must validate against this JSON Schema:\n${describeSchema(request.schema)}`,
      correction === undefined
        ? ''
        : `Your previous answer was rejected: ${correction}\nFix exactly that and output only the JSON.`,
      '',
      request.prompt,
    ]
      .filter((part) => part.length > 0)
      .join('\n');
  }

  private args(): readonly string[] {
    return [
      '--print',
      '--output-format',
      'json',
      '--max-turns',
      '1',
      '--disable-slash-commands',
      ...(this.options.model === undefined ? [] : ['--model', this.options.model]),
      '--disallowed-tools',
      ...DISALLOWED_TOOLS,
    ];
  }

  private async invoke(prompt: string): Promise<string> {
    const envelope = this.parseEnvelope(await this.spawn(prompt));

    if (envelope.is_error === true || typeof envelope.result !== 'string') {
      const reason = envelope.result ?? envelope.terminal_reason ?? 'unknown error';
      // "usage limit reached" is a fact about the account, not a defect in the request. It has
      // to reach the caller intact so a fallback provider can take over instead of retrying.
      if (UNAVAILABLE.some((pattern) => pattern.test(reason))) {
        throw new ClaudeCodeUnavailableError(`claude-code is unavailable: ${reason}`);
      }
      throw new Error(`claude-code failed: ${reason}`);
    }

    this.options.logger.debug('claude-code answered', { costUsd: envelope.total_cost_usd ?? 0 });
    return envelope.result;
  }

  private parseEnvelope(raw: string): CliEnvelope {
    try {
      return JSON.parse(raw) as CliEnvelope;
    } catch {
      throw new Error(`claude-code returned no JSON envelope: ${raw.slice(0, 300)}`);
    }
  }

  /**
   * Runs in a temp directory so the reasoning step never picks up project context from
   * whatever happens to be the working directory of the API process.
   */
  private spawn(prompt: string): Promise<string> {
    const binary = this.options.binary ?? 'claude';
    return new Promise<string>((resolve, reject) => {
      const child = spawn(binary, [...this.args()], {
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`claude-code timed out after ${String(this.timeout())}ms`));
      }, this.timeout());

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Could not run "${binary}". Install Claude Code or set AI_PROVIDER=anthropic. (${error.message})`,
          ),
        );
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        // A non-zero exit still writes the JSON envelope, and that envelope holds the actual
        // reason — "usage limit reached", "not logged in". Discarding it for the exit code
        // turns a diagnosable problem into `exited with 1:` and an empty stderr.
        if (stdout.trim().length > 0) resolve(stdout);
        else reject(new Error(`claude-code exited with ${String(code)}: ${stderr.slice(0, 500)}`));
      });

      child.stdin.end(prompt);
    });
  }

  private timeout(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }
}
