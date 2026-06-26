# Tempo — Developer Handoff & Working Guide

A complete brief so a developer can pick up **Tempo** in VS Code, and so you and I (Claude)
can keep adding to it from a shared source of truth. Read the first section for the
"here vs VS Code" decision; the rest is the technical handoff.

---

## 0. Which is better — keep working "here" (Cowork/Claude) or move to VS Code?

**Short answer: use both, with GitHub as the single source of truth — but for a developer-led build, VS Code + Git is the better home.** Here's the honest comparison.

| | Here (Cowork / me driving) | VS Code (developer + Git, optionally with Claude Code) |
|---|---|---|
| Setup | None — I already have the code | Clone repo once, install Node |
| Speed for small changes | Fastest ("change X" → I edit + deploy) | Fast, but a human is in the loop |
| Real version control | Commits happen, but no branches/PRs/review | Branches, pull requests, code review, easy rollback |
| Parallel work | One stream (me) | Multiple devs at once |
| Preview before deploy | I test headlessly; no live local preview | Instant local preview + debugger |
| Deploy | Manual file upload (works, but fiddly) | Automatic on every push (GitHub Actions — included below) |
| Scaling to a real product | Limited (prototype-grade) | Designed for it (backend, CI, tests in pipeline) |
| Best for | Quick iteration, you + me, no dev needed | A dev owning the build; bigger features; a real backend |

**Recommendation:**
- The code already lives on GitHub (`akram-webook/tempo`). Keep that as the **one source of truth**.
- Let the **developer work in VS Code with Git** (branches + PRs + the auto-deploy workflow in §7). That's the professional setup and unblocks parallel work and review.
- Keep **me in the loop the same way** — you share the repo link or paste a file, say "add X / fix Y," and I edit the real files and (if you want) push. I can also run inside their VS Code via Claude Code, so "go there and add it" works literally.
- For tiny tweaks where no dev is needed, "here" is still the fastest path.

Net: **VS Code is better as the project's home once a developer is on it; this chat stays the fastest way to delegate changes.** They don't compete — the repo connects them.

---

## 1. What Tempo is

An internal **Workforce-Intelligence / Operations** web app for Webook Event Operations:
org/workload map, capacity & team-health, performance evaluations (manager + self + 360),
daily tasks, role-based dashboards, and a Super-Admin/permissions layer. Arabic + English (RTL/LTR),
light/dark.

- **Live app:** https://akram-webook.github.io/tempo/
- **Repo:** https://github.com/akram-webook/tempo  (branch `main`)
- **Hosting:** GitHub Pages (serves `index.html` at the repo root)

## 2. Tech stack & philosophy

- **Vanilla HTML/CSS/JS. No framework, no build step required to run.** Everything hangs off a
  single global namespace, `window.WP`. You can open `index.html` directly and it works.
- Source is split into many small files under `src/` for editing; a tiny bundler (`build.js`)
  inlines them into one self-contained `dist/index.html` for deployment.
- Why this way: zero toolchain, trivial hosting, easy for one person to reason about. The tradeoff
  is no module system and no live multi-user backend (see §10).

## 3. Architecture (the mental model)

**Load order matters** (defined by the `<script>` tags in `index.html`): `data → core → ui → app`.

- **State + render loop** (`src/js/core/state.js`): `WP.state` is the single source of UI truth.
  Views never mutate the DOM ad hoc — they call `WP.setState(patch)`, which saves session +
  work to `localStorage` and calls `WP.render()`. `WP.render()` (in `app.js`) renders the shell
  (top bar, nav) and dispatches to the current route's view, which paints into `<div id="view">`.
- **Routing** is just `WP.state.route` (`'dashboard' | 'map' | 'profile' | 'evaluation' | …`).
- **Viewer / identity:** `WP.viewer()` returns the signed-in person; Super Admin can "View-as"
  anyone. Access checks live in `src/js/core/access.js` (`canManage`, `hasAccess`, `isSuperAdmin`).
