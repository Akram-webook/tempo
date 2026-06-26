# Access & Privacy Model — who sees what

How permissions work in Webook Workload, grounded in RBAC/ReBAC + least-privilege +
GDPR data-minimization. Goal: **everyone can log in and see the situation, but
sensitive individual detail (weaknesses, notes, risk signals) opens only along the
management line.** Now implemented in the app.

## The model (hybrid — best practice)
- **RBAC tiers** for the coarse role: Employee · Manager · Senior Manager · Director/HR.
- **ReBAC ("manager-of", "team-of")** for the "whose data" question — the org tree is the
  relationship graph. A manager sees *their* team because of the relationship, not a static role.
- **Row + field-level rules** to enforce: which *people* you see (rows) and which *fields* of
  their record (columns). Sensitive fields are masked/omitted, not all-or-nothing.

## Two layers (reconciles "everyone sees the situation" with privacy)
1. **Aggregate / status layer — open to all:** team & department rollups (Team Health,
   who's overloaded, who's free, headline KPI status). No sensitive individual detail. Apply a
   **k ≥ 5 minimum group size** so a small "aggregate" can't reverse-engineer one person.
2. **Individual drill-down — relationship-gated:** a person's detailed tasks, growth areas,
   notes, and risk signals open only to their **direct manager**, **themselves**, and
   **Director/HR**. Skip-level senior managers see workload but **not** sensitive detail.

## Permission matrix (implemented)
| Data | Employee | Manager (direct) | Senior (skip-level) | Director/HR |
|---|---|---|---|---|
| Own workload / load % | ✓ | ✓ | ✓ | ✓ |
| Team workload | — | ✓ team | ✓ span | Agg |
| Another team's detail | — | Agg | ✓ span | Agg |
| Daily check-ins | self | ✓ team | Agg | Agg |
| Skills | self | ✓ team | ✓ span | Agg |
| **Growth areas / weaknesses** | self | ✓ direct only | 🔒 hidden | ✓ |
| **Manager notes / suggestions** | — | ✓ own | 🔒 hidden | ✓ |
| **Retention-risk / promo signal** | — | ✓ direct only | 🔒 hidden | ✓ |
| Salary / comp | self | — | — | ✓ |

🔒 = hidden to protect candor (the #1 reason people stop giving honest feedback is fear it's
exposed). Weaknesses/negative feedback go to the **direct manager + the person + HR only** —
never skip-level or peers by default.

## How it's shown in the app (trust, not suspicion)
- **Provenance chip** on every profile: "You can see this because you're their direct manager"
  / "Director view" / "This is your own profile" — makes access legible.
- **Sensitive sections hidden** for skip-level viewers, with a clear "🔒 hidden to protect
  privacy" note (framing restriction as protection).
- **Access matrix in Settings** publishes the rules in plain language (the table above).
- **Activity/override log** records who saw/changed what (auditability).
- Try it: "View as" Akram → open Osama (full detail, he's the direct manager); "View as" Motaa
  → open Osama (skip-level → growth/notes/risk hidden); "View as" Ahmed → full (director).

## For any department (generalizable)
The model is role + relationship, not hard-coded to events ops. Any department plugs in its own
org tree; the same tiers, the same field-sensitivity, the same aggregate-vs-drilldown split apply.

## Sources
[RBAC vs ABAC — Okta](https://www.okta.com/identity-101/role-based-access-control-vs-attribute-based-access-control/) · [ReBAC / Zanzibar — OpenFGA](https://openfga.dev/docs/authorization-concepts) · [NIST RBAC model](https://csrc.nist.gov/CSRC/media/Publications/conference-paper/2000/07/26/the-nist-model-for-role-based-access-control-towards-a-unified-/documents/sandhu-ferraiolo-kuhn-00.pdf) · [Least privilege — Netwrix](https://netwrix.com/en/cybersecurity-glossary/architectural-concepts/least-privilege/) · [Field-level security & masking — Microsoft](https://learn.microsoft.com/en-us/power-platform/admin/field-level-security) · [App permission UX — NN/g](https://www.nngroup.com/videos/app-permission-requests/) · [Anonymity threshold k≥5 — Betterworks](https://support.betterworks.com/hc/en-us/articles/5001561720461-Anonymity-Threshold) · [HR confidentiality — Lanteria](https://www.lanteria.com/news/is-hr-confidential)

> Contested: whether HR can read managers' private notes, and whether managers see reports'
> comp, vary by company — decide deliberately. Skip-level seeing weaknesses for calibration is
> sometimes allowed behind an explicit calibration context; default here is hidden.
