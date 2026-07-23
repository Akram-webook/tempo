/* ============================================================
 * Tempo CRUD proxy (Cloudflare Worker) - Go-Live G3
 * ------------------------------------------------------------
 * Holds the GitHub token as a Worker SECRET and forwards feedback
 * writes to the EXISTING "Receive Feedback" Action via workflow_dispatch.
 * The browser never sees the token. One write path only - this reuses the
 * repo's tested appender (scripts/append-feedback.js), it does NOT touch
 * data/feedback.json directly.
 *
 * Contract (browser -> worker):
 *   POST /feedback   { op:'create'|'update'|'discard', item:{...} }
 *   200 { ok:true }              (dispatch accepted; Action appends + commits)
 *   4xx/5xx { ok:false, error } (validation / upstream failure)
 *
 * Security:
 *   - CORS: only https://akram-webook.github.io may call it (else 403).
 *   - Token: env.GITHUB_PAT (secret) - fine-grained, Actions:write on tempo ONLY.
 *   - The Action + append-feedback.js do the field validation + anti-tamper
 *     (immutable id/owner/submittedAt), so even a hostile item is safe.
 *
 * Deploy:  cd workers/tempo-crud && npx wrangler deploy
 *          npx wrangler secret put GITHUB_PAT
 * ========================================================== */
const REPO = 'akram-webook/tempo';
const WORKFLOW = 'receive-feedback.yml';
const DISPATCH_URL = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
const ALLOWED_ORIGIN = 'https://akram-webook.github.io';
const OPS = ['create', 'update', 'discard'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';

    // Origin gate FIRST (defence in depth; CORS alone doesn't stop non-browser
    // callers, but the token stays server-side regardless). Applies to the
    // preflight too, so a disallowed origin never gets an allow-CORS preflight.
    if (origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return cors(null, 204);

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/feedback') {
      return cors({ ok: false, error: 'Not found' }, 404);
    }

    let body;
    try { body = await request.json(); }
    catch { return cors({ ok: false, error: 'Invalid JSON' }, 400); }

    const op = body && body.op;
    const item = body && body.item;
    if (OPS.indexOf(op) < 0) return cors({ ok: false, error: 'Invalid op' }, 400);
    if (!item || typeof item !== 'object') return cors({ ok: false, error: 'Missing item' }, 400);
    if (op === 'create' && !String(item.note || '').trim()) {
      return cors({ ok: false, error: 'Note required' }, 400);
    }
    if ((op === 'update' || op === 'discard') && !String(item.id || '').trim()) {
      return cors({ ok: false, error: 'Item id required' }, 400);
    }
    if (!env.GITHUB_PAT) return cors({ ok: false, error: 'Not configured' }, 503);

    // Map the CRUD item to the Action's flat string inputs. Forward ONLY the keys
    // that op may legitimately set - create carries the full record; update/discard
    // carry the id + triage fields but NEVER owner/note/submittedAt (immutable).
    // The append script re-enforces this too (defence in depth).
    const CREATE_KEYS = ['note', 'type', 'klass', 'priority', 'owner', 'area', 'context', 'url', 'submittedAt'];
    const UPDATE_KEYS = ['id', 'status', 'wave', 'priority', 'triageNote', 'triagedBy'];
    const pass = op === 'create' ? CREATE_KEYS : UPDATE_KEYS;
    const inputs = { op: op };
    pass.forEach((k) => { if (item[k] !== undefined && item[k] !== null) inputs[k] = String(item[k]); });

    try {
      const res = await fetch(DISPATCH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_PAT}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'tempo-crud-worker/1.0',
        },
        body: JSON.stringify({ ref: 'main', inputs }),
      });
      // GitHub returns 204 on an accepted dispatch. Anything else is a failure -
      // surface a generic error (never leak the upstream body, which could echo a token).
      if (res.status === 204) return cors({ ok: true }, 200);
      return cors({ ok: false, error: 'Dispatch rejected (' + res.status + ')' }, 502);
    } catch (err) {
      return cors({ ok: false, error: 'Upstream error' }, 502);
    }
  },
};

function cors(body, status) {
  // Always advertise the ONE allowed origin - never reflect the caller's Origin
  // header (reflecting it would defeat the point of the allow-list). Requests from
  // any other origin are already rejected with 403 before this is reached.
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}
