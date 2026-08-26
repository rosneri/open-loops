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

## A reasonable loop for an agent

1. `GET /api/agent/probes` — answer anything outstanding.
2. Sweep the last few hours of Slack, mail, issues and PRs; `POST /api/agent/ingest`.
3. `POST /api/tick` to fold it all in and re-plan.

Hourly is plenty.
