# Tempo - Local System (run it on your own machine)

Run Tempo entirely on your computer. No internet, no server, no accounts. Feedback
you submit - **including attached images** - is saved as **real files on disk**, and
shows up on **Project delivery** just like the live version.

This is the version to use and demo now. When we're ready to go live, the same setup
switches to a real server by changing one setting - nothing in the app has to change.

## Start it

```bash
npm install        # one time
npm run local      # builds the app, then serves it
```

Then open: **http://localhost:4000/**

To stop it: press `Ctrl + C` in the terminal.

Options:

```bash
node tools/local-server.js --port 4010     # use a different port
node tools/local-server.js --no-build      # skip the rebuild (faster restart)
```

## Add an image and see it on Project delivery

1. Click the **Feedback** button (floating, bottom-right).
2. Write your note and **attach a screenshot**.
3. Click **Save feedback**.
4. Open **Project delivery** - your item appears with a **thumbnail** of the image.
   Click the thumbnail to view it full-size (close with X, click outside, or Escape).

## Where your data lives

| What | Where on disk |
| --- | --- |
| Feedback records | `data/feedback.json` |
| Attached images | `data/feedback-images/` |

These are **real files** you can open, back up, or hand off. They are **not** committed
to the repo (they're in `.gitignore`) - they stay on your machine only.

## How it maps to going live

The app sends feedback to one endpoint (`/api/feedback`). Locally, a small Node server
(`tools/local-server.js`) receives it and writes to disk. At go-live we point that same
endpoint at a real server (Supabase) instead. **The user interface does not change** -
only where the data is stored.

- On `localhost` the local endpoint turns on automatically.
- On the public GitHub Pages build it stays off, and feedback falls back to the existing
  per-browser save (nothing lost) - so shipping this never affects the live site.
