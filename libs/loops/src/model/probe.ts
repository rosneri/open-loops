import type { Instant } from '@open-loops/kernel';

/**
 * A probe is the machine-checkable definition of "this part is done". The model proposes probes
 * when it extracts a loop; deterministic code is what actually runs them. That split is the
 * spine of the design: the model decides what would count as evidence, never whether it
 * happened.
 *
 * What a probe *kind* means is not the domain's business. There used to be a closed union here
 * and the same eleven kinds were spelled out again as a prompt, again as a parser and again as
 * a table of tool calls — four lists that could disagree, and did. So the domain keeps the
 * envelope, and each kind's own definition, registered by a plugin, keeps the meaning.
 *
 * The union bought less than it looked like it did: every runner already reached into the probe
 * by string key, because a tool call is a bag of strings at the far end no matter what shape it
 * left here in.
 */
export type ProbeParamValue = string | number | boolean;
export type ProbeParams = Readonly<Record<string, ProbeParamValue>>;

export interface Probe {
  /** Namespaced by whoever defined it. `MANUAL_CONFIRMATION` is the one the core owns. */
  readonly kind: string;
  /** The sentence shown in the UI: "a PR titled ~'rate limiting' exists in acme/api". */
  readonly describedAs: string;
  /** Which app this must be checked in. `undefined` is "nothing out there to look at". */
  readonly provider?: string | undefined;
  /** Everything else the kind needs. Opaque here; the kind's schema is what gives it meaning. */
  readonly params: ProbeParams;
}

/**
 * The one kind the core keeps. Nothing observable exists, so only the person can close it — and
 * it is also the floor every other kind falls back to when the model under-specifies a probe.
 * A plugin cannot take this away, because a deployment with no plugins must still be usable.
 */
export const MANUAL_CONFIRMATION = 'MANUAL_CONFIRMATION';

export const manualConfirmation = (describedAs: string): Probe => ({
  kind: MANUAL_CONFIRMATION,
  describedAs,
  params: {},
});

export const isObservable = (probe: Probe): boolean => probe.kind !== MANUAL_CONFIRMATION;

/** Which provider a probe must run against, if any. `undefined` means "not observable there". */
export const probeProvider = (probe: Probe): string | undefined => probe.provider;

/**
 * Typed reads of the parameter bag. A missing or wrong-typed value is `undefined` rather than a
 * throw: a probe that arrived half-specified should degrade to an inconclusive answer, not take
 * the tick down with it.
 */
export const probeText = (probe: Probe, key: string): string | undefined => {
  const value = probe.params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const probeInstant = (probe: Probe, key: string): Instant | undefined => {
  const value = probe.params[key];
  return typeof value === 'number' ? (value as Instant) : undefined;
};

/**
 * Rows written before probes were open carry their fields inline — `repository`, `titleContains`
 * — rather than under `params`. Reading them back through here is what makes this change a
 * deployment rather than a migration.
 */
export const toProbeEnvelope = (raw: unknown): Probe => {
  const record: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
  const { kind, describedAs, provider, params, ...legacy } = record;

  const bag: Record<string, ProbeParamValue> = {};
  const merge = (source: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        bag[key] = value;
      }
    }
  };
  merge(legacy);
  if (typeof params === 'object' && params !== null) merge(params as Record<string, unknown>);

  return {
    kind: typeof kind === 'string' ? kind : MANUAL_CONFIRMATION,
    describedAs: typeof describedAs === 'string' ? describedAs : 'confirm this by hand',
    ...(typeof provider === 'string' ? { provider } : {}),
    params: bag,
  };
};
