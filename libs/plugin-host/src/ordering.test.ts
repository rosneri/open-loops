import { describe, expect, it } from 'vitest';
import { topologicalOrder } from './ordering.js';

const names = (items: readonly { name: string }[]): string[] => items.map((item) => item.name);

describe('topologicalOrder', () => {
  it('keeps registration order when nothing is constrained', () => {
    const sorted = topologicalOrder([{ name: 'a' }, { name: 'b' }, { name: 'c' }], {
      onMissing: 'throw',
      label: 'plugin',
    });
    expect(names(sorted)).toEqual(['a', 'b', 'c']);
  });

  it('puts a dependency before the thing that declared it', () => {
    const sorted = topologicalOrder([{ name: 'podcast', after: ['reasoning'] }, { name: 'reasoning' }], {
      onMissing: 'throw',
      label: 'plugin',
    });
    expect(names(sorted)).toEqual(['reasoning', 'podcast']);
  });

  it('refuses a cycle rather than picking an arbitrary winner', () => {
    expect(() =>
      topologicalOrder([{ name: 'a', after: ['b'] }, { name: 'b', after: ['a'] }], {
        onMissing: 'throw',
        label: 'plugin',
      }),
    ).toThrow(/Cyclic plugin dependency/);
  });

  it('refuses a duplicate name, which would silently shadow one of them', () => {
    expect(() =>
      topologicalOrder([{ name: 'a' }, { name: 'a' }], { onMissing: 'throw', label: 'plugin' }),
    ).toThrow(/Duplicate plugin 'a'/);
  });

  it('fails a missing requirement when the caller says a requirement is a promise', () => {
    expect(() =>
      topologicalOrder([{ name: 'podcast', after: ['reasoning'] }], {
        onMissing: 'throw',
        label: 'plugin',
      }),
    ).toThrow(/requires 'reasoning', which is not loaded/);
  });

  it('ignores a missing dependency where absence is a normal deployment', () => {
    // A tick step that wants to run after the podcast, on a deployment with no podcast.
    const sorted = topologicalOrder([{ name: 'digest', after: ['podcast'] }], {
      onMissing: 'ignore',
      label: 'tick step',
    });
    expect(names(sorted)).toEqual(['digest']);
  });
});
