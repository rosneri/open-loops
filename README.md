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
bun run create-user neri  # prints a generated password; there is no signup screen
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

## Accounts

Every root table carries an owner, and repositories are built for one person rather than taking
an owner on every call. That is the whole enforcement mechanism: a use case cannot read someone
else's loops because the object it was handed cannot express the question, so no query, screen or
controller below `WorkspaceFactory` had to change when the app became multi-user.

The child tables — criteria, evidence, plan blocks, the event log — deliberately have no owner
column. They are reachable only through a parent that already has one, and a second copy of the
answer could disagree with it.

Identity is per-account too, which is the part that is easy to get wrong. Composio keys connected
apps to a user id, and that id now lives on the account row rather than in `OPEN_LOOPS_USER_ID` —
otherwise connecting Slack once would connect it for everyone. Every session, broker, tool call
and probe is built from `SourceStackFactory.for(ownerId)`, so there is no object in the process
that can reach Composio without having said whose connections it wants.

The first account claims the old `OPEN_LOOPS_USER_ID` verbatim the first time it is used, so the
apps already connected under it stay connected; everyone after that gets their own identity, and
a unique index on the column is what makes "share someone else's OAuth grants" unrepresentable.
The same claim seeds that account's handles from `OPEN_LOOPS_HANDLES` once — the addresses and
usernames that make a message *to you* rather than about you. After that they are a field on the
Settings screen, per account, because one shared list attributes one person's mail to everybody.

Podcast audio is written under `podcast/<ownerId>/<day>.mp3` for the same reason: two people
recording the same day used to write the same object, and both rows then pointed at one person's
episode. The route that serves an episode from disk checks the file belongs to the caller.

## Settings, and where a schedule actually runs

Both schedules — the sweep and the podcast — live in the database, not in the environment. The
`TICK_CRON` and `PODCAST_CRON` variables seed the row on a fresh install and are ignored after
that, so changing a schedule is a save rather than a redeploy. The Settings screen validates the
expression with cron's own parser and says what it means in words before you commit to it.

Nothing schedules itself. A serverless deployment has no process that outlives a request, and
the platform's own cron is capped at one run a day on a Hobby plan — so `apps/scheduler` is a
separate always-on process that holds the clocks and calls the deployment when something is due:

```bash
OPEN_LOOPS_API_URL=https://your-deployment \
OPEN_LOOPS_AGENT_TOKEN=... \
moon run scheduler:start
```

It reads `GET /api/schedules` — the one endpoint that spans accounts, which is why it takes the
shared secret rather than a session — and keeps one cron job per account per kind of work. A
change made in Settings is picked up on the next refresh rather than on a restart, a bad
expression from one person is logged and skipped instead of stopping everyone's clock, and a run
that is still going is never started again on top of itself.

It holds no data and no database URL. Every schedule is read from the API and every run is a call
back to it, so the deployment stays the only thing that touches the database and tenancy is
enforced in exactly one place.

## The podcast of the day

The day, read aloud by two voices, on whatever schedule you set. The brief handed to the
generator is prose assembled from the same view the Today screen renders — the plan, what is
overdue, and what is done but unconfirmed — so an episode can only be as good as the day is
legible.

Generation goes through the `PodcastGenerator` port. The default adapter is
[podcastfy](https://github.com/souzatharsis/podcastfy)'s pipeline rewritten in TypeScript: the
model this deployment already uses writes a two-speaker script, and each turn is spoken by the
free Edge Read Aloud voices — the same backend podcastfy reaches for by default. MP3 frames
concatenate, so the turns are joined into one file without ffmpeg. No key, no Python, no second
runtime, and no cost per episode. Podcastfy itself could not run here: it is Python and needs
ffmpeg, and this API is bundled to a single Node file for a function.

`PODCAST_PROVIDER=elevenlabs` swaps in ElevenLabs Studio for anyone who wants its voices and has
a key.

Finished audio goes to Vercel Blob (`BLOB_READ_WRITE_TOKEN`) because a function's filesystem
does not outlive the request that wrote to it. Without a token it falls back to a directory on
disk served by the API, so a developer can hear an episode without attaching a store first. Episodes are keyed by day, so re-recording a day
replaces it. A failure is stored with its reason and shown in Settings — the reason is almost
always a missing key or a provider quota, and neither is discoverable from an empty list.

## Signing in

Every route is behind a login except three: `POST /api/auth/login`, a bare `GET /api/health`
liveness check, and the OAuth callback Composio redirects the browser to. That is enforced by a
global guard, so a new controller is protected the day it is written and has to say `@Public()`
to opt out.

Accounts are made from the command line, never from a signup page — the app has one user, and a
public registration route on a deployment anyone can reach would undo the login it sits behind:

```bash
bun run create-user <username>              # generates and prints a password
bun run create-user <username> <password>   # or set one; also rotates an existing account
```

Rotating a password ends every session that account already had. `AUTH_JWT_SECRET` signs the
session cookie and is required — at least 32 characters, and changing it logs everyone out.

The machinery is Passport and `@nestjs/jwt` — the stack Nest documents — with `passport-local`
on the login route, `passport-jwt` reading the token out of the cookie, `bcryptjs` for hashing
and `cookie-parser` for the jar. `bcryptjs` rather than `bcrypt` or `argon2` because those are
native modules, and the API is bundled into a single file for a Vercel function where a `.node`
binary would not survive the build.

The token lives in an `httpOnly`, `SameSite=Lax` cookie, so no script on the page can read it.
It is `Secure` in `HOSTED` mode and not in `LOCAL`, where the app is plain HTTP on a LAN address
and a secure cookie would never be stored at all.

Two callers have no browser and therefore no cookie. `/api/agent/*` and `/api/tick` accept a
bearer token instead — `OPEN_LOOPS_AGENT_TOKEN`, or the `CRON_SECRET` Vercel Cron sends on its
own requests. An unset token disables that check on a single-user machine in `LOCAL` mode; in
`HOSTED` mode, where anyone can reach the endpoint, the absence of a secret closes it instead.

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
