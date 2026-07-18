# Waves — what they are, and when to add one

The exec-status pipeline (`compute-exec-status.js`) derives Project-delivery
status from PRs grouped by **wave label** (`wave:exec-status`, `wave:capacity`,
`wave:real-data`, `wave:slack`). This doc is the **principle** for wave
granularity, so the wave list stays meaningful instead of turning into label soup.

## The rule

> **A wave is a decision boundary, not a folder.**
> Add a wave only if a director would make a *different decision* based on this
> line moving independently.

Concretely, a wave should map to **an outcome a non-engineer asked for and will
notice shipping** (e.g. "Real-data go-live"), NOT to a technical component
("refactor the capacity module"). If a candidate wave only ever moves together
with an existing wave, it is a **label inside** that wave, not its own wave.

## Tests before adding a wave

1. **Independent signal?** Would its progress/health move on its own, and would
   that movement change what the director does this week? If no → not a wave.
2. **Outcome, not component?** Can you name it as a thing leadership requested?
   "Slack integration" (outcome) yes; "extract the ingest helper" (component) no.
3. **Will someone notice it ship?** If finishing it is invisible to a non-engineer,
   it belongs inside a bigger wave.

## The ceiling

**~5–7 waves maximum.** Past that, leadership can't hold them in their head and
the status page stops being scannable. If you need an 8th, first ask whether two
existing waves have merged into one outcome and can be collapsed.

## How to add one (deliberate friction is the point)

Waves are **never auto-created from labels.** Adding one is two steps, both
intentional:

1. Create the GitHub label `wave:<slug>`.
2. Add one line to the `WAVES` array in `scripts/compute-exec-status.js`:
   `{ name: '<Exact Wave Name>', label: 'wave:<slug>' }`
   The `name` must match the Waves sheet tab row EXACTLY (the sheet matches by
   name; a typo creates a ghost row).

That friction is a feature — it's what keeps the list honest.
