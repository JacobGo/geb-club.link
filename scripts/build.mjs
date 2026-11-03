// Copy public/ to dist/ and stamp static asset links with a content hash
// (/style.css -> /style.css?v=1a2b3c4d), so browsers fetch a changed file
// even though Cloudflare tells them to cache static assets for hours.
// Run by `npm run deploy`; local dev serves public/ directly.
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'public', OUT = 'dist';
const STAMPED = ['/style.css', '/favicon.svg'];

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

const version = Object.fromEntries(STAMPED.map((p) =>
  [p, createHash('sha256').update(readFileSync(join(SRC, p))).digest('hex').slice(0, 8)]));

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let n = 0;
for (const file of walk(OUT).filter((f) => f.endsWith('.html'))) {
  let html = readFileSync(file, 'utf8');
  for (const [asset, v] of Object.entries(version)) html = html.replaceAll(`"${asset}"`, `"${asset}?v=${v}"`);
  writeFileSync(file, html);
  n++;
}
console.log(`built ${OUT}/: stamped ${n} pages`, version);
