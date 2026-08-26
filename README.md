# Open Loops

Everything you started and have not closed — pulled from the apps you already use, verified
every hour, and laid out as one honest day.

Open Loops watches your work feed for the four things that quietly pile up:

- **tasks** assigned to you
- **requests** other people made of you
- **commitments** you made out loud ("I'll get the PR up today")
- **work in flight** that nobody has closed

It then does the part a to-do list never does: it goes and *checks*. If you told your manager
you'd open a PR, the hourly tick looks for the PR. If the PR exists but you never replied in the
thread, the loop is **done, not told** — a state this whole product is built around. If nothing
happened, the loop slides down today's plan and the slip is counted.

---

## Running it

```bash
proto use                 # installs node, bun and moon at the pinned versions
bun install
cp .env.example .env      # DATABASE_URL, and COMPOSIO_API_KEY if you want hosted sources
bun run db:up             # Postgres in Docker on :5439
bun run db:generate
bun run db:migrate        # or db:push against a throwaway database
moon run api:dev web:dev  # API on :4455, client on http://localhost:4444
```

Locally the reasoning runs on the Claude Code you are already signed into, so there is no AI key
to set. Everything else is optional until you connect a source.

Two `.env` files, deliberately: the root one configures the running app, and
`libs/persistence/.env` holds whatever database the Prisma CLI should migrate — Docker while you
develop, the hosted one when you deploy. Both are gitignored.

The client is bound to `0.0.0.0`, so `http://neriyas-mac-mini:4444` works from any device on
the network, not just this machine.

`bun run tick` runs one heartbeat by hand instead of waiting for the hour.

## The two halves

The system is split down the middle, and the split is enforced by the architecture rather than
by discipline:

**Getting the data** is dumb on purpose. Adapters fetch and normalise; they are forbidden to
interpret. There are two, chosen by `OPEN_LOOPS_MODE`:

| Mode | How data arrives | What it may write |
| --- | --- | --- |
| `HOSTED` | Composio brokers OAuth for every provider and runs the tools | append only |
| `LOCAL` | An AI client that already holds your sessions pushes to `/api/agent/ingest` | create, update, delete |

That capability difference is a domain rule (`libs/integrations/src/model/capability.ts`), not a
convention — a hosted connector physically cannot correct a record.

Locally the reasoning runs on the **Claude Code you are already signed into** — no API key, no
extra bill. Set `ANTHROPIC_API_KEY` as well and it becomes a fallback: when the CLI hits a usage
limit or is missing (as on a server), the keyed provider takes over and the tick keeps running.

**Deciding what it means** is where the AI lives, in exactly two steps:

1. **Extraction** turns raw signals into candidate loops, each with *completion criteria* — the
   observable things that would exist in the world if the loop were closed.
2. **Reconciliation** looks at hard probe results plus recent chatter and reports, per criterion,
   satisfied / not satisfied / inconclusive.

The model never sets a status. Status is a pure function of evidence
(`libs/loops/src/model/completion-policy.ts`), so a confident hallucination cannot close a loop
that is still open.

## Connecting an app

Composio owns the OAuth applications, which is the entire reason there is no list of redirect
URIs to register in Slack, GitHub, Google, Linear and the rest. Connecting is one click on the
Integrations screen, and the token never touches this repository.

Tool slugs are **discovered at runtime** through Composio's tool search, never hard-coded. Ask
for "list my GitHub notifications and issues assigned to me" and the resolver finds the tool; if
Composio renames it tomorrow, the search still resolves and nothing here changes.

The **Try a real call** panel on that screen runs the same path the hourly sync uses and prints
the Composio log id, so "it seemed to work" is always checkable.

## The day

The planner is a pure function of (what is open, what your calendar blocks, what time it is). It
packs work into your window, schedules around meetings, and puts a two-minute "tell them it's
done" above a half-finished feature — because that one unblocks a person.

Nothing about the plan is stored except what you touched by hand: a pinned block and a drag
order. Everything else is recomputed on every tick, which is why "I didn't do it, push it down"
needs no migration logic at all.

## Layout

```
libs/
  kernel/               shared kernel — ids, time, results, provider names
  loops/                bounded context: obligations, evidence, completion
  planning/             bounded context: the one-day plan, ordering, slippage
  integrations/         bounded context: connections and what each may write
  signals/              bounded context: the normalised feed
  orchestration/        the context map — the hourly tick, the read models
  reasoning/            adapter: the two AI steps, via the Vercel AI SDK
  persistence/          adapter: Prisma repositories
  connectors-composio/  adapter: hosted data + probes
  connectors-local/     adapter: local push + the probe queue
  contracts/            wire DTOs every client reads
apps/
  api/                  NestJS host — controllers only translate HTTP
  web/                  React client
tools/
  lint/                 the linter and its own TypeScript (see below)
```

Every rule lives in `libs/`. `apps/` are clients, and a second one — a CLI, a mobile app, an MCP
server — is a new entry in `.moon/workspace.yml` and nothing else.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the reasoning, and
[docs/AGENT.md](docs/AGENT.md) for the local-agent contract.

## Toolchain

Versions are pinned in `.prototools` and installed by [proto](https://moonrepo.dev/proto);
[moon](https://moonrepo.dev) runs and caches every task.

| | |
| --- | --- |
| Runtime / package manager | Bun 1.3 |
| Compiler | TypeScript 7.0 |
| Backend | NestJS 11 |
| Frontend | React 19, Vite 8, Tailwind 4 |
| Database | Postgres 16 via Prisma 7 |
| AI | Claude Code CLI locally, Vercel AI SDK 7 hosted |
| Tests | Vitest 4 |

One wrinkle worth knowing: `typescript-eslint` does not support the TypeScript 7 API yet, so the
linter keeps its own TypeScript 6 in `tools/lint/node_modules` while everything else compiles
with 7. `moon run :lint` handles it; you should never notice.

## Checks

```bash
moon run :typecheck   # every project, strictest TypeScript settings
moon run :test        # Vitest
moon run :lint        # architecture and size rules
```

The lint rules are load-bearing: a dependency pointing the wrong way through the onion, a file
over 500 lines, a function over 100, more than three parameters, or a `Date` inside a domain
library all fail the build.
