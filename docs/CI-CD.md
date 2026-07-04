# Tempo CI/CD & autonomous maintenance

Three workflows make the pipeline self-running. Humans stay on risky merges + credentials.

## Workflows
- **ci.yml** (required gate) - on every PR: `npm ci` -> `node build.js` -> dist-drift gate (committed dist must equal the rebuild) -> `npm test` -> scope guard (no node_modules/.env/secrets). This is the automated finish-gate.
- **claude.yml** - automated PR review keyed to our finish-gate + ethics + craft; also responds to `@claude`. Review only; never merges.
- **maintenance.yml** - nightly (02:00) + manual. In-repo Claude agent audits and opens <=3 small `auto-fix` PRs for SAFE issues only; never touches data/auth/migration/CI/deps; never merges. Fixes flow through ci.yml + review.

## One-time setup (repo owner)
1. Install the Claude GitHub App: run `claude` then `/install-github-app` (scaffolds app + secret).
2. Secrets (Settings -> Secrets and variables -> Actions):
   - `ANTHROPIC_API_KEY` - Anthropic key.
   - `STEWARD_PAT` - fine-grained PAT, tempo repo only, Contents + Pull requests = Read/write, NO admin/workflows; 90-day expiry.
3. Branch protection on `main` (Settings -> Branches): require status check `ci` + 1 review; block direct pushes; do not allow bypass.
4. Enable auto-merge (Settings -> General). Start with "require approval"; graduate low-risk lanes to auto over time.

## Guardrails (do not remove)
- No AI auto-merge to main. CI + human approve.
- Real personal data ONLY in Supabase, never the repo/bundle.
- `src/js/data/**`, `supabase/*.sql`, auth/RLS, `.github/**`, deps -> human review required; the maintenance agent must not touch these.
