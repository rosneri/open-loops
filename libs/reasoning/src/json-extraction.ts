import type { ZodType } from 'zod';

/**
 * A CLI answers in prose even when told not to. This pulls the one JSON value out of whatever
 * came back — fenced, prefixed with "Here you go:", or clean — without ever calling `eval`.
 */
export const extractJson = (raw: string): string | undefined => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced?.[1] ?? raw).trim();
  if (candidate.length === 0) return undefined;

  const start = candidate.search(/[[{]/);
  if (start === -1) return undefined;

  const opener = candidate[start];
  const closer = opener === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(closer);
  if (end <= start) return undefined;

  return candidate.slice(start, end + 1);
};

export class StructuredParseError extends Error {
  public constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'StructuredParseError';
  }
};

export const parseStructured = <TResult>(input: {
  raw: string;
  schema: ZodType<TResult>;
}): TResult => {
  const json = extractJson(input.raw);
  if (json === undefined) {
    throw new StructuredParseError('The model returned no JSON value.', input.raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StructuredParseError('The model returned malformed JSON.', input.raw);
  }

  const result = input.schema.safeParse(parsed);
  if (!result.success) {
    throw new StructuredParseError(
      `The model's JSON did not match the schema: ${result.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
      input.raw,
    );
  }
  return result.data;
};
