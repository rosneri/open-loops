/**
 * Reading whatever a connected app happened to return. Every provider disagrees about where the
 * list lives and what the fields are called, and none of that disagreement is worth a type — the
 * question being asked is only ever "is the thing there".
 */
export const asArray = (payload: unknown): readonly unknown[] => {
  if (Array.isArray(payload)) return payload;
  const record = typeof payload === 'object' && payload !== null ? payload : {};
  for (const key of ['items', 'data', 'results', 'messages', 'nodes']) {
    const value = (record as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

export const textOf = (value: unknown): string => JSON.stringify(value ?? '').toLowerCase();

export const includesAll = (
  haystack: unknown,
  needles: readonly (string | undefined)[],
): boolean => {
  const text = textOf(haystack);
  return needles
    .filter((needle): needle is string => needle !== undefined && needle.length > 0)
    .every((needle) => text.includes(needle.toLowerCase()));
};
