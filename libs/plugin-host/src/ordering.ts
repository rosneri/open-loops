/**
 * Declared order, resolved once. Both plugins and tick steps say what must come before them
 * rather than relying on the order somebody happened to list them in, because "it works if you
 * register them in the right order" is a rule nobody can see and everybody eventually breaks.
 */
export interface Ordered {
  readonly name: string;
  readonly after?: readonly string[] | undefined;
}

export interface OrderOptions {
  /**
   * What an unknown dependency means. For plugins it is a configuration error — you asked for
   * something that is not installed. For a tick step it is normal: the step you wanted to run
   * after belongs to a plugin this deployment did not enable.
   */
  readonly onMissing: 'throw' | 'ignore';
  /** Used in error messages: "plugin", "tick step". */
  readonly label: string;
}

const VISITING = 1;
const DONE = 2;

export const topologicalOrder = <TItem extends Ordered>(
  items: readonly TItem[],
  options: OrderOptions,
): readonly TItem[] => {
  const byName = new Map<string, TItem>();
  for (const item of items) {
    if (byName.has(item.name)) {
      throw new Error(`Duplicate ${options.label} '${item.name}'.`);
    }
    byName.set(item.name, item);
  }

  const state = new Map<string, number>();
  const sorted: TItem[] = [];

  const visit = (item: TItem, trail: readonly string[]): void => {
    const seen = state.get(item.name);
    if (seen === DONE) return;
    if (seen === VISITING) {
      throw new Error(`Cyclic ${options.label} dependency: ${[...trail, item.name].join(' → ')}.`);
    }

    state.set(item.name, VISITING);
    for (const dependency of item.after ?? []) {
      const next = byName.get(dependency);
      if (next === undefined) {
        if (options.onMissing === 'throw') {
          throw new Error(`${options.label} '${item.name}' requires '${dependency}', which is not loaded.`);
        }
        continue;
      }
      visit(next, [...trail, item.name]);
    }
    state.set(item.name, DONE);
    sorted.push(item);
  };

  // Registration order breaks ties, so an unconstrained set comes out exactly as it went in.
  for (const item of items) visit(item, []);
  return sorted;
};