- **Persistence:** `core/persist.js` saves the user's *work* (evaluations, roles, check-ins,
  granted access, activity log) to `localStorage` key `tempo_data`; `state.js` saves the *session*
  (who/where/theme/lang) to `tempo_session`.
- **i18n/RTL:** `core/i18n.js` holds every string as `{ en, ar }`; `WP.i18n.t('key')` resolves it;
  `WP.applyDocAttrs()` sets `lang`/`dir`/`data-theme` on `<html>`.

## 4. File-by-file map

```
index.html                 Shell + the ordered <script> tags (the load manifest)
build.js                   Bundler: inlines src CSS/JS + base64 SVGs → dist/index.html
dist/index.html            BUILT, deployable artifact (do NOT hand-edit — it is generated)
src/css/tokens.css         WBK design tokens (brand #ff2c79, surfaces, radius, type)
src/css/app.css            All component styles (~1085 lines)
src/assets/*.svg           WBK logos (pink/white/black), inlined at build time
src/js/data/
  mock-data.js             PEOPLE + teams + the email directory (EMAILS) + super-admin flag
  evaluation.js            Evaluation criteria, cycles, scoring model
  growth-data.js           Career/growth sample data
  engage-data.js           Engagement / check-in sample data
src/js/core/
  config.js                Sign-in config: supabaseUrl, supabaseAnonKey, googleClientId
  i18n.js                  EN/AR strings + RTL helpers
  state.js                 WP.state, WP.setState, WP.viewer, session persistence
  access.js                Roles & permissions: canManage / hasAccess / isSuperAdmin
  capacity.js              Capacity / team-health math (load %, burnout flags)
  growth.js                Growth/career logic
  persist.js               Saves & restores the user's WORK to localStorage
src/js/ui/
  components.js, icons.js  Shared render helpers + inline SVG icon set
  login.js                 Sign-in: verified link (Supabase) / Google / directory gate
  dashboard.js             Role dashboards + KPIs
  workloadMap.js           Org/workload map, unified Find, period nav (~661 lines, the big one)
  profile.js               Person profile + projects + pressure breakdown
  assignmentDrawer.js      Assign/move work drawer
  evaluation.js, upward.js, evaluations.js   Manager eval, upward 360, evaluations hub
  me.js                    "My" self-assessment view
  settings.js, permissions.js   Settings + Super-Admin access management
  dailyTasks.js, dailyPrompt.js  Daily tasks + the Slack daily-prompt
  wbkLibrary.js            In-app WBK component/style reference
  app.js                   Boot: hydrate → init verified session → render; shell + routing
test/                      jsdom verification suites (see §8)
ACCESS-SETUP.md            How sign-in works + how to change/upgrade it
README.md                  Short project readme
```

## 5. Authentication (how sign-in works now)

Verified mode is **live**. Strongest configured method wins (logic in `src/js/ui/login.js`):

1. **Verified link (active):** Supabase emails a one-time sign-in **link** to the entered
   `@webook.com` address; opening it on the same device signs the user in. The email must also
   match a registered person in `mock-data.js`'s `EMAILS` directory. `akram@webook.com` = Super Admin.
2. **Google** — set `googleClientId` instead, for Google-verified sign-in.
3. **Directory gate** — fallback when nothing is configured (demo only; not a real lock).

**Supabase project (already wired, values are public-safe):**
- URL: `https://ftkbjsxdrxtjdzcojnve.supabase.co`
- Publishable key: `sb_publishable_…` (in `src/js/core/config.js`)
- Dashboard already set: **Auth → URL Configuration →** Site URL `https://akram-webook.github.io/tempo/`,
  Redirect allowlist `https://akram-webook.github.io/tempo/**`.
- The returning link is consumed on boot by `WP.auth.initSession()` (called in `app.js`), which
  maps the verified session email → Tempo person → signs in (or denies).

**To get a typed 6-digit code instead of a link:** connect a custom SMTP sender in Supabase
(Auth → Emails → SMTP) and edit the "Magic link or OTP" template to include `{{ .Token }}`. The
code-entry UI is already written in git history; tell me and I'll switch it back on.

