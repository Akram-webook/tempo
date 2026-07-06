---
name: tempo-test-playbook
description: >
  How to test Tempo the right way — which test at which layer, the pre-push
  ritual, and the anti-impersonation / dist-drift / scope-guard patterns.
  USE WHEN adding or changing any behaviour in src/**, writing a new
  test/verify-*.js suite, touching auth/access/RLS, editing build.js or the
  .github/workflows, or before opening any PR against Tempo. If you changed
  code and are about to commit, read this first.
---

# Tempo Test Playbook

Tempo is vanilla JS on `window.WP`, bundled `src/** → dist/index.html` by `build.js`, tested
by jsdom `test/verify-*.js` suites run via `npm test`. No framework, no test runner — each suite
is a plain node script that loads the sources into jsdom, asserts, and `process.exit(0|1)`.

Grounded in: **Test Pyramid** (Mike Cohn, *Succeeding with Agile*), **Google Testing Blog /
Eng Practices** (small-medium-large, "test behaviour not implementation"), **DORA** (fast reliable
deployment pipeline as a capability), and Tempo's own `docs/CI-CD.md` + `ai-os/05-qa/ESCAPE-LEARNING.md`.

## The pyramid — which test at which layer

Put each check at the **lowest, fastest layer that can catch the failure.** Pushing a check up the
pyramid (into smoke/e2e) is slower, flakier, and vaguer about the cause.

| Layer | What it covers in Tempo | Example suites | Cost |
|-------|------------------------|----------------|------|
| **Unit** (most) | Pure engines / logic — capacity, growth, fairness, readiness, eval scoring, decision-memory, i18n | `verify-growth`, `verify-fairness`, `verify-readiness`, `verify-eval` | ms, no DOM |
| **Integration** (some) | Data shape + access mapping + DB/RLS *shape* (not live RLS), persistence, slack ingest | `verify-db`, `verify-people`, `verify-persist`, `verify-slack-job`, `verify-auth-identity` | jsdom, mocked Supabase |
| **Smoke / e2e** (few) | The shipped `dist` boots, login gate renders, router lands on a valid route | `verify-dist`, `verify-smoke` | full jsdom boot of bundle |

**Do:** add a unit suite for any new engine/derivation. **Don't:** prove engine math through the
smoke test — if capacity weighting breaks, `verify-capacity`-style unit assertions should scream,
not a boot test.

### The RLS boundary — know what you CAN'T unit-test
Row-Level Security is enforced by the **live Supabase backend**, not the client. jsdom suites mock
`WP._sb`, so they verify the *client-side shape* (who the app asks for, how it maps a session to a
person) — **never** the actual DB-enforced read policy. True live-RLS ("can user A read user B's
sensitive fields") needs Akram's **2-account manual check** against real data at go-live. Always say
so in the PR; never claim a jsdom suite "proves RLS". See `docs/adr/0001-rls-access-model.md`.

## The three signature patterns

### 1. Anti-impersonation (auth identity)
The worst auth bug is a session for email X resolving to a *different* person. Lock it:
```js
// load src into jsdom (see skeleton below), force verified-link mode, mock WP._sb.
WP.config.authMode = 'verified-link';
WP._sb = { auth: { signOut: () => { return Promise.resolve({}); } } };
// email → person must be a FUNCTION: no two accounts share an email
const seen = {};
WP.data.PEOPLE.filter(p => p.email).forEach(p => {
  const k = p.email.trim().toLowerCase();
  assert(!seen[k] || seen[k] === p.id, k + ' shared by ' + seen[k] + ' & ' + p.id);
  seen[k] = p.id;
});
// every account signs in as ITSELF; everyone else / unknown / malformed → nobody
WP.state.authed = false; WP.state.viewerId = null;
WP.auth.handleSession({ user: { email: 'nobody@webook.com' } });
assert(WP.state.authed === false && WP.state.viewerId == null, 'no silent fallback to a real person');
```
Drive the **real** `WP.auth.handleSession` seam — that's the path an OAuth/link return actually takes.
See `test/verify-auth-identity.js` for the full suite.

### 2. Dist-drift gate
The committed `dist/index.html` MUST equal `node build.js` output. Hand-editing dist, or forgetting
to rebuild after a `src/**` change, is caught here.
```bash
node build.js && git diff --quiet -- dist/   # exit 0 = in sync; nonzero = drift
```
CI runs this as a hard gate (`ci.yml`). QA/CI builders **never** hand-edit dist; app builders rebuild
and commit dist with their src change.

### 3. Scope-guard
No stray files, no secret *values*. `node_modules/` and `.env` must not be tracked; no
`sb_secret_*` / JWT / PEM private-key strings in code (public `sb_publishable_*` URL+key are fine).
```bash
git ls-files | grep -E '(^|/)node_modules/|(^|/)[.]env$'   # must be empty
```

## Pre-push ritual (do this every time, in order)
```bash
git fetch origin && git rebase origin/main   # 1. onto latest main
node build.js                                # 2. rebuild dist from source
npm test                                      # 3. full suite green (add your new suite to package.json first)
npm run test:dist                             # 4. dist boots clean (verify-dist + verify-smoke)
git diff --stat origin/main                   # 5. scope-scan — only the files you meant to touch
```
Then commit on a branch + PR. **One dist PR at a time** — because `dist/index.html` is a single
generated artifact, two open PRs that both change src both regenerate dist and will conflict/serialize.
Test/CI/docs PRs (this skill, `test/**`, `.github/**`) don't touch dist, so they merge freely on green.

## Reproduce + root-cause BEFORE fixing (Escape discipline)
Every escaped bug asks *"why did our system let this through?"* not *"why did the code err"*
(`ai-os/05-qa/ESCAPE-LEARNING.md`). Workflow:
1. **Reproduce** — write a failing `verify-*` assertion at the lowest layer that shows the bug.
2. **Root-cause** — find the real seam; don't patch the symptom in the view.
3. **Fix**, then confirm the new assertion goes green and the rest stays green.
4. **Prevent** — the assertion stays in the suite forever. A bug closed without a test is not closed.

## Wiring a new suite
Add it to the `test` script in `package.json` (or `test:dist` if it needs the built bundle):
```
"test": "... && node test/verify-YOURTHING.js && ..."
```
CI runs `npm test` + the dist boot smoke; an unwired suite never runs. Confirm it's in the chain.

## jsdom loader skeleton (copy from verify-login.js / verify-auth-identity.js)
```js
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>',
  { url: 'https://akram-webook.github.io/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|gsi|accounts\.google|cdn\.jsdelivr|supabase/i;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); }
  catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }
// ... your assertions ...
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — <one-line description of the invariant you locked>');
process.exit(0);
```

## Do / Don't
- **Do** assert behaviour ("email X signs in as X") not implementation ("calls findByEmail once").
- **Do** end every suite with a single `PASS — <invariant>` line so CI logs read as a spec.
- **Do** filter benign jsdom noise (fonts, `Not implemented`, gsi, supabase CDN) — but never filter a
  real app error into the benign regex to make a test pass.
- **Don't** hand-edit `dist/index.html`. Ever. Rebuild.
- **Don't** claim RLS is tested by jsdom. State the 2-account manual check as a known limit.
- **Don't** leave a new suite out of `package.json` — an unrun test is a false sense of safety.
- **Don't** open a second src-touching PR while one is open — serialize on the single dist artifact.
