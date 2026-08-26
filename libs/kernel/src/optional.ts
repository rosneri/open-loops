/**
 * `exactOptionalPropertyTypes` makes `{ url: undefined }` different from `{}`, and every
 * boundary in this system (Prisma rows, JSON bodies, model output) hands back `undefined` or
 * `null` for absent fields. This is the one helper that reconciles the two, so the assertion
 * lives here instead of being scattered across every mapper.
 */
export const optional = <TKey extends string, TValue>(
  key: TKey,
  value: TValue | null | undefined,
): Record<TKey, TValue> | Record<string, never> =>
  value === null || value === undefined ? {} : ({ [key]: value } as Record<TKey, TValue>);
