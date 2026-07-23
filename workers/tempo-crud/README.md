# tempo-crud - feedback write proxy (Cloudflare Worker)

Holds the GitHub token as a Worker **secret** and forwards feedback writes to the
existing **Receive Feedback** Action (`.github/workflows/receive-feedback.yml`).
The public bundle never carries a token.

## Why a proxy
`feedback.js` submits via GitHub `workflow_dispatch`, which needs
`Authorization: Bearer <token>`. A token in the public bundle is harvestable, so
the widget stays "Not configured" until this proxy exists. The proxy is the
token-safe transport: browser → proxy (no token) → Action (token attached server-side).

## Contract
```
POST /feedback
{ "op": "create" | "update" | "discard", "item": { ... } }
-> 200 { "ok": true }            dispatch accepted; Action appends/updates + commits
-> 4xx/5xx { "ok": false, "error": "..." }
```
- `create`: `item.note` required; the Action assigns id/status/timestamps.
- `update`: `item.id` + any of `status|wave|priority|triageNote|triagedBy`. id/owner/submittedAt/note are immutable.
- `discard`: `item.id`; sets status `Discarded` (idempotent).

Only `https://akram-webook.github.io` may call it (else 403).

## Deploy (Akram - one time)
```bash
cd workers/tempo-crud
npx wrangler deploy
npx wrangler secret put GITHUB_PAT   # paste a fine-grained PAT: Actions:write on tempo ONLY
```
Then set the deployed URL in the app config (`WP.config.feedbackProxyEndpoint`)
and remove the old direct-dispatch token path. See docs/ROADMAP-golive.md (G3).

## Never
- Never commit the PAT. Secret only.
- Never widen CORS beyond the one origin.
- The proxy touches feedback only (via the Action). It never writes exec-status.json.
