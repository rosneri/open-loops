import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StructuredParseError, extractJson, parseStructured } from './json-extraction.js';

const schema = z.object({ ok: z.boolean(), n: z.number() });

describe('extractJson', () => {
  it('takes clean JSON as-is', () => {
    expect(extractJson('{"ok":true}')).toBe('{"ok":true}');
  });

  it('unwraps a fenced block', () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('ignores prose a CLI adds around the answer', () => {
    expect(extractJson('Sure, here you go:\n{"ok":true}\nHope that helps!')).toBe('{"ok":true}');
  });

  it('handles a top-level array', () => {
    expect(extractJson('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it('returns nothing when there is no JSON at all', () => {
    expect(extractJson('I could not do that.')).toBeUndefined();
  });
});

describe('parseStructured', () => {
  it('validates against the schema', () => {
    expect(parseStructured({ raw: '```json\n{"ok":true,"n":7}\n```', schema })).toEqual({
      ok: true,
      n: 7,
    });
  });

  it('reports a schema mismatch as a parse error, not a crash', () => {
    expect(() => parseStructured({ raw: '{"ok":"yes"}', schema })).toThrow(StructuredParseError);
  });

  it('reports malformed JSON as a parse error', () => {
    expect(() => parseStructured({ raw: '{"ok": tru', schema })).toThrow(StructuredParseError);
  });

  it('keeps the raw response on the error for debugging', () => {
    try {
      parseStructured({ raw: 'nope', schema });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StructuredParseError);
      expect((error as StructuredParseError).raw).toBe('nope');
    }
  });
});
