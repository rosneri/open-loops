/**
 * Identity generation is injected rather than imported so every aggregate operation stays
 * reproducible under test. No context reaches for `crypto` on its own.
 */
export interface IdGenerator {
  next(): string;
}
