// Snapshot Open Library data for every book the club has read into public/data/almanac.json,
// for /members/almanac. Re-run after adding a book: node scripts/almanac.mjs
// Books come from db/seed.sql (position, title, author). OVERRIDES pins a work when the
// title search picks the wrong one.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OVERRIDES = {
  // position: '/works/OL...W'
};
// Values Open Library gets wrong for our books (it dates some from a later reissue).
const CORRECTIONS = {
  2: { pages: 399 },  // The Traitor Baru Cormorant: no page count in OL
  6: { year: 1988 },  // The Dragon Never Sleeps: OL has a 2008 reissue
  14: { year: 1883 }, // The Gospel in Brief: OL has a 2004 edition
};

const seed = readFileSync('db/seed.sql', 'utf8');
const books = [...seed.matchAll(/VALUES \((\d+), '((?:[^']|'')*)', '((?:[^']|'')*)'\)/g)]
  .map(([, pos, title, author]) => ({ position: Number(pos), title: title.replace(/''/g, "'"), author: author.replace(/''/g, "'") }));

const FIELDS = 'key,title,author_name,first_publish_year,number_of_pages_median,subject,place,person,time,first_sentence,ratings_average,ratings_count,edition_count,language';
const get = async (url) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'geb-club.link almanac script' } });
    if (r.ok) return r.json();
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error(`failed: ${url}`);
};

// Tags OL mixes into subjects that aren't subjects.
const NOISE = /^(nyt:|award:|form:|series:|collectionid:|accessible book|protected daisy|in library|lending library|overdrive|large type|open library|fiction, general|general|english literature|literature|fiction|novel|reading level|translations into|history and criticism)/i;
const clean = (list = []) => [...new Set(list
  .map((s) => s.replace(/^genre:/i, '').replace(/\s+/g, ' ').trim())
  .filter((s) => s && !NOISE.test(s) && s.length < 60)
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()))];

// A work's description, as a quiz clue: links and footnotes stripped, cut to about two
// sentences, with the title's words and the author's names blanked out.
const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'to', 'on', 'for', 'with', 'never']);
function clue(desc, b) {
  let s = typeof desc === 'string' ? desc : desc?.value;
  if (!s) return null;
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*\[\d+\]:.*$/gm, '').replace(/\(\[source\]\[\d+\]\)/gi, '')
    .replace(/-{3,}[\s\S]*$/, '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  const sentences = s.match(/[^.!?]+[.!?]+["”’)]?\s*/g) ?? [s];
  let out = '';
  for (const x of sentences) { if (out && (out + x).length > 320) break; out += x; }
  const words = [...b.title.split(/[^\p{L}\d]+/u), ...b.author.replace(/\(.*\)/, '').split(/\s+/)]
    .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const w of words) out = out.replace(new RegExp(`(?<![\\p{L}\\d])${esc(w)}[\\p{L}']*`, 'giu'), '———');
  // descriptions misspell names ("Archilles"): also blank words one letter away from a title or author word
  const near = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };
  const long = words.filter((w) => w.length >= 5).map((w) => w.toLowerCase());
  out = out.replace(/[\p{L}']+/gu, (m) => (long.some((w) => near(m.toLowerCase(), w)) ? '———' : m));
  return out.replace(/\s*\.\s+\.(\s*\.)?/g, '… ').replace(/\s+/g, ' ').trim() || null;
}

// First sentences come in several editions and languages; prefer one that looks English.
const english = (list = []) => list.find((s) => /\b(the|a|and|of|was|is|I)\b/.test(s) && !/[äöüßéè]{2,}/.test(s)) ?? null;

const out = [];
for (const b of books) {
  const author = b.author.replace(/\s*\(.*\)/, '');
  let doc;
  if (OVERRIDES[b.position]) {
    const d = await get(`https://openlibrary.org/search.json?q=key:${encodeURIComponent(OVERRIDES[b.position])}&fields=${FIELDS}`);
    doc = d.docs[0];
  } else {
    const d = await get(`https://openlibrary.org/search.json?title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(author)}&limit=3&fields=${FIELDS}`);
    doc = d.docs.sort((x, y) => (y.edition_count ?? 0) - (x.edition_count ?? 0))[0];
    if (!doc) doc = (await get(`https://openlibrary.org/search.json?q=${encodeURIComponent(`${b.title} ${author}`)}&limit=1&fields=${FIELDS}`)).docs[0];
  }
  const work = doc?.key ? await get(`https://openlibrary.org${doc.key}.json`).catch(() => null) : null;
  out.push({
    position: b.position, title: b.title, author: b.author,
    ol_key: doc?.key ?? null,
    year: doc?.first_publish_year ?? null,
    pages: doc?.number_of_pages_median ?? null,
    editions: doc?.edition_count ?? null,
    rating: doc?.ratings_average ? Math.round(doc.ratings_average * 100) / 100 : null,
    ratings: doc?.ratings_count ?? null,
    first_sentence: english(doc?.first_sentence),
    description: clue(work?.description, b),
    subjects: clean(doc?.subject).slice(0, 40),
    places: clean(doc?.place).slice(0, 15),
    people: clean(doc?.person).slice(0, 15),
    times: clean(doc?.time).slice(0, 10),
    ...CORRECTIONS[b.position],
  });
  console.log(String(b.position).padStart(2), doc ? '✓' : '✗', b.title, '|', doc?.title, doc?.first_publish_year ?? '', doc?.number_of_pages_median ?? '');
  await new Promise((ok) => setTimeout(ok, 300));
}
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/almanac.json', JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), books: out }, null, 1));
console.log(`wrote public/data/almanac.json (${out.length} books)`);
