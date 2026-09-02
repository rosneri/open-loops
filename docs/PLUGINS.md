# Writing a plugin

A plugin is a directory under `plugins/` with one default export. Nothing discovers it: add it to
`apps/api/src/plugins/enabled.ts` and a typo becomes a compile error instead of a feature that
silently did not load.

```ts
import { Capability, definePlugin } from '@open-loops/plugin-api';

export default definePlugin({
  id: 'code-review',
  version: '1.0.0',
  description: 'Pull requests and reviews.',
  capabilities: [Capability.RunProbes, Capability.Tools],
  setup: (context) => {
    context.probes.register(pullRequestExists);
  },
});
```

## What `setup` may do

`setup` runs once, at boot, after everything in `requires` has run. It registers and does nothing
else — there is no account at boot, so there is nothing to do anything *to*.

| Registry | Capability | Contributes |
| --- | --- | --- |
| `context.sources` | `write:signals` | a place work arrives from |
| `context.probes` | `run:probes` | a machine-checkable definition of "done" |
| `context.tick` | `tick` | a named step of the heartbeat |
| `context.schedules` | `schedule` | work on a cron the user owns |
| `context.http` | `http` | routes |
| `context.settings` | `settings` | a slice of the Settings screen |
| `context.events` | `events` | a subscriber to loop events |

Registering something the manifest did not declare throws at boot. That is deliberate: a missing
capability should be a startup failure, not a surprise on the day the feature is first used.

## What a plugin gets at runtime

Anything that touches a person's data is handed an `OwnerScope`, built per owner and per plugin:

```ts
runner: (scope) =>
  scope.tools === undefined
    ? undefined
    : new ToolProbeRunner({ tools: scope.tools, question, logger: scope.logger }),
```

`scope.loops` reads and cannot write. `scope.signals` appends and cannot edit. `scope.storage` is
namespaced to this plugin and this owner by construction, so there is no query that could reach
another plugin's rows or another account's. `scope.tools` is `undefined` where the deployment has
no broker — in local mode there are no keys at all, and a probe that cannot be asked is queued
for the local agent instead. Returning `undefined` from a factory is a normal answer.

Reading a port the manifest did not ask for throws a `CapabilityError` naming the plugin and the
capability. Ports you did declare are typed as present, because you should not have to prove the
same thing twice at every call site.

## Defining a probe kind

Four things, stated once:

```ts
const pullRequestExists: ProbeDefinition = {
  kind: 'PULL_REQUEST_EXISTS',
  prompt: 'a pull request exists. target is the repository, contains is a title fragment.',
  provider: (draft) => draft.provider ?? 'GITHUB',
  build: (draft) =>
    draft.target === undefined
      ? undefined
      : { repository: draft.target, createdAfter: draft.now },
  runner: (scope) => /* … */,
};
```

`prompt` is one line of the extractor's system prompt. `build` reads the model's flat draft and
returns this kind's parameters, or `undefined` when the model left out something the probe
genuinely needs — an under-specified probe is unsatisfiable and would pin the loop open, so the
catalog downgrades it to `MANUAL_CONFIRMATION` instead. `runner` goes and looks.

The model proposes; only `runner` concludes anything about the world, and only ever as a verdict
on one narrow factual question.

## Adding a kind of scheduled work

```ts
context.schedules.register({
  kind: 'digest',
  label: 'Digest',
  description: 'Sends the day as an email.',
  defaultCron: '0 18 * * *',
  enabledByDefault: false,
  available: (scope) => scope.tools !== undefined,
  run: async (scope) => { /* … */ },
});
```

That is the whole change. The Settings screen renders a cron field for it, the external scheduler
starts a job for it, and neither of them was edited — both enumerate the registered kinds and
know the name of none of them. `available` is how a schedule says it could not succeed on this
deployment; an unavailable kind is shown, explained and left switched off rather than failing
every night.

`defaultCron` seeds the row on a fresh account and is ignored afterwards. The database holds the
truth, because changing a schedule should be a save rather than a redeploy.

## Adding a step to the heartbeat

```ts
context.tick.register({
  name: 'digest',
  after: ['reconcile'],
  run: async (scope) => ({ sent: await send(scope) }),
});
```

Registered steps run after the product's own four — sync, extract, reconcile, re-plan — and never
instead of them. Each is isolated: a step that throws is recorded as a failure in the tick report
and the work earlier steps committed survives. Whatever counters it returns appear under
`steps[name]` in the report, so adding one does not mean adding a field every client parses.

## Adding routes

```ts
context.http.register({ basePath: 'api/digest', controllers: [DigestController] });
```

`basePath` has to match what the controllers themselves declare. Stating it here is what lets the
host refuse two plugins that would otherwise quietly fight over the same path — it fails at boot,
naming both.

## Rules

- **A plugin may not import another plugin.** The linter enforces it. Depend on it through
  `requires` and the registries, or do not depend on it.
- **Prefer `undefined` to throwing** for "not available here". Absent is a normal state.
- **A subscriber observes.** It cannot veto an event, and one that throws is logged while the
  others still run.
- **`MANUAL_CONFIRMATION` belongs to the core.** A deployment with no plugins at all must still
  be able to track a loop and let a person close it.
