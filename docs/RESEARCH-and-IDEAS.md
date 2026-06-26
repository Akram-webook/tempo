# Webook Pass — Research, Best Practices & Ideas

A scan of 12 leading workload/capacity tools + best-practice literature, mapped to
Webook Pass and to the three people who'll use it. Every claim here is sourced (end
of doc). Read the **"Apply / Maybe / Avoid"** table at the end if you only have 5 minutes.

> **ملخص سريع:** بحثت كل أنظمة إدارة الأحمال المعروفة. الخلاصة: قراراتك المقفولة
> (الأخضر = فرصة، capacity مو productivity، soft-lock مع override، كل دور يشوف
> حسب صلاحيته) **كلها مطابقة لأفضل الممارسات في السوق** — مو اجتهاد عشوائي.
> أهم تصحيح: **لا تربط نسبة الحمل مباشرة بالترقية/البونص** — البحث يقول هذا أكبر
> خطأ. الحمل يخدم القرار *بشكل غير مباشر* (مين ياخذ شغل Tier-1، توزيع عادل،
> إنذار مبكر للاستقالة)، مو "اللي على ٩٥٪ يترقى".

---

## 1. What the research validates about your locked decisions

Your instincts line up with the best tools in the market — useful when defending to the Director:

- **"Available = opportunity, not idle"** is a real philosophical split in the industry, and it tracks the business model. Finance-first PSA tools (Kantata) frame idle negatively — "bench time," "revenue leakage." Ops/scheduling tools (Runn, Resource Guru, Smartsheet, Harvest Forecast) frame it positively — "bench = deployable," "room to grow," "take on new work with confidence." **You're deliberately in the healthy school.** Smartsheet literally colors availability *blue* ("availability to take on more"); Runn colors the free bench *green*.
- **Soft-warn, never hard-block** is universal: all 12 tools surface overload as a color (almost always red) and let the manager keep assigning. Nobody hard-blocks. Your **soft-lock + logged override** is slightly stricter than the market and is defensible as a burnout guardrail. The closest market analog is Resource Guru's "clash dialog" (waiting-list / overtime / extend) — still a choice, not a block.
- **Capacity, not productivity** is the single most important design choice for avoiding the surveillance trap (see §3). The market's healthiest tools measure *load vs available*, not hours worked.
- **Self-first, aggregate-upward access model** is textbook best practice (least-privilege / data-minimization). Show the most granular data to the *person themselves*; aggregate as you go up. Over-exposing individual data upward is exactly what produces stress, distrust, and legal risk (Amazon was fined €32M; Barclays scrapped a tracker in weeks after backlash).

## 2. One calibration to reconsider: your healthy band

Industry consensus puts the **healthy utilization sweet spot at ~80%** (commonly 70–85% productive, keeping 20–30% as buffer). Your bands currently are:

| Your band | Range | Industry view |
|---|---|---|
| Available | 0–40% | fine as "room to grow" |
| **Balanced** | **41–75%** | industry "healthy" usually reaches **~80–85%** |
| Near Capacity | 76–95% | industry would still call ~80% *healthy*, not pre-warning |
| Overloaded | 96%+ | aligned |

**Implication:** your "Balanced" ceiling (75%) is a touch *conservative* vs. the industry's ~80%. That's not wrong — a burnout-prevention tool *should* lean cautious — but be ready for the Director to ask "why is 80% already a warning when the industry says 80% is the target?" Easy answers: (a) events ops has spiky, unpredictable on-site demand so you keep more buffer, (b) you'd rather warn early. Consider widening Balanced to **41–80%** and Near to **81–95%** so you're defensible against the benchmark. (One-line change in `capacity.js` / `mock-data.js`.)

> Caveat worth knowing: the "80% sweet spot" is a ubiquitous vendor rule-of-thumb, not a controlled study. Actual measured billable utilization has been *falling* (~69% in consulting in 2024). So 80% is a target, not a law.

## 3. The surveillance trap — the evidence (your strongest defense)

The Director *will* ask "isn't this just monitoring?" The research gives you a hard, citable answer:

- **HBR (Thiel et al., 2024):** the *same* monitoring data produces opposite results depending on use. Used for **control** (reviews, evaluation) → employees do *more* counterproductive behavior (time theft, cyberloafing). Used for **feedback/planning** → trust holds and performance *improves*. **It's the use-case, not the data.**
- **APA Work in America 2023:** 56% of monitored workers feel tense/stressed (vs 40% unmonitored); monitored workers are ~2× as likely to report mental-health harm.
- **Manager↔employee perception gap:** ~68–70% of managers think monitoring helps performance; ~72% of employees say it has no impact or *hurts*. The two sides do not experience these tools the same way — design for the employee's perception, not the manager's assumption.
- **Trust dividend (Zak/HBR):** high-trust companies report 40% less burnout, 74% less stress, 50% higher productivity.

