/* Screenshot harness for NO-DEMO mode (WP.config.demoData).
 * Captures the dashboard + workload map in BOTH states — demoData=true (today,
 * Sample-data badge + seeded KPIs) and demoData=false (honest empty states, no
 * badge) — across both themes and EN + AR(RTL). App code untouched; the harness
 * only sets the flag before boot and, in no-demo, injects a single signed-in
 * viewer (a generic placeholder — NOT real data) so the shell renders while the
 * roster stays empty. Fails on any JS pageerror. */
const path = require('path');
const { chromium } = require(path.join(process.env.HOME, 'tempo-hardening-ux/node_modules/playwright'));
const OUT = path.join(__dirname, '..', 'docs', 'shots', 'no-demo');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: true }); console.log('  ▸', name); }

async function runMode(browser, mode) {
  const noDemo = mode === 'nodemo';
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.on('pageerror', e => errors.push('[' + mode + '][pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('[' + mode + '][console] ' + m.text()); });
  // Set the flag BEFORE the app boots (config.js reads it at load).
  if (noDemo) await page.addInitScript(() => { window.WP = { config: { demoData: false } }; });
  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.evaluate((noDemo) => {
    const WP = window.WP;
    if (noDemo) {
      // No roster is loaded yet in no-demo mode. Inject ONE generic signed-in
      // viewer so the app shell renders, and keep the visible roster EMPTY so the
      // honest empty states show (this mirrors "signed in, data not loaded yet").
      WP.data.PEOPLE.push({ id: 'p_view', name: 'Signed-in Director', nameAr: 'المدير',
        initials: 'SD', level: 'director', managerId: null, title: 'Director', titleAr: 'مدير',
        employment: 'fulltime', assignedEvents: [], dailyCheckin: null });
      WP.access.visiblePeople = function () { return []; };
      WP.state.viewerId = 'p_view';
    } else {
      const dir = (WP.data.PEOPLE || []).find(p => WP.access.canManage(p));
      WP.state.viewerId = dir.id;
    }
    WP.state.authed = true;
  }, noDemo);

  for (const theme of ['dark', 'light']) {
    for (const lang of ['en', 'ar']) {
      const sfx = mode + '-' + theme + (lang === 'ar' ? '-ar' : '');
      for (const route of ['dashboard', 'map']) {
        await page.evaluate(({ theme, lang, route }) => {
          const WP = window.WP;
          WP.state.lang = lang;
          document.documentElement.lang = lang;
          document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
          WP.setState({ theme: theme, route: route });
        }, { theme, lang, route });
        await page.waitForTimeout(300);
        await shot(page, route + '-' + sfx + '.png');
      }
    }
  }
  await page.close();
  return errors;
}

(async () => {
  const browser = await chromium.launch();
  let errors = [];
  for (const mode of ['demo', 'nodemo']) { console.log('· ' + mode); errors = errors.concat(await runMode(browser, mode)); }
  await browser.close();
  if (errors.length) { console.log('SHOT FAIL — JS errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('SHOT OK — no JS pageerrors (demo + no-demo, both themes, EN+AR)');
})();
