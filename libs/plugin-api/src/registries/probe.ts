import type { ProbeParams, ProbeRunner } from '@open-loops/loops';
import type { OwnerScope } from '../context.js';

/**
 * The flat shape the model proposes a probe in. It is deliberately not a discriminated union:
 * models are markedly better at filling one wide object than at picking a variant, and a dozen
 * optional siblings inside an array is enough to make structured output refuse the schema
 * outright ("Schema is too complex"). That is how this shape was found.
 */
export interface ProbeDraft {
  readonly kind: string;
  readonly describedAs: string;
  readonly provider?: string | undefined;
  /** What to look at: a repository, an issue key, a thread id, a person, an email address. */
  readonly target?: string | undefined;
  /** A second identifier when the probe needs one, e.g. the pull request inside a repository. */
  readonly ref?: string | undefined;
  /** Text the result must contain — a title fragment, a branch name, a subject line. */
  readonly contains?: string | undefined;
  /** The state the target must be in, for trackers that have more than open/closed. */
  readonly status?: string | undefined;
  /** When it was proposed. Kinds that mean "since now" read their cutoff from here. */
  readonly now: number;
}

/**
 * Everything one probe kind knows about itself: how to teach the model to propose it, how to
 * read what the model proposed, and who can go and check. These used to be three lists in three
 * libraries, and the interesting bugs all lived in the gaps between them.
 */
export interface ProbeDefinition {
  readonly kind: string;
  /** One line for the extractor's prompt, teaching the model when this kind applies. */
  readonly prompt: string;
  /**
   * Reads the model's draft into this kind's parameters, or refuses it. `undefined` means the
   * model left out something the probe genuinely needs — the caller downgrades that to a manual
   * check, because an under-specified probe is unsatisfiable and would pin the loop open.
   */
  build(draft: ProbeDraft): ProbeParams | undefined;
  /** Which app answers this kind. `undefined` is "nothing out there to look at". */
  provider?(draft: ProbeDraft): string | undefined;
  /**
   * Who answers it, for this account. `undefined` means nobody here can — the reconciler then
   * has no evidence rather than a guess, which is the right failure.
   */
  runner?(scope: OwnerScope): ProbeRunner | undefined;
}

export interface ProbeRegistry {
  register(definition: ProbeDefinition): void;
}
