/** Nominal typing helper. `Brand<string, 'OpenLoopId'>` is not assignable from a bare string. */
declare const brand: unique symbol;

export type Brand<TValue, TBrand extends string> = TValue & { readonly [brand]: TBrand };