**Design rules that follow (apply these in Webook Pass):** frame as protection not policing; show employees their *own* data first; publish exactly what's tracked and who sees it; never wire it to rankings (see §5); track *assigned work outputs*, never hours/activity.

## 4. The three lenses — what each role sees, and how it feels

### Employee (the IC adding/receiving tasks) — design for trust
How it *feels* is the make-or-break. The literature is blunt: tools framed as control breed resentment; the resistance is to **purpose and opacity, not data** (90%+ of workers accept data collection *if it benefits them*; ~60% would trade work data for better development/rewards).

What makes the employee trust it vs. resent it:

| Build trust | Breeds resentment |
|---|---|
| See your *own* load first, self-manage before any manager steps in | Manager sees granular detail you can't see |
| "Green = you've earned the next opportunity" (growth framing) | "Green = you look idle" (policing framing) |
| Daily check-in *read from Slack you already write* — zero new work | A second place to re-report what you did |
| Transparent: you know your % and why (which projects) | A black-box score you can't explain |
| The system protects you ("evidence you're overloaded") | The system exposes you ("proof you're slow") |

**Idea:** give every employee a personal page that says, in their words, "You're Balanced (62%). You have room for one Tier-3 or a stretch Tier-2. You're 4 months into your role." That reframes the whole tool from surveillance → personal career dashboard.

### Manager — design for fair load-balancing
Managers need *instruments to rebalance*, not feeds to watch. Best-practice manager views:
- Utilization heatmap: who's red, who has bandwidth, in one glance (you have this).
- **Consecutive-week overload** is the real burnout signal — not a single spike. Flag people over threshold for 2+ weeks running. (Extends your burnout flag.)
- Drag-to-reassign from the same screen (your assignment drawer).
- Concentration risk: flag when one person is "Accountable" for too many high-dependency items.
- Cadence: review weekly in fast-moving ops, rebalance *before* overload becomes burnout.

### Director — design for macro + decisions
Execs want **aggregated team-level trends with gated drill-down**, not individual rows:
- Team-health trend over time (is the team getting healthier or hotter?).
- **Capacity vs demand forecast** = the data case for headcount ("demand structurally exceeds capacity → hire"). This is the exec's favorite view across every tool.
- Aggregated burnout-risk by *team*, not named person, for retention decisions.
- Drill-down exists but is purpose-bound — defaults to macro.

## 5. The promotion / bonus / raise question — read this carefully

You asked how this becomes powerful for raise/bonus/promotion decisions. The research is strong and a little counter-intuitive: **do NOT wire capacity/load directly into compensation or promotion.** That is the single biggest documented failure mode.

Why:
- **Goodhart's Law:** "when a measure becomes a target, it ceases to be a good measure." Tie pay to utilization and people optimize for *looking* loaded — busyness theater — not value.
- **It penalizes your best people:** someone who delivers the same impact in fewer hours scores *worse* on a load metric. You'd reward the slow and punish the efficient.
- **It poisons your own data:** the moment load affects pay, people stop reporting true load — and your burnout early-warning (the whole point) goes blind.
- **Promotion is about *scope*, not busyness.** Best practice (Lattice, StaffEng, Pragmatic Engineer): you promote someone who *already operates at the next level* — bigger scope, higher complexity, leading outcomes, mentoring — not someone who's merely at 95%.

**So how does it help decisions — the right way (indirect, and powerful):**
1. **Scope/complexity signal:** "Over the last 6 months, who consistently carried Tier-1 (Mega) work and delivered?" — that's a promotion-readiness signal. *Tier mix over time*, not load %.
2. **Fairness signal (DEI-positive, and the Director will love this):** audit who gets the high-visibility Tier-1 / "stretch" assignments vs. who's stuck with low-visibility "glue work." Research (The No Club, MIT Sloan) shows stretch work is unequally distributed and is ~70% of how people develop — so *equitable assignment* is a real management lever. Your Fairness (Tier-1 distribution) view becomes a promotion-equity tool.
3. **Flight-risk early-warning (directly serves your "prevent a resignation" goal):** a predictive-HR finding — employees at **18–24 months in role with no promotion or >5% pay bump hit ~40% voluntary turnover vs ~12% baseline.** Cross that with sustained high load and you have a precise "intervene now" list. *This is arguably your highest-ROI feature for the Director.*
4. **Development evidence, not a score:** if load data appears in a review at all, it's *context* next to impact/scope evidence — never a number that decides the outcome.

