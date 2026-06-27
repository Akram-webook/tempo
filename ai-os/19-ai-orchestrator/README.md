# 19 — AI Orchestrator (task entry point)
Every task starts here. The orchestrator right-sizes process to task size (see `/ai-os/README.md`).

## Flow
1. **Classify** the task: XS / S / M / L.
2. **Discovery** (`01`) — what decision does it improve? simplest valuable slice?
3. **Convene the council** (`10`) at the depth the size requires; for M/L run **Debate**
   (`10/DEBATE-MODE.md`) + **Council of Critics** (`10/COUNCIL-OF-CRITICS.md`, who try to BREAK it)
   + **Devil's Advocate** (`../18-executive-reviews/DEVILS-ADVOCATE.md`) + **Benchmark**
   (`../16-best-practices/BENCHMARK-ENGINE.md`). Ask the **world-class questions**
   (`../01-product-discovery/WORLD-CLASS-QUESTIONS.md`), pick a **thinking framework**
   (`../11-standards/THINKING-FRAMEWORKS.md`), and ground claims in `../REFERENCES.md`, not opinion.
4. **Spec** it (`12/SPEC-TEMPLATE.md`); ADR if architectural (`03`).
5. **Build** to standards (`04/11`), with tests (`05`) and security (`06`).
6. **Score** it (`14`); for M/L run the **Auditor** (`10/AUDITOR.md`) and write the
   **Executive Report** (`18`).
7. **Release** (`08`) — branch+PR, Akram merges, verify live, log the decision (`15`).
8. **Improve** — schedule the post-release review (`17`).

## Rigor by size
- XS: steps 5 + checklist (`13`).
- S: + Design (`02`) + light score.
- M: full flow.
- L: full flow + Architecture (`03`) + Risk (`12/RISK-REGISTER.md`) + Auditor.

Keep it fast: the orchestrator's job is *better decisions with less waste*, not ceremony.
