/* Tempo — dev watcher. Rebuilds dist/index.html automatically whenever anything
 * under src/ (or index.html) changes, so you never run `node build.js` by hand.
 * Zero dependencies — uses Node's built-in recursive fs.watch.
 *   npm run watch   (leave it running in its own terminal)
 * Note: recursive watch works on macOS and Windows. On Linux, run `npm run build`
 * manually or swap in a watcher like chokidar/nodemon. */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let timer = null, building = false, again = false;
function build() {
  if (building) { again = true; return; }
  building = true;
  execFile(process.execPath, [path.join(__dirname, 'build.js')], function (err, stdout, stderr) {
    building = false;
    process.stdout.write(new Date().toLocaleTimeString() + '  ' + (stdout || '').trim() + '\n');
    if (err) process.stderr.write((stderr || err.message) + '\n');
    if (again) { again = false; schedule(); }
  });
}
function schedule() { clearTimeout(timer); timer = setTimeout(build, 150); } // debounce bursts

console.log('Tempo watch — building on save. Ctrl+C to stop.');
build();
['src', 'index.html'].forEach(function (target) {
  const p = path.join(__dirname, target);
  if (!fs.existsSync(p)) return;
  try {
    fs.watch(p, { recursive: true }, function () { schedule(); });
  } catch (e) {
    fs.watch(p, function () { schedule(); }); // fallback (non-recursive)
  }
});
