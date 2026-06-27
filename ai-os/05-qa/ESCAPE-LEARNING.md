# Book 16b — AI Failure Learning System (Escapes) · MANDATORY
Grounded in Google SRE blameless postmortems, Toyota jidoka/andon + 5 Whys, and DORA (change-fail
rate, MTTR). This is supreme over "it works" — Constitution VI (survive challenge) + VIII (living).

## Core principle
Never assume an implementation is correct because it works. Never ask "why did the AI make a mistake?"
Always ask: **"why did our system allow this to reach production?"** Every production issue is an
**Escape** — proof that our review system failed to catch it before release. Blameless: we fix the
system, not the author.

## An Escape is not closed until every question below is answered with EVIDENCE
Claims are never accepted as evidence (Constitution V).

### Step 1 — Classify the Escape (one or more gaps)
- **Requirement Gap** — the requirement never asked for this check (e.g. RTL, accessibility, mobile).
  → update requirements + add a permanent checklist item.
- **Review Gap** — the right reviewer never saw it (e.g. QA approved, Security never reviewed).
  → update the review pipeline / Executive Review Board routing.
- **Knowledge Gap** — the AI lacked knowledge (e.g. a third-party API changed).
  → update the Knowledge Base + REFERENCES + implementation guidance.
- **Evidence Gap** — PASS was claimed without proof. → require objective evidence before approval.
- **Challenge Gap** — everyone agreed, nobody pushed back. → run Debate Mode + Council of Critics (Red Team).
- **Architecture Gap** — the root was design. → update architecture + design principles (ADR).
- **Human Gap** — approved without proper validation. → improve approval gates / executive review.

### Step 2 — Root Cause Analysis (answer ALL, with evidence)
1. Why wasn't this detected? 2. Which AI/role should have caught it? 3. Which department failed
(Product/UX/Architecture/Backend/Frontend/QA/Security/Operations/Documentation/Performance)?
4. Which checklist failed? 5. Which rule was missing? 6. New checklist needed? 7. Update the TAOS
Constitution? 8. New AI role needed? 9. Improve an existing role? 10. Make it a permanent automated test?

### Step 3 — Continuous learning (every Escape must leave the system stronger)
Required updates after every Escape: Requirements · Checklists · Documentation · Knowledge Base ·
AI instructions (CLAUDE.md / skill) · QA tests · Automated tests · Architecture standards (if needed).

## Maturity levels (classify every Escape — high-maturity quality orgs do this)
- **L1 Individual** — a bug in one feature.
- **L2 Process** — reveals a missing stage in the pipeline.
- **L3 Systemic** — reveals the system or the TAOS Constitution itself needs to change.
- **L4 Strategic** — reveals the product direction or a core assumption was wrong.
Each level routes its fix to the matching layer: L1 feature · L2 pipeline/checklist · L3 Constitution/OS ·
L4 Vision/strategy. A problem is never just closed — it improves product, process, constitution, and org.

## Metrics (judge by what ESCAPED, not by work completed)
Track **Escape Rate per department** = escapes ÷ tasks reviewed. Example: Architecture 0/320 = 0% ·
QA 3/520 = 0.58% · Security 1/170 = 0.59%.
Dashboard: Escapes by Department / Severity / Feature / Root-Cause / AI-Role / Sprint · Escape Trend ·
Escape Rate · Root Causes Closed · Average Time-to-Learn · Permanent Tests Added.

## Definition of success
Goal is NOT fewer reported bugs — it's a falling **Escape Rate** over time. **If the same Escape
happens twice, the learning process failed.** An Escape is officially CLOSED only when: the issue is
fixed · root cause identified · system improved · docs updated · checklist updated · automated test
added · future Escapes of this type prevented.
