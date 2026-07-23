/* ============================================================
 * Tempo feedback write proxy - Supabase Edge Function (Deno) - Go-Live G3
 * ------------------------------------------------------------
 * Holds the GitHub token as a Supabase secret and forwards feedback writes to
 * the EXISTING "Receive Feedback" Action via workflow_dispatch. The browser
 * never sees the token. One write path only - reuses the repo's tested appender
 * (scripts/append-feedback.js); it does NOT touch data/feedback.json directly.
 *
 * Lives in Supabase (the project already runs auth + data here) so the secret
 * sits with our other secrets and there's one platform to maintain.
 *
 * Contract (browser -> function):
 *   POST  { op:'create'|'update'|'discard', item:{...} }
 *   200 { ok:true }              (dispatch accepted; Action appends/updates + commits)
 *   4xx/5xx { ok:false, error } (validation / upstream failure)
 *
 * Security:
 *   - CORS: only https://akram-webook.github.io may call it (else 403).
 *   - Token: Deno.env GITHUB_PAT (secret) - fine-grained, Actions:write on tempo ONLY.
 *     Set with: supabase secrets set GITHUB_PAT=github_pat_xxx
 *   - The Action + append-feedback.js do field validation + anti-tamper (immutable
 *     id/owner/submittedAt), so even a hostile item is safe.
 *
 * Deploy:  supabase functions deploy feedback-proxy --no-verify-jwt
 *          supabase secrets set GITHUB_PAT=github_pat_xxxxxxxx
 *   (--no-verify-jwt: this is a public write endpoint gated by Origin + the Action's
 *    own validation, not by a Supabase user JWT. The token never leaves the server.)
 * ========================================================== */
const REPO = "akram-webook/tempo";
const WORKFLOW = "receive-feedback.yml";
const DISPATCH_URL = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
const ALLOWED_ORIGIN = "https://akram-webook.github.io";
const OPS = ["create", "update", "discard"];

// Forward ONLY the keys each op may legitimately set. create carries the full
// record; update/discard carry id + triage fields but NEVER owner/note/submittedAt
// (immutable). The append script re-enforces this too (defence in depth).
const CREATE_KEYS = ["note", "type", "klass", "priority", "owner", "area", "context", "url", "submittedAt"];
const UPDATE_KEYS = ["id", "status", "wave", "priority", "triageNote", "triagedBy"];

function cors(body: unknown, status: number): Response {
  // Always advertise the ONE allowed origin - never reflect the caller's Origin.
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  // Origin gate FIRST (applies to the preflight too, so a disallowed origin never
  // gets an allow-CORS preflight). Defence in depth; the token stays server-side regardless.
  if (origin !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return cors(null, 204);
  if (req.method !== "POST") return cors({ ok: false, error: "Not found" }, 404);

  let body: { op?: string; item?: Record<string, unknown> };
  try { body = await req.json(); }
  catch { return cors({ ok: false, error: "Invalid JSON" }, 400); }

  const op = body?.op ?? "";
  const item = body?.item;
  if (OPS.indexOf(op) < 0) return cors({ ok: false, error: "Invalid op" }, 400);
  if (!item || typeof item !== "object") return cors({ ok: false, error: "Missing item" }, 400);
  if (op === "create" && !String(item.note ?? "").trim()) {
    return cors({ ok: false, error: "Note required" }, 400);
  }
  if ((op === "update" || op === "discard") && !String(item.id ?? "").trim()) {
    return cors({ ok: false, error: "Item id required" }, 400);
  }

  const pat = Deno.env.get("GITHUB_PAT");
  if (!pat) return cors({ ok: false, error: "Not configured" }, 503);

  const pass = op === "create" ? CREATE_KEYS : UPDATE_KEYS;
  const inputs: Record<string, string> = { op };
  for (const k of pass) {
    if (item[k] !== undefined && item[k] !== null) inputs[k] = String(item[k]);
  }

  try {
    const res = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "tempo-feedback-proxy/1.0",
      },
      body: JSON.stringify({ ref: "main", inputs }),
    });
    // GitHub returns 204 on an accepted dispatch. Never leak the upstream body
    // (it could echo a token) - a fixed generic message only.
    if (res.status === 204) return cors({ ok: true }, 200);
    return cors({ ok: false, error: `Dispatch rejected (${res.status})` }, 502);
  } catch {
    return cors({ ok: false, error: "Upstream error" }, 502);
  }
});
