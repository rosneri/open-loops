# The local-agent contract

In `LOCAL` mode, Open Loops has no OAuth and no API keys. It assumes something on the machine —
Claude with its connectors, an MCP host, a browser agent — already has access to your accounts.
That thing drives three endpoints and nothing else.

If `OPEN_LOOPS_AGENT_TOKEN` is set, send it as `Authorization: Bearer <token>`. Leaving it unset
disables the check, which is the right default for a single-user machine.

## 1. Push what you saw

`POST /api/agent/ingest`

```jsonc
{
  "signals": [
    {
      "provider": "SLACK",
      "externalId": "C08ABC/1730900000.001",   // stable and unique; re-posting is a no-op
      "kind": "CHAT_MESSAGE",
      "title": "can you get the rate-limit PR up today?",
      "body": "…full message text…",
      "author": { "displayName": "Dana", "handle": "dana", "isMe": false },
      "participants": [],
      "occurredAtIso": "2026-08-26T09:12:00.000Z",
      "threadRef": "C08ABC/1730900000.001",    // what makes "did I ever reply" answerable
      "url": "https://acme.slack.com/archives/C08ABC/p1730900000001",
      "channel": "eng",
      "isDirectedAtMe": true
    }
  ]
}
```

Notes that matter:

- `externalId` must be stable. The store dedupes on `(provider, externalId)`, which is what makes
  re-running a sweep harmless.
- `author.isMe` is how the extractor tells "I promised" from "they asked". Get it right.
- Nothing here interprets anything. Do **not** pre-filter to what you think is a task — send the
  feed and let extraction decide.

Response: `{ "accepted": 12, "rejected": [{ "key": "…", "reason": "duplicate within the same batch" }] }`

## 2. Read the questions

`GET /api/agent/probes`

The tick could not check Slack itself, so it left the questions here:

```jsonc
{
  "probes": [
    {
      "id": "9f2c…",
      "loopId": "…",
      "criterionId": "…",
      "describedAs": "a PR titled ~'rate limiting' exists in acme/api",
      "probe": { "kind": "PULL_REQUEST_EXISTS", "repository": "acme/api", "titleContains": "rate limit" },
      "requestedAt": "2026-08-26T10:00:00.000Z"
    }
  ]
}
```

Only one question per criterion is ever open, so this list stays short.

## 3. Answer them

`POST /api/agent/evidence`

```jsonc
{
  "answers": [
    { "id": "9f2c…", "verdict": "SATISFIED", "summary": "PR #412 opened 09:41", "url": "https://github.com/acme/api/pull/412" }
  ]
}
```

`verdict` is `SATISFIED`, `NOT_SATISFIED` or `INCONCLUSIVE`. **Use `INCONCLUSIVE` freely.** You
are answering a narrow factual question; if you could not check, say so. A wrong `SATISFIED`
closes a loop the person still owes somebody, which is the one failure this system is designed
to prevent.

Each answer is consumed exactly once, by the next tick.

## Meeting notes (Wispr Flow, Granola, anything else)

Wispr Flow's Notetaker has no hosted API we can sync — the Flow API is voice-only and gated
behind approval — but Notetaker exposes meeting history over **MCP**. So it arrives the same way
everything else does locally: the agent reads it and pushes it here.

Meeting recaps are the densest source of commitments there is, so they get their own kind:

```jsonc
{
  "signals": [
    {
      "provider": "WISPR_FLOW",
      "externalId": "wispr:meeting:2026-08-26-standup",
      "kind": "MEETING_NOTE",
      "title": "Eng standup — 26 Aug",
      "body": "## Flow Summary\n…\n## Action items\n- Neri to open the rate-limiting PR today\n- Dana to review once it's up",
      "author": { "displayName": "Wispr Flow Notetaker", "isMe": false },
      "participants": [
        { "displayName": "Neri", "handle": "neri", "isMe": true },
        { "displayName": "Dana", "handle": "dana", "isMe": false }
      ],
      "occurredAtIso": "2026-08-26T09:30:00.000Z",
      "isDirectedAtMe": true
    }
  ]
}
```

Send the **whole recap**, action items included, as one signal. The extractor is told that a
`MEETING_NOTE` is a record of something that already happened, and that only items the user took
on or is owed become loops — "Dana to review" is Dana's problem, not yours.

Use `Copy to Markdown` in Notetaker for the body; the headings it emits (`## Flow Summary`,
`## Pre-read`) are stable regardless of what the UI labels them.

## Personal cashflow (RiseUp)

[RiseUp](https://github.com/riseup-oss/mcp) exposes a read-only MCP server over a Personal Access
Token. Like Wispr Flow it has no hosted OAuth we can broker, so it arrives the same way: the agent
runs the server locally and pushes what matters here. The PAT stays in your MCP client config and
is never sent to this app.

```jsonc
{
  "mcpServers": {
    "riseup": {
      "command": "npx",
      "args": ["-y", "@riseup-oss/mcp"],
      "env": { "RISEUP_PAT": "riseup_pat_…" }
    }
  }
}
```

It offers `get_budget` (envelopes with planned amounts, by `YYYY-MM` / `current` / `previous`) and
`get_transactions` (filtered by month, date or business name).

**Push the loop, not the ledger.** Most of this data is not an open loop — a supermarket charge is
something that already happened and asks nothing of anybody. Send a signal only where there is
something the person actually owes attention to: an envelope that has gone over plan, a
subscription that renewed at a new price, a charge they do not recognise. A month of transactions
dumped in as signals will produce a month of junk loops.

```jsonc
{
  "signals": [
    {
      "provider": "RISEUP",
      "externalId": "riseup:envelope:2026-09:groceries",
      "kind": "DOCUMENT",
      "title": "Groceries is ₪420 over plan with 9 days left",
      "body": "Planned ₪2,400, spent ₪2,820 as of 2 Sep. Largest: Shufersal ₪612 on 28 Aug.",
      "author": { "displayName": "RiseUp", "isMe": false },
      "participants": [{ "displayName": "Neri", "isMe": true }],
      "occurredAtIso": "2026-09-02T06:00:00.000Z",
      "isDirectedAtMe": true
    }
  ]
}
```

There is no finance-shaped `kind` — `DOCUMENT` is the honest fit for a summary you assembled.
Nothing downstream is finance-aware, so whether this becomes a loop is up to the extractor reading
your `title` and `body`; write them as the thing to be done, not as a statistic.

## A reasonable loop for an agent

1. `GET /api/agent/probes` — answer anything outstanding.
2. Sweep the last few hours of Slack, mail, issues and PRs; `POST /api/agent/ingest`.
3. `POST /api/tick` to fold it all in and re-plan.

Hourly is plenty.
