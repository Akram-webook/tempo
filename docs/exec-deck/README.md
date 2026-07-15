# Tempo — Executive Status Deck (Google Apps Script)

A self-updating, WBK-branded **Google Slides** deck built from the
**"Tempo — Feedback (Live)"** sheet. Native Google — no servers, no cost,
**nothing in the Tempo app/repo runs it**. This folder holds the source
(`Code.gs`) for version history / rollback only; the deck itself lives in Google.

Edit the sheet → the deck rebuilds in ~1 min + daily at 06:00. The share link
never changes.

## What the deck contains (auto-computed, never typed)
1. **Cover** — portfolio tiles from `Waves` (shipped / in progress / planned), a
   big **% delivered** number + a green/amber proportion bar.
2. **Your requests** — the director's items from `Feedback` with a status chip +
   priority, sorted needs-input → working → done, plus a one-line rollup.
3. **One slide per wave** — status chip, "what's inside" as done/now/next dots,
   "why it matters", and a red **Needs your input** block when there are open asks.
4. **What needs you** — every "needs from director" item in one place.

*My Work (team execution) is Phase 2 — deferred, off by default (`SECT.myWork`).*

## Setup — 6 steps (once)
1. Sheet → **Extensions → Apps Script**. Delete starter code, paste `Code.gs`, **Save**.
2. Run **`buildDeck`** → authorize once → the Execution log prints the deck URL.
3. Run **`installTrigger`** → on-edit (debounced) + daily 06:00 rebuild.
4. **Share the deck** to the Director (Viewer) + you (Editor) **only**.
5. Keep the **sheet** shared to you (Editor) + Director (Viewer/Commenter) only.
6. Bookmark the deck link.

## Weekly history (optional but recommended)
The live deck + the in-app page always show **now** — a rebuild overwrites, so
nothing is archived. To keep a permanent, browsable history so "last week" is
real:
1. Create (or pick) a **Drive folder** for the archive. Copy its folder id from
   the URL (`drive.google.com/drive/folders/<THIS>`).
2. Put it in the script: set `SNAPSHOT_FOLDER_ID = '<id>'` near the top of the
   snapshot section (or add a `snapshot_folder_id` row in the **Deck Settings** tab).
3. Run **`installWeeklySnapshot`** once → every **Monday ~06:00** it rebuilds the
   deck and saves a dated **PDF** (`Tempo Executive Status — YYYY-MM-DD.pdf`) into
   that folder. Run `weeklySnapshot` manually anytime to snapshot on demand.
4. **Share the folder** to the Director (Viewer) + you (Editor) only.

Each past Monday is then just a file in the folder — that is the historical
"last week / two weeks ago" record the live surfaces don't keep.

## Change it later
- **What it says** → edit the sheet tabs. Rebuilds in ~1 min.
- **Look / structure** → the optional **`Deck Settings`** sheet tab (key/value:
  `accent_hex`, `cover_headline`, `show_my_work`, `show_needs_you`,
  `section_order`, `refresh_hour`) OR the `CONFIG` block at the top of `Code.gs`.
- **Roll back** → Apps Script version history / Sheet File → Version history.
- **Flag a decision** → write `Needs: <the ask>` in a wave's "What's inside" (or a
  "Needs from director" note). It surfaces as a red block on that wave + on the
  "What needs you" slide.

**Safe by design:** the script only *reads* the sheet; it never touches the Tempo
app or repo, so no deck change can affect the live product. All risky calls are
wrapped in try/catch so one bad field can't abort the build.