This also keeps faith with your own MOS separation: **Capacity = "can I load them more?" (forward-looking). Performance/Promotion = "scope, impact, growth" (evaluative).** Same backbone, different question. The research strongly backs keeping them separate.

## 6. Adding tenure & role-history (your "متى كان معنا + الرول حقه" idea — good, here's how to do it right)

Adding tenure and role history is well-supported — *as context, never as entitlement*:
- **Model capacity by level band.** Juniors, mid, seniors have different realistic output. Best practice: route **complex/Tier-1 work up, foundational work down**; putting seniors on junior work wastes money and frustrates them; putting juniors on Tier-1 alone is a failure mode. Your tier weights could *flex by level* later (a Tier-1 costs a junior more of their ceiling than a senior).
- **Ramp-up curve for new hires.** People take ~3–8 months (Gallup: up to ~12) to full productivity. A new hire's ceiling should ramp, not start at 100%. Show "4 months in role" so a manager doesn't over-load someone still ramping.
- **Tenure ≠ readiness.** Time-in-role is a *consideration, not a guarantee*. Don't let "been here longest" become a hidden promotion bias — skills/scope come first.
- **Role history = your strongest growth signal.** McKinsey: most lifetime earnings growth comes from *experience via new roles/projects* (~40%+ of earnings), and people who switch roles every 2–4 years grow skills ~25% per move. Tracking each person's assignment history surfaces development paths and who's ready for a bigger move.
- **Stalled-tenure flag** (from §5.3): 18–24 months, no progression → flight risk. Tenure data makes this computable.

**Concrete data to add per person:** `joinedDate`, `roleStartDate` (for time-in-role), `levelHistory` (role + dates), and derive `tenureMonths` / `monthsInRole`. These power the ramp-up ceiling, the flight-risk flag, and the growth/promotion view — all without touching the load engine.

## 7. Ideas ranked — Apply / Maybe / Avoid

| Idea | Verdict | Why |
|---|---|---|
| Keep "green = opportunity" framing | **Apply** | Matches the healthiest tools (Runn/Smartsheet/Harvest); core to non-surveillance positioning |
| Employee sees own data first (self-management page) | **Apply** | #1 trust-builder in the literature; converts "surveillance" → "career dashboard" |
| Consecutive-week overload signal (not just single spike) | **Apply** | The actual burnout pattern per manager best-practice |
| Flight-risk flag: tenure 18–24mo + no promo/raise + high load | **Apply** | Directly serves "prevent a resignation"; highest-ROI Director feature |
| Capacity-vs-demand forecast (headcount case) | **Apply** | Every exec tool leads with this; turns the tool into a hiring-decision aid |
| Fairness/Tier-1 distribution as a *promotion-equity* view | **Apply** | DEI-positive, backed by The No Club / MIT Sloan; Director-friendly |
| Tenure + role-history + ramp-up ceiling | **Apply** | Well-supported as *context*; powers flight-risk + growth views |
| Widen Balanced band to ~80% to match benchmark | **Maybe** | Defensible either way; decide with Director, document the reason |
| Tier weight that flexes by seniority level | **Maybe** | Realistic but adds model complexity; do after POC |
| Slack EOD structured form (vs free-text) | **Maybe** | Cleaner data, but free-text read is faster for the POC |
| 3-tier early-warning colors (green/yellow/red) | **Maybe** | monday/ClickUp do this; you already have 4 states — fine as-is |
| Tie load % to bonus/raise/promotion | **Avoid** | Goodhart's Law; penalizes efficient people; poisons your burnout data |
| Hard-block on overload | **Avoid** | No tool does this; soft-lock + override is the right level |
| Manager sees more granular individual data than the employee sees | **Avoid** | Drives distrust; violates self-first principle |
| Track hours / activity / "presence" | **Avoid** | The surveillance trap; contradicts capacity-not-productivity |

## 8. The two sentences to tell the Director

> "Webook Pass shows you in 30 seconds who's about to break and who's free for the next opportunity — built from work we already assign, read from Slack we already write. It is **not** a productivity tracker and it never decides anyone's pay: it prevents the next resignation and makes sure the right person — not just the available one — gets the growth work."

---

## Sources

