import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FallbackGenerator } from './fallback-generator.js';
import type { StructuredGenerator } from './structured-generator.port.js';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const request = { name: 'x', system: 's', prompt: 'p', schema: z.object({ n: z.number() }) };

const generator = (label: string, behaviour: 'ok' | 'fail'): StructuredGenerator => ({
  label,
  generate: vi.fn(async () => {
    if (behaviour === 'fail') throw new Error(`${label} is out of quota`);
    return await Promise.resolve({ n: 1 });
  }),
});

describe('FallbackGenerator', () => {
  it('uses the first generator and never touches the second', async () => {
    const second = generator('api', 'ok');
    const result = await new FallbackGenerator({
      generators: [generator('claude-code', 'ok'), second],
      logger,
    }).generate(request);

    expect(result).toEqual({ n: 1 });
    expect(second.generate).not.toHaveBeenCalled();
  });

  it('falls through when the preferred generator hits its limit', async () => {
    const result = await new FallbackGenerator({
      generators: [generator('claude-code', 'fail'), generator('api', 'ok')],
      logger,
    }).generate(request);

    expect(result).toEqual({ n: 1 });
  });

  it('reports every failure when nothing works, so the cause is not hidden', async () => {
    const chain = new FallbackGenerator({
      generators: [generator('claude-code', 'fail'), generator('api', 'fail')],
      logger,
    });

    await expect(chain.generate(request)).rejects.toThrow(/claude-code is out of quota.*api is out of quota/s);
  });

  it('refuses to be constructed with nothing to call', () => {
    expect(() => new FallbackGenerator({ generators: [], logger })).toThrow(/at least one/i);
  });

  it('labels itself with the whole chain', () => {
    expect(
      new FallbackGenerator({ generators: [generator('a', 'ok'), generator('b', 'ok')], logger })
        .label,
    ).toBe('a → b');
  });
});
