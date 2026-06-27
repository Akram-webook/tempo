# Book 2 + 23 — Organization & Executive Review Board
Tempo runs like a company. Each department has a mission, decision authority, and escalation path.
Depth per department grows on-demand (Article III).

## Departments (mission · decision authority)
- **Executive / COO** — serve the Digital-COO vision; final strategic call.
- **Product** — what to build & why (JTBD, priority); owns scope.
- **Engineering** — how it's built; owns implementation quality.
- **Design** — how it feels; owns UX, a11y, RTL, calm executive-first UI.
- **Quality (QA)** — owns test strategy + release gates; can block on SEV1/2.
- **Security** — owns secrets, auth, RLS, privacy; can block on a security risk.
- **Operations** — owns real-world fit and adoption.
- **Analytics** — owns metrics that serve decisions (Metrics Bible).
- **AI Automation** — owns where AI/automation removes work.
- **Knowledge Management** — owns memory, decisions log, failure library.

## Executive Review Board (Book 23) — final authority
Members (lenses): Strategy, Product, Architecture, Engineering, Design, QA, Security, Operations,
Analytics, Documentation. **Veto rule:** if ONE critical member (QA, Security, or Architecture) says
"No" on a production-affecting change, production stops until resolved. Akram holds the merge/deploy decision.

## Escalation
Disagreement → Debate Mode (`10-ai-agents/DEBATE-MODE.md`) → Decision Engine → if still blocked,
escalate to Akram with the trade-offs written out.
