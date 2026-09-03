import type { LoopDto } from '@open-loops/contracts';

/**
 * What the person narrowed the day to: some words, and the apps those loops came from. Both are
 * client-side and deliberately so — the day is one request the app already has in hand, and a
 * round trip per keystroke would make a filter slower than reading the list.
 */
export interface LoopFilter {
  /** Free text, matched across everything a person would recognise a loop by. */
  readonly query: string;
  /** Providers to keep. Empty means every provider, not none — nothing chosen is no filter. */
  readonly providers: readonly string[];
}

export const NO_FILTER: LoopFilter = { query: '', providers: [] };

export const isFiltering = (filter: LoopFilter): boolean =>
  filter.query.trim().length > 0 || filter.providers.length > 0;

/**
 * Every term has to appear somewhere in the loop, in any field and in any order: people type
 * "sam pr" meaning "the pull request thing with Sam", not a phrase to match verbatim.
 */
export const matches = (item: LoopDto, filter: LoopFilter): boolean => {
  if (filter.providers.length > 0 && !filter.providers.includes(item.provider)) return false;

  const haystack = searchable(item);
  return terms(filter.query).every((term) => haystack.includes(term));
};

export const applyFilter = (
  items: readonly LoopDto[],
  filter: LoopFilter,
): readonly LoopDto[] => (isFiltering(filter) ? items.filter((item) => matches(item, filter)) : items);

/**
 * The providers actually present in the day, with how many loops each one accounts for. Derived
 * from the loops rather than from the integrations list: an app that is connected but has
 * produced nothing today is a filter that can only empty the screen.
 */
export const providersIn = (
  items: readonly LoopDto[],
): readonly { readonly provider: string; readonly count: number }[] => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.provider, (counts.get(item.provider) ?? 0) + 1);
  return [...counts.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider));
};

/** Adds a provider to the filter, or takes it out again if it was already there. */
export const toggleProvider = (filter: LoopFilter, provider: string): LoopFilter => ({
  ...filter,
  providers: filter.providers.includes(provider)
    ? filter.providers.filter((entry) => entry !== provider)
    : [...filter.providers, provider],
});

/**
 * Everything a loop can be recognised by, lower-cased once per comparison. The criteria are in
 * here because they are what the row actually shows under the title — searching for a word you
 * can see on the screen and getting nothing back is the way a filter loses trust.
 */
const searchable = (item: LoopDto): string =>
  [
    item.title,
    item.summary,
    item.kind,
    item.provider,
    item.counterparty ?? '',
    ...item.criteria.map((criterion) => criterion.label),
  ]
    .join(' ')
    .toLowerCase();

const terms = (query: string): readonly string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
