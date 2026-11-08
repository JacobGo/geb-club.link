// Copy public/ to dist/ and stamp static asset links with a content hash
// (/style.css -> /style.css?v=1a2b3c4d), so browsers fetch a changed file
// even though Cloudflare tells them to cache static assets for hours.
// Run by `npm run deploy`; local dev serves public/ directly.
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'public', OUT = 'dist';
// In dependency order: a script's own links are stamped before its hash is taken.
const STAMPED = ['/style.css', '/favicon.svg', '/triplet.js', '/palette.js', '/nav.js'];

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

const version = {};
const stamp = (text) => Object.entries(version).reduce((t, [asset, v]) => t.replaceAll(`"${asset}"`, `"${asset}?v=${v}"`), text);
for (const p of STAMPED) {
  let body = readFileSync(join(OUT, p));
  if (p.endsWith('.js')) { body = stamp(body.toString('utf8')); writeFileSync(join(OUT, p), body); }
  version[p] = createHash('sha256').update(body).digest('hex').slice(0, 8);
}

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let n = 0;
for (const file of walk(OUT).filter((f) => f.endsWith('.html'))) {
  writeFileSync(file, stamp(readFileSync(file, 'utf8')));
  n++;
}
console.log(`built ${OUT}/: stamped ${n} pages`, version);
