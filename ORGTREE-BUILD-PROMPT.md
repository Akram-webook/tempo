# Org Tree — shareable build prompt & playbook

Paste everything under **"PROMPT"** into Claude Code (or any capable coding agent) to
reproduce the Organisation Tree page. The short **"How we worked"** section above it is
for the team — it's the discipline that made the result good, not just the spec.

---

## How we worked (the method — read this first)

1. **Build to a closed spec, in one self-contained file.** One `.html`, no build step,
   no external JS/CSS except the Figtree webfont. Dark theme only. Every value
   (colours, radii, fonts) comes from a fixed token block — nothing improvised.
2. **One array is the source of truth.** All counts, the squad dropdown, city filters,
   stats and the whole tree derive from a single `PEOPLE` array. Swapping the roster
   requires no other edit. Never hard-code a number the data can produce.
3. **Verify LIVE at the exact target size — don't eyeball it.** Open it at **1600×1000**
   and *measure*: `document.documentElement.scrollHeight − window.innerHeight` must be
   `0` (the "no scroll" rule is a number, not a vibe). Check the console shows **zero
   errors**. Screenshot it.
4. **Run the acceptance checklist as the definition of done.** If a check fails, fix and
   re-measure. We trimmed ~75px of dead space (page/tree/spine padding, then slightly
   tighter cards) to get from 45px overflow to 0 — measured each time.
5. **Keep the chrome out of the way.** Filters and Display are **floating popovers**
   (absolutely positioned), so opening them never pushes the tree. One dropdown, not a
   row of chips. No legends, no redundant tiles — the only non-obvious rule goes in one
   grey line under the title.
6. **Colour carries exactly one meaning each.** Amber = freelance, and nothing else.
   Squad colour on a card = this person leads a team, and nothing else. Everything else
   is greyscale. Absence of a mark is information (no amber = full-time).
7. **Privacy is a first-class toggle.** A "Display" menu can hide names/location/contract
   so the org *shape* can be shared without identities (names → role, avatar → neutral dot).

---

## PROMPT

