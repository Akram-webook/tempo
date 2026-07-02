/* Architecture boundary (System-Design principle #1): the CORE layer computes — it must not
 * reach into the DOM. Rendering/DOM lives in src/js/ui/** and src/js/app.js. This test reads
 * every src/js/core/*.js and FAILS if a core file manipulates the DOM.
 *
 * Rationale: keeping core DOM-free is what makes it unit-testable in isolation and keeps the
 * data → core → ui → app load order a real boundary, not a convention.
 *
 * ALLOW (explicitly permitted in core):
 *   - window.WP.*            — core publishes onto the single global namespace; that's the design.
 *   - document.documentElement.{lang,dir,setAttribute}  — the ONE sanctioned DOM touch: state.js
 *                              applies language / direction / theme to the <html> root. This is
 *                              root-level app chrome, not view rendering. Anything beyond the
 *                              root element belongs in the ui layer.
 *
 * DENY (DOM manipulation — the mark of view code that leaked into core):
 *   querySelector(All), getElementById, getElementsBy*, createElement, createTextNode,
 *   innerHTML, outerHTML, insertAdjacentHTML, addEventListener, removeEventListener,
 *   appendChild, document.body, document.head, document.write, .classList, .style=
 *
 * The lists are intentionally explicit and commented — widen DENY only with a reason, and add to
 * ALLOW only for a genuinely sanctioned, root-level exception.
 */
const fs = require('fs'), path = require('path');
const coreDir = path.join(__dirname, '..', 'src', 'js', 'core');

// Strip // line comments and /* */ block comments so prose like "in a given window." or
// "…manipulate the DOM…" can't trip the scanner. String literals are left as-is (a DOM API
// name sitting inside a core string would still be suspicious).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const DENY = [
  /\bquerySelector(All)?\s*\(/,
  /\bgetElementById\s*\(/,
  /\bgetElementsBy\w+\s*\(/,
  /\bcreateElement\s*\(/,
  /\bcreateTextNode\s*\(/,
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /\binsertAdjacentHTML\s*\(/,
  /\baddEventListener\s*\(/,
  /\bremoveEventListener\s*\(/,
  /\bappendChild\s*\(/,
  /\bdocument\.body\b/,
  /\bdocument\.head\b/,
  /\bdocument\.write\b/,
  /\.classList\b/,
  /\.style\s*=/,
];

// Bare `document` access that is NOT the sanctioned documentElement root touch.
const ALLOW_DOCUMENT = /document\.documentElement\b/g;
const BARE_DOCUMENT = /\bdocument\b/;

const files = fs.readdirSync(coreDir).filter(f => f.endsWith('.js')).sort();
const violations = [];

for (const f of files) {
  const raw = fs.readFileSync(path.join(coreDir, f), 'utf8');
  const code = stripComments(raw);
  code.split('\n').forEach((line, i) => {
    const at = () => f + ':' + (i + 1);
    for (const re of DENY) {
      if (re.test(line)) violations.push(at() + '  DOM API  ' + re.source + '  →  ' + line.trim());
    }
    // Remove the allowed documentElement touches, then flag any remaining `document`.
    const rest = line.replace(ALLOW_DOCUMENT, '');
    if (BARE_DOCUMENT.test(rest)) violations.push(at() + '  bare document access  →  ' + line.trim());
  });
}

if (!files.length) { console.log('FAIL — no core files found; scan path is wrong'); process.exit(1); }
if (violations.length) {
  console.log('FAIL — core layer must not touch the DOM (' + violations.length + '):\n' + violations.join('\n'));
  process.exit(1);
}
console.log('PASS — all ' + files.length + ' src/js/core/*.js files are DOM-free (only window.WP + documentElement root attrs allowed).');
process.exit(0);
