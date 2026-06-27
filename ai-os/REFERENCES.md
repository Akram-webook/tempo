# TAOS References — ground everything in official sources (not blogs, not model opinion)
Article IV: evidence over opinion. When a standard exists, cite the authoritative source and read the
live doc — do not invent practice. Agents should fetch the current version when a decision depends on detail.

## Companies to learn from (what to copy — strength, not fame)
| Company | Copy specifically | Authoritative source |
|--------|-------------------|----------------------|
| Linear | Product quality, simplicity, the "Method" (how they think) | linear.app/method |
| Stripe | API design, docs, naming, versioning | docs.stripe.com |
| Atlassian | Product/team process, health monitor, retrospectives | atlassian.com/team-playbook |
| GitHub | Engineering workflow (PRs, reviews) | github.blog/engineering |
| Google | Code review, design docs, testing | google.github.io/eng-practices |
| Google (SRE) | Incident mgmt, error budgets, reliability | sre.google/books |
| Amazon | Working Backwards (PR/FAQ), 6-pagers | "Working Backwards" (Bryar & Carr) |
| Microsoft | Security gates | microsoft.com/securityengineering/sdl |
| Shopify / Uber | Product speed / scalability | engineering blogs |
| Figma / Airbnb / Apple | Product design / design language / product philosophy | their design/eng blogs |
| Notion / Slack | Information architecture / collaboration | product docs |

## Standards to adopt (the real backbone)
- **Code & design review, testing, docs:** Google Engineering Practices — google.github.io/eng-practices
- **Reliability / incidents / error budgets:** Google SRE — sre.google/books
- **Security gates:** Microsoft SDL — microsoft.com/en-us/securityengineering/sdl ; **OWASP Top 10** (owasp.org/www-project-top-ten) + **OWASP ASVS**
- **Accessibility:** **WCAG 2.2** — w3.org/TR/WCAG22
- **UX research:** Nielsen Norman Group — nngroup.com
- **Engineering performance:** **DORA metrics** — dora.dev (deploy frequency, lead time, change-fail rate, MTTR)
- **Org design:** Team Topologies — teamtopologies.com
- **Architecture:** C4 model (c4model.com) + Martin Fowler (martinfowler.com)
- **Tech choices:** Thoughtworks Technology Radar — thoughtworks.com/radar
- **Product process:** Atlassian Team Playbook ; Amazon Working Backwards

Map: QA(05)→Google Eng Practices+DORA · Security(06)→SDL+OWASP · Design(02)→WCAG+NN/g ·
Architecture(03)→C4+Fowler · Release(08)→Google SRE · Org(00)→Team Topologies · Product(01)→Working Backwards+Atlassian.
