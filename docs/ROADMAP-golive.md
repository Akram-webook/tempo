# Workload — Go-Live Foundation Roadmap

**Goal:** turn the sample-data prototype into a REAL, deployable product that actual
Webook staff sign into and use. Target: **foundation 70-80% ready**, then deploy.

**How we track it:** every item below is also in `data/delivery-backlog.json`, so the
**Project delivery** page shows the live % climbing as each wave ships. That page IS the
tracker — no separate spreadsheet needed. Ping happens automatically in the report when
we cross the 70-80% line.

**Where we start:** Wave G1 (Real Data Foundation). Nothing real can happen until real
people/orgs exist in the system. Auth already partly exists (Supabase password mode), so
it comes second, wired to the real directory.

---

## The waves (in build order)

### 🌊 G1 — Real Data Foundation  ← **START HERE**
Replace sample people/orgs with the real Webook Event-Ops directory, safely.
- Real people + org tree loaded from a private source (NOT committed to the repo).
- A clean data-import path (`scripts/data-load.js` already exists — point it at real source).
- Sample-data flag flips off cleanly; "Sample data" badge disappears only when real data is live.
- PII stays out of the public bundle (emails hashed, no raw names/phones in `dist/`).
**Done when:** the app renders the real org on a private/gated build, zero sample rows,
no PII in the public artifact.

### 🌊 G2 — Real Sign-in (Auth cutover)
Make the front door real: only real staff get in, mapped to their real person record.
- Supabase email+password (already coded) turned on: invite the real users.
- Sign-in maps verified email → real person → correct role/access.
- Fail-closed: unknown email can't get in; no directory-gate fallback in production.
- Password reset + change flow verified end to end.
**Done when:** a real staff member signs in with their own credentials and sees their own view.

### 🌊 G3 — Real Persistence (Backend go-live)
Real work (assignments, check-ins, evaluations) saves to the shared backend, not just localStorage.
- `WP.db` writes/reads verified against the live Supabase (people, evaluations, work).
- Role-scoped reads hold on real data (peer sees none, manager sees reports, director all).
- Graceful offline + conflict handling proven with real accounts.
- Remove/gate the manual-upload dev hole on production.
**Done when:** two real users see each other's shared work correctly and it survives a refresh.

### 🌊 G4 — Deploy & Access Control (Production cutover)
Ship it where real users hit it, safely and reversibly.
- Production deploy target chosen + wired (Pages private, or the Next.js pilot host).
- Environment separation: sample/demo build vs real build (a flag, reversible).
- Secrets only in the backend; nothing sensitive in the repo or bundle.
- Access management + admin invite flow verified on the live target.
**Done when:** the real URL is live, gated to real staff, and rolling back is one step.

### 🌊 G5 — Go-Live Hardening (Ready to hand over)
The last 20-30%: make it trustworthy enough to leave running.
- Every page's empty/error/loading/RTL/mobile state verified on real data.
- Monitoring/health signal so we know if it breaks.
- Onboarding: how a new staff member gets access; how an admin adds someone.
- Known-limits doc + a rollback runbook.
**Done when:** it can run for a week unattended and an admin can onboard a person without us.

---

## The 70-80% line
Foundation is **70-80% ready** when **G1 + G2 + G3 are done and G4 is in progress**
(real data + real sign-in + real persistence, deploying). That is the point where "we can
add it and deploy it." G5 is the polish that takes it from deployable to hand-over-ready.

## Discipline
- Ship each wave via branch → PR → `wave:` + `type:` labels → merge (feeds Project delivery).
- Never real data/secrets in the repo or public bundle (hash/ gate; backend only).
- Reversible: every cutover behind a flag so we can fall back to sample data instantly.
- Build in order — don't start a wave until the one before it is done.
