# Heuristic Evaluation + Usability Test Plan

Webook Workload evaluated against **Nielsen's 10 Usability Heuristics** (NN/g), plus a plan
to test it with real users. Method per NN/g's "How to Conduct a Heuristic Evaluation."

> Heuristics find *likely* problems cheaply; they **don't replace user testing**. Use this to
> fix the obvious issues first, then test with 5 real teammates (plan at the bottom).

## Findings by heuristic (✅ fixed now · ◐ ok · ⚠ to do)

1. **Visibility of system status** — ◐ Time filter, theme, and "View as" all reflect immediately;
   active states shown on controls. *To do:* a tiny "Viewing as: Ahmed (Director)" label for extra clarity.
2. **Match system & real world** — ◐ Plain language, bilingual, real titles, tier names. Good.
3. **User control & freedom** — ✅ **Fixed.** Added an explicit **✕ close** on the peek popover and
   **Esc-to-close** for all overlays; profile/settings/daily already have Back. (Previously the peek
   only closed by clicking outside — a control gap.)
4. **Consistency & standards** — ◐ Buttons, cards, and colors are consistent. *Minor:* the collapse
   control uses `+/−`; keep one icon language as it grows.
5. **Error prevention** — ◐ Overload assignment is soft-locked and the override **requires a typed
   reason** before it commits. *To do:* replace the raw `prompt()` with an inline confirm field.
6. **Recognition rather than recall** — ✅ **Fixed.** Added a **capacity-state legend**
   (Available / Balanced / Near / Overloaded with colors + ranges) on the map, so the color meaning
   is visible, not memorized. (Research: when color encodes meaning, show a legend.)
7. **Flexibility & efficiency** — ◐ Collapse/expand + time filter act as accelerators; Esc now works.
   *Optional later:* keyboard nav, saved filters.
8. **Aesthetic & minimalist design** — ✅ Cards are now uniform; the profile is dense but sectioned.
   *Watch:* the profile is long — consider tabs if it grows further.
9. **Help users recognize/recover from errors** — ◐ "Not authorized to view this profile" handles the
   main case in plain language. Few error states exist by design.
10. **Help & documentation** — ⚠ *To do:* a small in-context "?" explaining the capacity model and the
    state bands (the legend now covers most of this need).

## What was applied this round
- **Capacity-state legend** on the workload map (heuristic #6).
- **✕ close button + Esc-to-close** on overlays (heuristic #3).
- (Earlier rounds already addressed #8 with uniform cards and the fit-to-width tree.)

## Backlog (ranked)
1. Inline override-reason field instead of `prompt()` (#5).
2. "Viewing as <name>" context label (#1).
3. In-context "?" help on the capacity model (#10).
4. Profile tabs if the page keeps growing (#8).

## Usability test plan (do this during the POC)
Per NN/g "Usability Testing 101" — qualitative, **5 users** uncovers most issues.
- **Users:** 5 from the ops team across roles (a specialist, a manager, ideally the Director).
- **Method:** moderated, think-aloud; you watch, don't lead.
- **Tasks (realistic, no leading wording):**
  1. "Find who on the team is closest to overload right now."
  2. "Find someone who's free to take a new Tier-3 event."
  3. "Open Osama's profile and tell me whether he's a promotion or a retention risk."
  4. "Switch to view the system as a specialist — what can and can't you see?"
  5. "Assign the pop-up concert to the best person."
- **Capture:** task success, where they hesitate, what they say. 1 finding per line.
- **After:** cluster findings, fix the top 3, retest. Don't fix everything — fix what blocks tasks.

> Reminder from NN/g: a heuristic violation isn't automatically a problem — context decides.
> Validate the important ones with the 5-user test before investing in fixes.

## Source
[10 Usability Heuristics — NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/) ·
[How to Conduct a Heuristic Evaluation — NN/g](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) ·
[Usability Testing 101 — NN/g](https://www.nngroup.com/articles/usability-testing-101/)
