# feedback-proxy - Supabase Edge Function (G3 write proxy)

Token-safe transport for feedback writes. Holds the GitHub token as a **Supabase
secret** and forwards `{op, item}` to the existing **Receive Feedback** Action
(`.github/workflows/receive-feedback.yml`). The public bundle never carries a token.

Chosen over a standalone Cloudflare Worker because the Supabase project is already
wired for this app (auth + data) - one platform, one place secrets live.

## Contract
```
POST  { "op": "create" | "update" | "discard", "item": { ... } }
-> 200 { "ok": true }            dispatch accepted; Action appends/updates + commits
-> 4xx/5xx { "ok": false, "error": "..." }
```
- `create`: `item.note` required; the Action assigns id/status/timestamps. `item.source`
  (which TOOL submitted — e.g. `workload`, `hr-portal`) is set on create and is immutable.
- `update`: `item.id` + any of `status|wave|priority|triageNote|triagedBy`. id/owner/submittedAt/note/**source** immutable.
- `discard`: `item.id`; sets status `Discarded` (idempotent).

## CORS — hard-coded allow-list (Phase 2)
The embeddable widget (`dist/widget.js`) is served from `akram-webook.github.io` but
**runs inside each tool's page**, so the browser `Origin` is that tool's host. CORS is
therefore a hard-coded `ALLOWED_ORIGINS` **Set** in `index.ts`:

```
https://akram-webook.github.io   # Workload (Tempo)
https://hr-portal.webook.com     # HR Portal
https://finance-hub.webook.com   # Finance Hub
```

Any other origin gets `403`. **Onboarding a new tool = add its exact origin to that Set
and redeploy the function.** Never a wildcard (`*.webook.com`), never a reflected Origin.

## Deploy (Akram - one time)
```bash
# from the repo root, with the Supabase CLI logged in + linked to the project
supabase functions deploy feedback-proxy --no-verify-jwt
supabase secrets set GITHUB_PAT=github_pat_xxxxxxxx   # fine-grained: Actions:write on tempo ONLY
```
Deployed URL looks like:
`https://<project-ref>.supabase.co/functions/v1/feedback-proxy`

Then set it in the app:
`WP.config.feedbackProxyEndpoint = 'https://<project-ref>.supabase.co/functions/v1/feedback-proxy'`
(in `src/js/core/config.js`), rebuild, ship. See docs/ROADMAP-golive.md (G3).

`--no-verify-jwt` is deliberate: this is a public write endpoint gated by Origin +
the Action's own validation, not by a Supabase user JWT. The token never leaves the server.

## Never
- Never commit the PAT. `supabase secrets set` only.
- Never widen CORS with a wildcard or by reflecting the caller's Origin — add each
  tool's exact origin to the `ALLOWED_ORIGINS` Set explicitly.
- Touches feedback only (via the Action). Never writes exec-status.json.
