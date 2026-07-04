/* Before/after screenshots for the People & Workload map full-bleed change.
 * Drives the built dist headless: signs in as a director, pins refDate into the
 * sample window so the tree has load, and captures the map at a wide (1920) and a
 * phone (375) viewport, both themes, EN + AR. URL is overridable so we can shoot the
 * pre-change dist (BEFORE) and the current dist (AFTER) with the same harness.
 *   TEMPO_SHOT_URL=file:///abs/before.html TEMPO_SHOT_TAG=before node tools/shot-map-fullwidth.js
 * Harness only — app code untouched. Fails on any JS pageerror. */
const path = require('path');
const { chromium } = require(path.join(process.env.HOME, 'tempo-hardening-ux/node_modules/playwright'));
const OUT = path.join(__dirname, '..', 'docs', 'shots', 'map-fullwidth');
const URL = process.env.TEMPO_SHOT_URL || ('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
const TAG = process.env.TEMPO_SHOT_TAG || 'after';
const VIEWS = [{ name: 'wide', w: 1920, h: 1080 }, { name: 'mobile', w: 375, h: 780 }];

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); console.log('  ▸', name); }

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  for (const v of VIEWS) {
    const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
    page.on('pageerror', e => errors.push('[pageerror ' + v.name + '] ' + e.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    // Sign in as a director and pin the reference date into the June-2026 sample window.
    await page.evaluate(() => {
      const WP = window.WP;
      const dir = (WP.data.PEOPLE || []).find(p => WP.access.canManage(p)) || WP.data.PEOPLE[0];
      WP.state.authed = true; WP.state.viewerId = dir.id; WP.state.refDate = '2026-06-17';
    });
    for (const theme of ['dark', 'light']) {
      for (const lang of ['en', 'ar']) {
        await page.evaluate(({ theme, lang }) => {
          const WP = window.WP;
          WP.state.lang = lang;
          document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
          WP.setState({ theme: theme, route: 'map' });
        }, { theme, lang });
        await page.waitForTimeout(400);
        await shot(page, TAG + '-' + v.name + '-' + theme + (lang === 'ar' ? '-ar' : '') + '.png');
      }
    }
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.log('SHOT FAIL — JS errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('SHOT OK (' + TAG + ') — no JS pageerrors');
})();
