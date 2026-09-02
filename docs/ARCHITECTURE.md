# Architecture

The shape of this system follows from one decision: **the model may propose and observe, but it
may never conclude.** Everything else is downstream of that.

## The dependency rule

```
kernel  ←  domain contexts  ←  orchestration  ←  plugin-api  ←  adapters  ←  plugins  ←  apps
```

Arrows point inward only, and `eslint-plugin-boundaries` fails the build if one turns around.
The four domain libraries (`loops`, `planning`, `integrations`, `signals`) depend on nothing but
`kernel` — no framework, no I/O, and no clock. A lint rule forbids `Date`, `fetch`, `Math.random`
and `node:*` inside them, so a domain function is a function of its arguments and nothing else.
That is what makes the interesting rules testable in microseconds without a database.

## Why four contexts and not one model

Each library owns a language:

- **loops** knows about obligations, evidence and completion. It does not know what a "block" is.
- **planning** knows about durations, busy time and slippage. It does not know what a "loop" is —
  it plans `WorkRef`s, an opaque string, described by four booleans.
- **integrations** knows about connections and what each channel is permitted to write.
- **signals** knows about the normalised feed and nothing about what a signal means.

The translation between loops and planning is an explicit anticorruption layer in
`RebalanceDayUseCase.toCandidate`. It costs about fifteen lines and buys the fact that a change
to `LoopKind` cannot ripple into the scheduler. `planning` could schedule anything with a
duration and a deadline; that independence is the test that the boundary is real.

## Completion is two axes, not one

The state everybody else's to-do app gets wrong:

```
work:            NOT_STARTED → IN_PROGRESS → DONE
acknowledgement: NOT_REQUIRED | PENDING | SENT
```

Cross them and `DONE_UNCONFIRMED` falls out — the deliverable exists, the person waiting was
never told. That is the single most common way a loop stays open in real life, and it is why
criteria carry a `role`: shipping the PR satisfies the `DELIVERABLE`, replying in the thread
satisfies the `ACKNOWLEDGEMENT`, and the two fail independently.

`assessCompletion` is pure, total and about eighty lines. It is the only place status is decided.

## Evidence is append-only

A probe answers `SATISFIED`, `NOT_SATISFIED` or `INCONCLUSIVE`, and every answer is kept.
`latestConclusiveByCriterion` deliberately skips inconclusive results, so a rate-limited Slack
call cannot un-close a loop that was closed an hour ago. A later negative *does* supersede an
earlier positive, because a reverted PR is real news.

## Where the AI is, precisely

Two steps, both structured-output calls through the Vercel AI SDK:

1. `ModelLoopExtractor` — signals in, candidate loops with probes out. Anything whose
   `sourceExternalId` was not in the batch it was handed is discarded by the use case, so a
   hallucinated source produces nothing. It is only allowed to propose probe kinds this
   deployment actually installed, because the prompt it is given and the schema it is held to
   are both generated from the same registry that holds the runners.
2. `ModelLoopReconciler` — sees the probes' hard verdicts *first*, the chatter second, and may only
   speak in per-criterion verdicts. It is instructed to prefer `INCONCLUSIVE`, because guessing
   `SATISFIED` closes a loop that is still open — the worst thing this system can do.

Both ports are declared in `orchestration`; the AI library implements them. Swapping in a
different model, or a hand-written heuristic, touches one provider registration.

## The tick

`RunTickUseCase` is four steps: sync, extract, reconcile, re-plan. Running it hourly is what
turns a static list into something that keeps itself honest, and running it is idempotent — the
signal store dedupes on `(provider, externalId)`, so overlapping windows are a no-op.

## Local mode inverts the data flow

Locally there are no API keys for Slack or GitHub, because the AI client on the machine already
holds those sessions. So:

- signals arrive by **push** to `/api/agent/ingest` rather than by pull;
- probes are **queued**, not called — the tick writes the question, the agent answers it out of
  band, and the next tick consumes the answer exactly once.

That asynchrony is honest about what is actually happening, and it means the local path uses the
same domain code as the hosted one, differing only in which adapter is bound.

## What the persistence layer is allowed to do

Repositories map rows to aggregates and back. The one subtlety: criteria are replaced wholesale
on save (they are the model's revisable opinion of "done"), while evidence rows are only ever
appended. Losing an observation would silently reopen a closed loop.

## Everything at the edge is a plugin

The core decides; the edges are replaceable. A plugin declares an id, what it requires and which
capabilities it wants, and gets a setup context carrying only the ports it asked for. Registering
something it did not declare fails the boot, not the first request that needed it.

The rule the whole thing is arranged around is the one the model already lives under: **a plugin
may propose and observe, and may never conclude.** It is enforced by what it is handed rather
than by review — `read:loops` grants `findById`, `findBySourceKey` and `list`, and there is no
`save` on the object at all. `assessCompletion`, the two-axis status model, append-only evidence
and tenancy-by-construction are not extension points and are not meant to become any.

Probe kinds were the first thing to move out, because they were the clearest case of the same
list existing four times: a union member in `loops`, a line in the extractor's prompt, a branch
in a parser and a case in a table of tool calls. Those four could disagree, and did. A
`ProbeDefinition` states all four once, and only the last of them touches the world.

The domain kept the envelope — kind, description, provider, a parameter bag — and gave up the
union. It bought less than it looked like it did: every runner already reached into a probe by
string key, because a tool call is a bag of strings at the far end whatever shape it left in.
Rows written before the change are read back through `toProbeEnvelope`, which is what made this
a deployment rather than a migration.

The heartbeat, the HTTP surface and the clock take contributions the same way. `RunTickUseCase`
still runs its own four steps — sync, extract, reconcile, re-plan *are* the product, and a plugin
that could remove one could quietly stop the app being honest — and then runs whatever steps were
registered, each isolated so that a plugin failing cannot discard work the tick already
committed. Controllers are mounted from the registry at boot, which is why plugins load before
the container is built rather than as a provider inside it. And a schedule is a registered kind
rather than a column named after something the app happens to do, so the Settings screen and the
external scheduler both enumerate instead of branching.

`plugins/` holds them, one directory apiece, and `eslint-plugin-boundaries` forbids a plugin from
importing another plugin's source. That restriction is the whole value: a feature you can delete
by deleting a directory is a feature you can also reason about on its own.

## Size limits as a design tool

500 lines per file, 100 per function, 3 parameters. These are not style preferences — they are
what forces the probe mapper into a table of small builders instead of a 26-branch switch, and
what pushed the day view into four components instead of one. When a limit is genuinely wrong —
a Nest `useFactory` takes one argument per port it wires — the exception is narrow, in one file,
and carries a comment saying why.