> Security note kept honest: the publishable/anon key is *meant* to be public. Never put the
> Supabase `service_role` key (or any secret) into the front-end or the repo.

## 6. Build process

```bash
node build.js
```
Reads `index.html`, inlines every `src/css/*.css` into `<style>`, every `src/js/**` into `<script>`
(preserving load order), and base64-inlines the SVG logos, producing a single
`dist/index.html` with **zero external file dependencies**. It prints a size + a check that
nothing was left un-inlined.

**Golden rule: edit files in `src/`, never `dist/index.html`.** `dist` is generated.

## 7. Deploy

**Today (manual):** `node build.js`, then upload `dist/index.html` to the repo root via
GitHub's web UI (Add file → Upload) and commit to `main`. GitHub Pages redeploys in ~1 minute.

**Recommended (automatic): GitHub Actions.** Add `.github/workflows/deploy.yml` so every push to
`main` builds and publishes automatically — no more manual uploads:

```yaml
name: Build & deploy to Pages
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node build.js
      - run: mkdir -p _site && cp dist/index.html _site/index.html
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deploy.outputs.page_url }}" }
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
```
Then in repo **Settings → Pages → Build and deployment → Source = GitHub Actions**. After that,
the dev (or I) just push to `main` and it ships itself.

## 8. Testing

Headless jsdom suites under `test/` load the real `index.html` script manifest and assert behavior
(zero console errors, routes render, login/persist/eval/tree work). Run any of them with Node:

```bash
node test/verify-all.js      # all routes render + profile/assignment flows
node test/verify-login.js    # verified sign-in link + directory + super admin
node test/verify-persist.js  # work persists across reload
node test/verify-eval.js     # evaluation banner + finder
node test/verify-tree.js     # workload map
node test/verify-dist.js     # smoke-test the BUILT dist/index.html
```
There's no `package.json` yet. A good first dev task: add one with
`"scripts": { "build": "node build.js", "test": "node test/verify-all.js && node test/verify-login.js && …" }`.

## 9. Local dev in VS Code (quick start)

```bash
git clone https://github.com/akram-webook/tempo.git
cd tempo
# open in VS Code:  code .
# preview: just open index.html in a browser, or run a static server:
npx serve .            # then visit the printed localhost URL
# after editing src/**, rebuild the single-file bundle:
node build.js
# run checks:
node test/verify-all.js
```
For the magic-link sign-in to work on `localhost`, add your local URL (e.g. `http://localhost:3000/**`)
to the Supabase Auth → URL Configuration redirect allowlist. Recommended VS Code extensions:
Live Server (instant preview), ESLint, Prettier.

## 10. Known limitations & roadmap

- **No real backend yet.** Data is sample data in `src/js/data/*` and the user's work is saved only
  in *their* browser (`localStorage`). Multi-user shared records, server-enforced roles, and a real
  audit trail need a backend. The same Supabase project can provide this (Postgres + Row-Level
  Security) without changing the UI — a clean next milestone.
- **Single self-contained file.** Great for hosting, but a dev may want to formalize a module
  build (Vite) once it grows. Not required.
- **Sign-in = link, not a typed code** (see §5) until SMTP is added.
- **Sample-data badges** are shown on KPI tiles for honesty — wire to live data when the backend lands.

## 11. How to collaborate with me (Claude) going forward

- **Share anything:** paste a repo link, a file, a screenshot, or a Figma link and say what you want.
- **"Go add it":** tell me the change ("add a Reports tab", "fix the eval scoring", "wire the
  backend"). I edit the real `src/` files, run the jsdom tests, rebuild `dist`, and can deploy.
- **Inside VS Code:** I can run there via Claude Code, so I work directly in the dev's checkout,
  open PRs, and respond to review comments.
- **Source of truth = the GitHub repo.** As long as changes land there, you, the dev, and I all
  stay in sync.

---

*Generated as a working handoff. The authoritative, always-current details live in the repo and in
`ACCESS-SETUP.md`.*
