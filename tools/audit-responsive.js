/* Responsive audit: render every screen at phone + tablet widths, report
 * horizontal overflow (the classic mobile break) per route, and shoot the
 * offenders. Read-only diagnostic — no app code changes here. */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.HOME, 'tempo-hardening-ux/node_modules/playwright'));

const DIST = 'file://' + path.resolve(__dirname, '../dist/index.html');
const OUT = path.resolve(__dirname, '../docs/shots/responsive');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = ['dashboard', 'map', 'me', 'evaluations', 'evaluation', 'upward',
  'daily', 'library', 'exec', 'wellbeing', 'fairness', 'weekly', 'org',
  'permissions', 'admins', 'settings', 'profile', 'activity'];
const WIDTHS = [{ name: 'phone', w: 390, h: 844 }, { name: 'tablet', w: 768, h: 1024 }];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const vp of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    page.on('pageerror', e => { if (!/ResizeObserver|Non-Error/.test(String(e))) console.log('  [pageerror]', String(e).slice(0, 120)); });
    await page.goto(DIST, { waitUntil: 'networkidle' });
    // Sign in as a director; kill the daily-checkin prompt.
    await page.evaluate(() => {
      const dir = WP.data.PEOPLE.find(p => WP.access.canManage(p));
      WP.state.authed = true; WP.state.viewerId = dir.id;
      try { localStorage.setItem('tempo_checkin_prompt', new Date(0).toISOString().slice(0,10)); } catch (e) {}
    });
    for (const route of ROUTES) {
      await page.evaluate(r => { WP.setState({ route: r }); const m = document.querySelector('.daily-overlay,.dp-overlay'); if (m) m.remove(); }, route);
      await page.waitForTimeout(120);
      const info = await page.evaluate(() => {
        const de = document.documentElement;
        const bodyOverflow = de.scrollWidth - de.clientWidth;
        // Which elements push past the viewport right edge?
        const vw = window.innerWidth; const bad = [];
        document.querySelectorAll('main *, .appbar *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1.5) {
            const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
            bad.push({ tag: el.tagName.toLowerCase(), cls: String(cls).slice(0, 40), over: Math.round(r.right - vw) });
          }
        });
        // de-dupe by class, keep worst
        const seen = {}; bad.forEach(b => { const k = b.tag + '.' + b.cls; if (!seen[k] || seen[k].over < b.over) seen[k] = b; });
        return { bodyOverflow, offenders: Object.values(seen).sort((a,b)=>b.over-a.over).slice(0, 6) };
      });
      const flagged = info.bodyOverflow > 1 || info.offenders.length;
      results.push({ vp: vp.name, route, ...info });
      if (flagged) {
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${route}.png`), fullPage: true });
      }
    }
    await page.close();
  }
  await browser.close();
  console.log('\n=== RESPONSIVE OVERFLOW REPORT ===');
  let any = false;
  for (const r of results) {
    if (r.bodyOverflow > 1 || r.offenders.length) {
      any = true;
      console.log(`\n[${r.vp}] ${r.route}  bodyOverflow=${r.bodyOverflow}px`);
      r.offenders.forEach(o => console.log(`    +${o.over}px  ${o.tag}.${o.cls}`));
    }
  }
  if (!any) console.log('No horizontal overflow at phone or tablet on any route. CLEAN.');
  console.log('\nShots (offenders only) -> docs/shots/responsive/');
})();
