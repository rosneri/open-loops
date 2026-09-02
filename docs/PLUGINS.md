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

`scope.reasoning` is the same `StructuredGenerator` the extractor runs on — the same fallback
chain, the same bill. A plugin never brings a model of its own, so "which model" stays one
decision made in one place. `scope.ids` and `scope.clock` are there so a plugin that mints an id
or reads the time does it the way the core does, deterministically under test.

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
context.http.register({
  basePath: 'api/digest',
  controllers: [DigestController],
  providers: [{ provide: DIGEST_OPTIONS, useValue: options }],
});
```

`basePath` has to match what the controllers themselves declare. Stating it here is what lets the
host refuse two plugins that would otherwise quietly fight over the same path — it fails at boot,
naming both. `providers` are whatever the controllers inject; the contract does not know they are
Nest providers, and the host is the one place that does.

A controller reaches a person's data the same way a schedule does, through `OwnerScope`. The
host binds one `PluginScopes` per plugin that mounted routes, already closed over that plugin's
id, and `@open-loops/plugin-nest` is how a controller asks for it — along with `@Owner()`, which
is the signed-in user's id and nothing a caller can tamper with:

```ts
@Controller('api/digest')
export class DigestController {
  public constructor(@InjectPluginScopes('digest') private readonly scopes: PluginScopes) {}

  @Get('latest')
  public async latest(@Owner() ownerId: string): Promise<DigestDto> {
    const scope = this.scopes.for(ownerId);
    return await latestFor(scope);
  }
}
```

Every route is behind the session by default. Anything a machine calls on a clock goes through
`POST /api/schedules/<kind>/run`, which is the host's and takes the shared secret, so a plugin
never has to know what a bearer token is.

## Settings, and a panel to edit them

A settings fragment is a schema, its defaults and a heading:

```ts
context.settings.register({
  label: 'Digest',
  schema: z.object({ recipients: z.array(z.string().email()).default([]) }),
  defaults: { recipients: [] },
});
```

That one declaration is validation on the way in, the value `scope.settings<T>()` hands back at
run time, and the row it is stored in — the plugin's own record store, so it needs no column.
The Settings screen shows each plugin's value as an opaque object; what edits it is the plugin's
own panel, exported from a second entry that never touches Nest:

```ts
// plugins/digest/src/ui/index.tsx
export default defineWebPlugin<DigestSettings>({
  id: 'digest',
  settings: { label: 'Digest', Panel: DigestPanel },
});
```

The panel receives `value` (saved settings with unsaved edits laid over them), `onEdit` (hands a
whole new value to the draft; the screen's one Save button writes it) and `request` — the
client's authenticated fetch, so a panel that lists what the plugin recorded, or fires one of its
routes, gets the session, the 401 hand-off and the timeout for free. `apps/web/src/plugins/enabled.ts`
is where the client half is listed, mirroring the server half.

## Rules

- **A plugin may not import another plugin.** The linter enforces it. Depend on it through
  `requires` and the registries, or do not depend on it.
- **Prefer `undefined` to throwing** for "not available here". Absent is a normal state.
- **A subscriber observes.** It cannot veto an event, and one that throws is logged while the
  others still run.
- **`MANUAL_CONFIRMATION` belongs to the core.** A deployment with no plugins at all must still
  be able to track a loop and let a person close it.
- **A plugin's configuration is its own.** Environment variables it reads come from
  `context.env` and are parsed by the plugin, never added to the app's config — a feature you can
  delete by deleting a directory cannot leave its variables behind.

`plugins/podcast` is the reference: a schedule, a settings fragment, routes with a scope, the
record store for episodes, the model for the script, and a panel — every seam, used once.
