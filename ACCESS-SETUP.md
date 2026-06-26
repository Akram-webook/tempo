# Tempo — Access & Sign-in Setup

## ✅ LIVE NOW: verified sign-in is switched on

Tempo is connected to a Supabase project and running in **verified** mode. Sign-in works like this:

1. You enter your `@webook.com` email.
2. Supabase emails a **one-time secure sign-in link** to that inbox.
3. You open the email **on the same device** and tap the link — you're signed in.

Because the link is delivered to the real mailbox, **typing someone else's email gets nobody in** — they'd never receive the link. This closes the "anyone who types my email" gap.

**Why a link and not a 6-digit code:** Supabase's built-in email sends a click-link by default, and its template can't be changed to show a typed code without adding custom SMTP (a separate email-sending provider). The link is equally secure and actually one fewer step. If you specifically want a **typed 6-digit code**, see "Upgrade to a typed code" at the bottom — it needs ~10 more minutes to connect an SMTP sender.

**To test:** open https://akram-webook.github.io/tempo/ → enter your `akram@webook.com` → check your inbox → tap the link. You should land in Tempo as Super Admin. (First email may take a minute / check spam.)

Config in use (both values are public-safe): project `ftkbjsxdrxtjdzcojnve.supabase.co`, publishable key `sb_publishable_…`.

---

## Reference

This explains exactly how sign-in works today, what it does and doesn't protect,
and how to turn on **real verification** in about 10 minutes.

## The honest summary (read this first)

Tempo is a static site (just `index.html` on GitHub Pages). A static site has **no
server**, so there are two truthful levels of access control — and I will not pretend
the weaker one is stronger than it is.

| Level | What it is | Can a determined person bypass it? |
|------|------------|-----------------------------------|
| **Directory gate** (default, on now) | You type your **exact** registered `@webook.com` email. Unknown emails are rejected. You **cannot** pick someone else's account from a list. | **Yes** — anyone who types a registered email gets in (no proof of identity). Fine for a trusted internal pilot; not a real lock. |
| **Email code (OTP)** — *recommended* | You enter your `@webook.com` email → a **6-digit code is emailed to that mailbox** → you type it back. Typing someone else's email is useless: the code lands in *their* inbox, not yours. | **No** — this is genuine verification. Set up below (~5 min, free). |
| **Google-verified** (alternative) | "Continue with Google" runs real Google sign-in. Google proves the person owns that `@webook.com` mailbox. | No — also genuine verification. |

> **Answering "can someone enter just by typing my email?"** — On the directory gate (today): **yes**. With Email code or Google enabled: **no** — they'd need the code delivered to your real inbox, or your actual Google login.

Akram (`akram@webook.com`) is the **Super Admin**: can View-as any account and manage access.

The code is already written — Tempo automatically uses the strongest method you've
configured. Enable **one** of the two below and it switches on.

## Recommended: Email code (OTP) — ~5 min, no credit card

This uses **Supabase** purely as a mailer/verifier. The two values you paste are
**public by design** (safe to ship in the page); they grant no admin power.

1. Go to **supabase.com** → sign in with GitHub → **New project** (pick any name;
   free tier; no card). Wait ~1 min for it to provision.
2. In the project: **Project Settings → API**. Copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon / public** key (the long `eyJ…` string — the *anon public* one, **not** `service_role`).
3. **Authentication → Providers → Email** → make sure **Email** is enabled, and turn
   **ON** "Email OTP" (the 6-digit code). (Optional: turn off "Confirm email" friction.)
4. Open `src/js/core/config.js` and paste:
   ```js
   WP.config.supabaseUrl     = 'https://abcd1234.supabase.co';
   WP.config.supabaseAnonKey = 'eyJ...your-anon-public-key...';
   ```
5. Rebuild + redeploy: `node build.js`, then upload `dist/index.html`.

Done. Sign-in now reads: enter email → "We emailed a 6-digit code to you" → type it → in.

**Notes & limits (honest):**
- Supabase's built-in email sender is rate-limited on the free tier (a few per hour) —
  plenty for a 13-person internal tool. For production volume, add your own SMTP in
  Supabase (one screen).
- Only the 13 registered emails can even *request* a code — Tempo checks the directory
  first, so codes are never sent to non-employees.
- Want to **restrict signups to `@webook.com` only** at the Supabase level too? In
  **Authentication → Settings**, there's an allow-list/− you can also leave it, since
  the directory check already blocks everyone else.

## Alternative: Google sign-in (≈10 min, free)

Prefer Google over email codes? Enable this instead (don't set both — email code wins if both are present).

1. Go to **console.cloud.google.com** → create/select a project.
2. **APIs & Services → OAuth consent screen** → User type **Internal** (this alone
   restricts sign-in to `@webook.com`). Fill app name + support email → Save.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: add `https://akram-webook.github.io`
     (and `http://localhost:8080` if you test locally).
   - Create → copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).
4. Open `src/js/core/config.js` and paste it:
   ```js
   WP.config.googleClientId = 'PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com';
   ```
5. Rebuild and redeploy: `node build.js`, then upload `dist/index.html`.

That's it. The login screen will now show **Continue with Google**, and only people
whose Google `@webook.com` identity matches a directory email get in.

## What's already wired

- Every person has their exact email in the directory (the 13 you sent).
- The login screen is a single **email field** — no "pick anyone" list (that old flaw is gone).
- Wrong domain → rejected. Unknown email → rejected. No cross-account entry.
- The **email-code flow and the Google flow are both already coded** — Tempo turns on
  whichever you configure (email code takes priority).

## Going further later

If you ever want server-enforced roles and a full audit trail (not just verified login),
the same Supabase project can hold per-user data with row-level security — no UI change
needed. Say the word and I'll wire it in.

## The registered directory

| Name | Email | Role in Tempo |
|------|-------|---------------|
| Mohammed Akram | akram@webook.com | **Super Admin** |
| Abdulrahman Maksousa | maksousa@webook.com | account |
| Osama Taher | o.taher.c@webook.com | account |
| Mohamed Gamal Ali | m.ali.c@webook.com | account |
| Talal Samir | talal.samir.c@webook.com | account |
| Ahmed Othman | ahmed.othman@webook.com | account |
| Shamma | shamma@webook.com | account |
| Mohammed Idris (Adris) | mohammed.adris.c@webook.com | account |
| Zaidan | zaidan@webook.com | account |
| Faraj | faraj@webook.com | account |
| Meshal | meshal@webook.com | account |
| Ahmed Fouda | fouda@webook.com | account |
| Ismail Abdelaal | abdelaal@webook.com | account |

> Note: `fouda@` and `abdelaal@` are placeholders I inferred from the names — if their
> real aliases differ, send them and I'll correct `EMAILS` in `mock-data.js`.
