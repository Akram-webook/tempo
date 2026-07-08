/* Visual + behavioral verify for wave/map-simple-tree (B1).
 * Loads the built dist/chart.html (full-screen chart) headlessly and asserts the
 * redesign: collapsed-to-top, no legend, no +/- expand/collapse, name-click opens
 * nothing, and the scroll container is bounded (max-height set → can scroll down).
 * Captures EN/AR × dark/light shots into docs/shots/map-simple-tree/. */
const { chromium } = require(process.env.HOME + '/tempo-hardening-ux/node_modules/playwright');
const path = require('path'), fs = require('fs');
const root = __dirname + '/..';
const outDir = path.join(root, 'docs/shots/map-simple-tree');
fs.mkdirSync(outDir, { recursive: true });
const url = 'file://' + path.join(root, 'dist/chart.html');
const results = [];
function ok(name, cond) { results.push((cond ? 'PASS ' : 'FAIL ') + name); }

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ tag: 'wide', w: 1920, h: 1080 }, { tag: 'mobile', w: 375, h: 720 }]) {
    for (const lang of ['en', 'ar']) {
      for (const theme of ['dark', 'light']) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.goto(url, { waitUntil: 'networkidle' });
        // set lang + theme through the app's own controls/state
        await page.evaluate(([l, t]) => { WP.setState({ lang: l, theme: t }); }, [lang, theme]);
        await page.waitForTimeout(200);

        if (vp.tag === 'wide' && lang === 'en' && theme === 'dark') {
          // ---- behavioral assertions (once, canonical config) ----
          const m = await page.evaluate(() => {
            const q = s => document.querySelector(s);
            const all = s => document.querySelectorAll(s).length;
            const branch = q('.tree .node.has-kids[data-id]');
            const shownStart = all('.tree .node[data-id]');
            if (branch) branch.click();
            const shownAfter = all('.tree .node[data-id]');
            const cs = branch ? getComputedStyle(q('.tree-scroll')) : {};
            return {
              hasExpandBtn: !!q('#oc-expand'), hasCollapseBtn: !!q('#oc-collapse'),
              hasLegend: !!q('.legend'), profileTargets: all('.node-ava[data-profile]'),
              shownStart, shownAfter, scrollMaxH: cs.maxHeight, scrollOverflow: cs.overflowY,
              hasThemeBtn: !!q('#oc-theme'), hasLangBtn: !!q('#oc-lang'),
            };
          });
          ok('collapsed-to-top (expand reveals more nodes)', m.shownAfter > m.shownStart);
          ok('capacity-band legend GONE', !m.hasLegend);
          ok('+/- Expand-all button GONE', !m.hasExpandBtn);
          ok('+/- Collapse-all button GONE', !m.hasCollapseBtn);
          ok('no profile-open targets on avatars', m.profileTargets === 0);
          ok('theme + lang controls still present', m.hasThemeBtn && m.hasLangBtn);
          ok('.tree-scroll has bounded max-height (scrollable)', /calc|px/.test(m.scrollMaxH || ''));
          ok('.tree-scroll overflow allows vertical scroll', /auto|scroll/.test(m.scrollOverflow || ''));
          // scroll-to-bottom reachability with a tall/expanded tree
          const scroll = await page.evaluate(() => {
            const el = document.querySelector('.tree-scroll');
            document.querySelectorAll('.tree .node.has-kids[data-id]').forEach(n => n.click());
            el.scrollTop = el.scrollHeight;
            return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
          });
          ok('full-screen: can scroll to the bottom', scroll.top >= scroll.max - 2);
          await page.reload({ waitUntil: 'networkidle' });
          await page.evaluate(([l, t]) => { WP.setState({ lang: l, theme: t }); }, [lang, theme]);
          await page.waitForTimeout(150);
        }
        const f = path.join(outDir, `chart-${vp.tag}-${lang}-${theme}.png`);
        await page.screenshot({ path: f, fullPage: false });
        await page.close();
      }
    }
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('shots →', outDir);
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})();