**Tools & capacity models:** Float ([capacity](https://www.float.com/product/capacity-planning), [overallocation](https://www.float.com/resources/overallocation-of-resources)) · Runn ([capacity vs utilization](https://www.runn.io/blog/capacity-vs-utilization), [utilization benchmarks](https://www.runn.io/blog/utilization-rate-benchmarks), [heatmap](https://www.runn.io/blog/resource-heatmap)) · Resource Guru ([clashes/waiting list](https://help.resourceguruapp.com/en/articles/2942080-booking-clashes-the-waiting-list-overtime-and-capacity-planning), [prevent overallocation](https://resourceguruapp.com/blog/resource-management/prevent-overallocation)) · Forecast.app ([people schedule](https://support.forecast.app/hc/en-us/articles/4775562212753-Overview-of-People-Schedule)) · Kantata ([resource capacity](https://www.kantata.com/solutions/resource-capacity-planning-optimization)) · Smartsheet RM ([capacity view](https://www.smartsheet.com/content-center/product-news/resource-management/new-capacity-view-experience-resource-management)) · Asana ([workload](https://help.asana.com/s/article/portfolio-workload-and-universal-workload), [utilization](https://asana.com/resources/utilization-rate)) · monday ([workload](https://support.monday.com/hc/en-us/articles/360010166559-Resource-management-with-Workload), [workload planning](https://monday.com/blog/project-management/workload-planning/)) · ClickUp ([availability/capacity](https://help.clickup.com/hc/en-us/articles/30799838221335-Measure-availability-or-capacity-in-Workload-view)) · Tempo ([capacity planner](https://www.tempo.io/blog/tempo-planner-jira)) · Teamwork ([workload planner](https://support.teamwork.com/projects/workload/workload-planner-overview)) · Harvest Forecast ([features](https://www.getharvest.com/forecast/features))

**Surveillance / trust / wellbeing:** [HBR — Surveilling Employees Erodes Trust (Thiel et al., 2024)](https://hbr.org/2024/02/surveilling-employees-erodes-trust-and-puts-managers-in-a-bind) · [HBR — Neuroscience of Trust (Zak)](https://www.physicianleaders.org/articles/the-neuroscience-of-trust) · [Glavin et al. 2024 — Workplace Surveillance & Well-Being (Sage)](https://journals.sagepub.com/doi/10.1177/23294965241228874) · [ActivTrak — Monitoring Statistics](https://www.activtrak.com/blog/employee-monitoring-statistics/) · [Frontiers in Psychology 2025 — workload→burnout→turnover](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1699421/full)

**Performance / comp / promotion:** [SHRM — Performance Management](https://www.shrm.org/topics-tools/topics/performance-management) · [HBR — Office Housework Gets in Women's Way](https://hbr.org/2015/04/office-housework-gets-in-womens-way) · [Lattice — Promotion Nomination Template](https://lattice.com/templates/promotion-nomination-form-template) · [MIT Sloan — Assignments & Gender Equity](https://sloanreview.mit.edu/article/assignments-are-critical-tools-to-achieve-workplace-gender-equity/) · [The No Club](https://www.thenoclub.com/) · [Splunk — Goodhart's Law](https://www.splunk.com/en_us/blog/learn/goodharts-law.html) · [StaffEng — Getting the Title Where You Are](https://staffeng.com/guides/getting-the-title-where-you-are/)

**Tenure / ramp-up / people analytics:** [Gallup — Onboarding & Retention](https://www.gallup.com/workplace/235121/why-onboarding-experience-key-retention.aspx) · [McKinsey MGI — Experience drives earnings growth](https://www.mckinsey.com/mgi/media-center/if-you-want-to-grow-in-your-career) · [monday — Workload Planning by level](https://monday.com/blog/project-management/workload-planning/) · [iCIMS — Internal Mobility & Career Pathing](https://www.icims.com/blog/how-to-correctly-use-internal-mobility-to-maximize-talent-roi/) · [Insala — Predictive People Analytics (flight risk)](https://www.people360ai.com/blog/top-predictive-models-for-people-analytics) · [Quantum Workplace — 9-Box Grid](https://www.quantumworkplace.com/future-of-work/what-is-the-9-box-grid)

> Reliability flags: the "~80% sweet spot" and "12% revenue lost to ramp-up" are widely-repeated vendor rules-of-thumb, not controlled studies. The flight-risk percentages come from vendor predictive models (directionally reliable, not peer-reviewed). The strongest, least-conflicted evidence is the HBR 2024 study, APA Work in America 2023, the Glavin 2024 peer-reviewed study, and McKinsey MGI.
