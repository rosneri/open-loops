# Architecture

The shape of this system follows from one decision: **the model may propose and observe, but it
may never conclude.** Everything else is downstream of that.

## The dependency rule

```
kernel  ←  domain contexts  ←  orchestration  ←  adapters  ←  apps
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

1. `AiLoopExtractor` — signals in, candidate loops with probes out. Anything whose
   `sourceExternalId` was not in the batch it was handed is discarded by the use case, so a
   hallucinated source produces nothing.
2. `AiLoopReconciler` — sees the probes' hard verdicts *first*, the chatter second, and may only
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

## Size limits as a design tool

500 lines per file, 100 per function, 3 parameters. These are not style preferences — they are
what forces the probe mapper into a table of small builders instead of a 26-branch switch, and
what pushed the day view into four components instead of one. When a limit is genuinely wrong —
a Nest `useFactory` takes one argument per port it wires — the exception is narrow, in one file,
and carries a comment saying why.