> Build a single self-contained **Organisation Tree** page for an Event-Operations
> department: **one HTML file**, no build step, no external JS/CSS except the Figtree
> webfont, **dark theme only**. It renders a company org chart with one search box, one
> squad dropdown, a floating **Filters** popover, and a floating **Display** popover.
>
> **Hard requirement:** at **1600×1000** the whole department is visible with **no
> vertical scroll** and **zero console errors**. Verify by measuring
> `scrollHeight − innerHeight === 0`, not by eye.
>
> ### Design tokens (use verbatim — do not substitute)
> ```
> --bg-brand:#ff2c79; --surface-base:#09090b; --surface-l1:#18181b; --surface-l2:#27272a;
> --content-primary:#e4e4e7; --content-secondary:#a1a1aa;
> --border-tertiary:#ffffff1a; --border-strong:#ffffff2e;
> --radius-m:8px; --radius-s:4px; --radius-pill:999px;
> body: Figtree 400 16/24, tabular-nums, background --surface-base.
> button{font-family:inherit;color:inherit}  :focus-visible{outline:2px solid --bg-brand}
> @media (prefers-reduced-motion:reduce){*{transition:none!important}}
> ```
> Squad colours (used ONLY for squad header text/border, lead-card tint, lead avatar,
> LEAD chip, dropdown dots): Automation & Execution `#8b5cf6` · Sports `#2563eb` ·
> Entertainment `#ff2c79` · On Ground `#f97316` · Cashless `#22e3b0`.
> **Two semantic colours only:** amber `#f59e0b`/text `#fbbf24` = **freelance** (nothing
> else); **squad colour on a card = a lead** (nothing else). Everything else greyscale.
>
> ### Data model — ONE array, the only thing to replace
> `PEOPLE = [{ id, name, role, squad, unit(|null), country, city, nationality,
> contract('Full-time'|'Freelance'), level('Exec'|'Director'|'Sr. Manager'|'Manager'|
> 'Sr. Specialist'|'Specialist'|'Coordinator'), manager(id|null), status('active'|
> 'incoming'|'open'), lead(bool), start, you?(bool) }]` plus `SQUADS=[{name,color}]` and
> `COUNTRY_FLAG`. `country` = where they WORK (not nationality; nationality shows in the
> drawer only). `status:'open'` = a TBC vacancy (name `TBC`).
> Helpers: `byId, squadOf, initials, reportsOf, chain`, and
> `bySeniority = level rank → lead → open-last → name`
> (`Exec<Director<Sr. Manager<Manager<Sr. Specialist<Specialist<Coordinator`).
> **Counting rule (consistent everywhere):** "people/headcount" EXCLUDES `status:'open'`;
> "positions" INCLUDES them. Stat strip uses people; dropdown/headers use positions.
> Seed ~29 rows: 2 leadership + 5 squads, 3 `open`, 1 `incoming`, 6 freelancers, and 4
> sub-teams (one per squad via `unit`).
>
> ### Layout, top to bottom
> - **Header:** ⚠ Sample-data badge · `Organisation Tree` (Gellix/Figtree 800) · one grey
>   subline ("Event Operations · click a squad to open it on its own · indented = reports
>   to the card above"). Right-aligned **stat strip**, 5 items divided by hairlines:
>   `N People`, a **CSS map-pin** (built in CSS, not a 📍 emoji) `N Saudi Arabia`, pin
>   `N UAE`, `N Freelance` (amber), `N Open roles` (pink). The pins are **buttons** that
>   filter by country and show a pressed ring.
> - **Sticky bar** (`backdrop-filter:blur(64px)`): a 250px search pill (filters name+role+
>   squad+unit+city), the **squad dropdown** (`● All squads  29 ▾`, menu lists each squad
>   with an amber `n FL` pill when it has freelancers + its position count), then a
>   **Display** button and a **Filters** button pushed right. **Filters and Display open as
>   floating popovers (absolutely positioned) — they must NOT push the tree down.**
>   - Filters popover: compact vertical stack — Country (Both/🇸🇦 n/🇦🇪 n), City (re-scoped
>     to the chosen country), Contract (Both/Full-time/Freelance), Position (All/levels).
>     Active segment = brand fill. Show a pink count badge on the button.
>   - Display popover ("Show on cards"): toggle switches for **Names**, **Location**,
>     **Contract tag**. Hiding Names anonymises every card (name → role, avatar → neutral
>     dot, drop the YOU tag; drawer hides name + nationality too). Badge = # hidden.
>   - A `Showing X of Y positions · Reset` line, **hidden by default**, shown only while a
>     filter or a squad is active.
> - **Squad info line** (only when a squad is open): a single row —
>   `Squad · led by <lead> · N people [n freelance] · City counts · teams inside: … [✕ All squads]`,
>   `border-left:3px squad colour`. No positions breakdown (the tree shows every title).
>
> ### The tree
> - Two **leadership cards** stacked and **centred at width 390px** (not full-width),
>   joined by a 2px stem, then a **horizontal bus** to each squad column. The bus is a CSS
>   **grid** with the SAME `grid-template-columns` + `gap` as the columns, so drops land on
>   exact column centres at any width (don't fake with %).
> - **Overview:** 5 columns, `gap:12px`, compact cards, role with the "Event Operations "
>   prefix stripped. **Isolated (one squad open):** other 4 hidden, single column
>   `max-width:980px` centred, bigger cards, full role text.
> - **Recursive nesting (required):** each squad's root = the person reporting outside the
>   squad; recurse via `reportsOf`. Anyone with reports shows them nested at every depth.
>   Child order inside a branch: (1) reports with no sub-team by `bySeniority`, then (2)
>   each sub-team as a labelled group `▸ UNIT`. A child opens a new label only when
>   `child.unit !== parent.unit`.
> - **Person card, 3 lines:** avatar · name (+status tags: YOU pink, INCOMING amber, OPEN
>   dashed) · role · badge row = **location chip** (CSS pin + flag + bold city — and if the
>   city is Riyadh, render it as **"Riyadh Office"**), amber **FREELANCE** chip
>   (freelancers only — full-timers get no chip), squad-coloured **LEAD · n** (leads only).
>   Freelancer = amber avatar ring + faint amber wash + the word FREELANCE. Lead =
>   `inset 3px squad colour` bar + tinted bg + white name + squad-coloured avatar. Open
>   role = dashed avatar with `?`. Never `FT`/`FL` abbreviations on a card.
> - **Filtering dims, never deletes:** non-matches get `opacity:.24;filter:saturate(.2)`;
>   squad headers show `matched/total` while filtering.
> - **Card click → right drawer** (slides in, closes on scrim/Esc): squad, sub-team,
>   position, working-in city+country (Riyadh → "Riyadh Office"), contract, **nationality
>   (only here)**, status, start, reports-to, full reporting line as breadcrumbs, and a
>   clickable list of direct reports.
>
> ### Do NOT add
> A colour legend; a per-column "n staff · n freelance" bar; a `FULL-TIME` chip; a
> `Showing 29 of 29` line at rest; `SQUADS`/`STAFF` stat tiles; a row of squad chips;
> coloured avatars for non-leads.
>
> ### Acceptance checklist (this is done-ness)
> - [ ] 1600×1000 → all positions visible, **no vertical scroll** (measured 0), zero console errors.
> - [ ] Every name renders in full (no ellipsis) in either density.
> - [ ] Reports nest under their manager at every depth; groups ordered Sr.Manager→…→Coordinator.
> - [ ] The bus stays aligned to all columns at 1280 / 1600 / 1920 wide.
> - [ ] Opening a squad hides the other four, widens cards, shows the one-line info bar.
> - [ ] Country pins filter + show a pressed state; Filters & Display are floating (don't shift layout).
> - [ ] Only amber on screen = freelance; only squad colour on a card = a lead.
> - [ ] Riyadh locations read "Riyadh Office"; Display can hide names/location/contract.
> - [ ] Replacing `PEOPLE` needs no other edit — all counts/dropdown/cities/stats derive from it.

---

## How to verify (paste after the build)

Open at 1600×1000 and run in the console:
```js
({ overflow: document.documentElement.scrollHeight - window.innerHeight,   // must be 0
   cards: document.querySelectorAll('.card[data-open]').length,            // == positions
   ellipsis: [...document.querySelectorAll('.card .nm')].filter(n=>n.scrollWidth>n.clientWidth+1).length }) // 0
```
Then eyeball at 1280 and 1920 to confirm the bus still lines up, open one squad, toggle
Display → Names off, and click a card to check the drawer. Ship only when the checklist is green.
