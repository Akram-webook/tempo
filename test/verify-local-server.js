#!/usr/bin/env node
/* Verify the LOCAL SYSTEM server (tools/local-server.js):
 *  - a data-URL image decodes to a real image buffer,
 *  - persistRecord writes that image to a file and rewrites `image` to a served
 *    path (so Project delivery shows it),
 *  - a non-image record survives with image=null,
 *  - safeJoin blocks path traversal.
 * Pure unit test - no network, no build. Uses a temp data dir via monkey-patch
 * is overkill; instead we exercise decodeDataUrl + safeJoin directly and
 * persistRecord against a real temp dir we clean up.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const srv = require('../tools/local-server.js');

let pass = 0;
function ok(cond, msg) { assert.ok(cond, msg); pass++; }

// 1x1 transparent PNG as a data URL
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/* --- decodeDataUrl --- */
const dec = srv.decodeDataUrl(PNG_1x1);
ok(dec && Buffer.isBuffer(dec.buffer) && dec.buffer.length > 0, 'decodeDataUrl returns a non-empty buffer');
ok(dec.ext === 'png', 'decodeDataUrl reports png ext');
ok(srv.decodeDataUrl('not a data url') === null, 'decodeDataUrl rejects non-data-url');
ok(srv.decodeDataUrl(null) === null, 'decodeDataUrl rejects null');
// jpeg maps to jpg extension
const jpg = srv.decodeDataUrl('data:image/jpeg;base64,' + Buffer.from('x').toString('base64'));
ok(jpg && jpg.ext === 'jpg', 'jpeg data-url maps to .jpg extension');

/* --- persistRecord writes a real file + rewrites image path --- */
// Redirect the image dir to a temp dir by working relative to the module's data dir.
// persistRecord writes into data/feedback-images under the repo; use it then clean up.
const IMG_DIR = path.join(__dirname, '..', 'data', 'feedback-images');
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const rec = { note: '[UI] test', type: 'Bug', image: PNG_1x1, imageName: 'shot.png' };
const saved = srv.persistRecord(rec, 999, '2026-07-21T00:00:00.000Z');
ok(/^local-999-/.test(saved.id), 'persistRecord stamps a local- id');
ok(saved.status === 'New' && saved.savedLocal === true, 'persistRecord marks status New + savedLocal');
ok(typeof saved.image === 'string' && saved.image.indexOf('data/feedback-images/') === 0,
  'image rewritten to a served path (not a data URL)');
const onDisk = path.join(__dirname, '..', saved.image);
ok(fs.existsSync(onDisk) && fs.statSync(onDisk).size > 0, 'the image was written as a real file on disk');
ok(saved.note === rec.note && saved.type === rec.type, 'note + type preserved');
// clean up the test artifact
try { fs.unlinkSync(onDisk); } catch (e) {}

/* --- a text-only record keeps image=null --- */
const textOnly = srv.persistRecord({ note: 'no image', type: 'Feature' }, 1000, '2026-07-21T00:00:00.000Z');
ok(textOnly.image === null, 'text-only record has image=null (no dead file)');

/* --- safeJoin blocks traversal --- */
const base = path.join(__dirname, '..');
ok(srv.safeJoin(base, '/dist/index.html') !== null, 'safeJoin allows in-tree path');
ok(srv.safeJoin(base, '/../../etc/passwd') === null, 'safeJoin blocks ../ traversal');

console.log('verify-local-server: ' + pass + ' assertions passed');
