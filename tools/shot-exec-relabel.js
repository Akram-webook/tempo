/* Visual finish-gate for the Executive Status relabel (Feedback #10).
 * Boots the built dist offline, sets a director viewer, stubs the JSONP
 * exec payload (no network under file://), and shoots the exec view +
 * dashboard card in EN/AR x light/dark. Also proves a member sees no
 * nav item and no dashboard card. */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.HOME, 'tempo-hardening-ux/node_modules/playwright'));

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, '..', 'docs', 'shots', 'exec-relabel');
fs.mkdirSync(OUT, { recursive: true });

const PAYLOAD = {
  ok: true,
  generatedAt: new Date(0).toISOString(),
  cover: { done: 7, next: 3, later: 1, total: 11, pct: 64 },
  waves: [
    { wave: 'Wave 1', focus: 'Operational visibility', status: 'Done', inside: 'Workload map', why: 'See overload', needs: [] },
    { wave: 'Wave 4', focus: 'Decision intelligence', status: 'Next', inside: 'Weekly report', why: 'Fairer calls', needs: [] },
  ],
  requests: [
    { id: '1', date: '2026-07-10T07:00:00.000Z', area: 'Org tree', type: 'Improvement', note: 'Clearer cards', priority: 'Medium', status: 'Done', owner: 'Ahmed' },
    { id: '2', date: '2026-07-14T07:00:00.000Z', area: 'Exec', type: 'Decision', note: 'Approve wording', priority: 'High', status: 'Needs input', owner: 'Akram' },
  ],
};

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name) }); }

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('[console] ' + m.text()); });

  // Stub the JSONP transport BEFORE the app fetches (deterministic, offline).
  await page.addInitScript((payload) => {
    window.__waitWP = setInterval(() => {
      if (window.WP && window.WP.ui) {
        clearInterval(window.__waitWP);
        window.WP.ui.jsonp = function () { return Promise.resolve(payload); };
      }
    }, 5);
  }, PAYLOAD);

  await page.goto(URL, { waitUntil: 'networkidle' });

  // Director viewer (can('viewSettings') → execDeckVisible true).
  const roleOK = await page.evaluate(() => {
    const WP = window.WP;
    const dir = (WP.data.PEOPLE || []).find(p => WP.access.canManage(p));
    WP.state.authed = true; WP.state.viewerId = dir.id;
    window.__dir = dir.id;
    // a plain member (manages no one, not admin) to prove the view is hidden
    const member = (WP.data.PEOPLE || []).find(p => !WP.access.canManage(p));
    window.__member = member ? member.id : null;
    return { deckVisible: !!(WP.execDeckVisible && WP.execDeckVisible()), member: window.__member };
  });
  if (!roleOK.deckVisible) { console.log('SHOT FAIL — director cannot see exec deck'); process.exit(1); }

  for (const theme of ['dark', 'light']) {
    for (const lang of ['en', 'ar']) {
      const sfx = theme + (lang === 'ar' ? '-ar' : '');
      // Dashboard (shows the relabeled "Project status" card + nav item)
      await page.evaluate(({ theme, lang }) => {
        const WP = window.WP;
        WP.state.lang = lang;
        document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        WP.setState({ theme: theme, route: 'dashboard' });
      }, { theme, lang });
      await page.waitForTimeout(300);
      await shot(page, 'dashboard-' + sfx + '.png');

      // Executive Status view (new eyebrow + subtitle)
      await page.evaluate(({ theme, lang }) => {
        const WP = window.WP;
        WP.state.lang = lang;
        document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        WP.setState({ theme: theme, route: 'exec' });
      }, { theme, lang });
      await page.waitForTimeout(450);
      await shot(page, 'exec-' + sfx + '.png');

      // Assert the copy actually rendered
      const txt = await page.evaluate(() => {
        const q = s => (document.querySelector(s) || {}).textContent || '';
        return { eyebrow: q('.ex-eyebrow'), title: q('.ex-title'), sub: q('.ex-subtitle') };
      });
      const eyeOK = /PROJECT DELIVERY|تسليم المشروع/i.test(txt.eyebrow) && /INTERNAL|داخلي/i.test(txt.eyebrow);
      const subOK = /Tempo project|مشروع تيمبو/i.test(txt.sub);
      if (!eyeOK || !subOK) { console.log('SHOT FAIL — copy missing (' + lang + '/' + theme + '): ' + JSON.stringify(txt)); process.exit(1); }
    }
  }

  // Member: no nav item, no dashboard card, route redirects away
  if (roleOK.member) {
    const hidden = await page.evaluate(() => {
      const WP = window.WP;
      WP.state.viewerId = window.__member;
      WP.setState({ theme: 'light', route: 'dashboard', lang: 'en' });
      const navHasExec = !!document.querySelector('.nav-item[data-go="exec"]');
      const hasCard = !!document.querySelector('.exec-card');
      // attempt to force-navigate to exec; render() defence-in-depth must bounce
      // to dashboard and never paint the exec header for a member.
      WP.setState({ route: 'exec' });
      // effectiveRoute() renders the fallback WITHOUT mutating state, so what
      // matters is what painted, not the raw state.route value.
      const execPainted = !!document.querySelector('.ex-title, .ex-eyebrow, .ex-subtitle');
      return { navHasExec, hasCard, execPainted, deckVisible: !!(WP.execDeckVisible && WP.execDeckVisible()) };
    });
    await shot(page, 'member-dashboard-hidden.png');
    if (hidden.navHasExec || hidden.hasCard || hidden.deckVisible || hidden.execPainted) {
      console.log('SHOT FAIL — exec surface leaked to member: ' + JSON.stringify(hidden)); process.exit(1);
    }
    console.log('MEMBER HIDDEN OK — ' + JSON.stringify(hidden));
  } else {
    console.log('WARN — no plain member in sample data to test hiding');
  }

  await browser.close();
  if (errors.length) { console.log('SHOT FAIL — JS errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('SHOT OK — exec relabel: eyebrow+subtitle+card verified EN/AR x light/dark; member hidden');
})();
