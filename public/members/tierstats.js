// Club-wide statistics from everyone's tier lists. Pure functions (tested in test/tierstats.test.js).

export const RANKED = ['S', 'A', 'B', 'C', 'D', 'F'];
export const SCORE = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

/**
 * books: [{ id, ... }]; entries: [{ member_id, book_id, tier }]
 * Returns one row per book: counts per tier (and N = didn't read), who put it where,
 * readers (members who ranked it S-F), mean score 0-5, spread (standard deviation),
 * and the consensus tier (the mean, rounded). Books nobody ranked get tier null.
 */
export function bookStats(books, entries) {
  return books.map((book) => {
    const mine = entries.filter((e) => e.book_id === book.id);
    const counts = Object.fromEntries([...RANKED, 'N'].map((t) => [t, 0]));
    const who = Object.fromEntries([...RANKED, 'N'].map((t) => [t, []]));
    for (const e of mine) { counts[e.tier]++; who[e.tier].push(e.member_id); }
    const scores = mine.filter((e) => e.tier in SCORE).map((e) => SCORE[e.tier]);
    const readers = scores.length;
    const mean = readers ? scores.reduce((a, b) => a + b, 0) / readers : null;
    const spread = readers > 1 ? Math.sqrt(scores.reduce((a, s) => a + (s - mean) ** 2, 0) / readers) : null;
    const tier = mean == null ? null : RANKED[5 - Math.round(mean)];
    return { book, counts, who, readers, mean, spread, tier };
  });
}

/**
 * How much each pair of members agrees: 1 - (average gap in score) / 5, over the books
 * both ranked S-F. Pairs with fewer than `minShared` books in common get null.
 * Returns { ids, get(a, b) -> { shared, agreement } }.
 */
export function agreement(entries, minShared = 3) {
  const by = new Map();
  for (const e of entries) {
    if (!(e.tier in SCORE)) continue;
    if (!by.has(e.member_id)) by.set(e.member_id, new Map());
    by.get(e.member_id).set(e.book_id, SCORE[e.tier]);
  }
  const ids = [...by.keys()];
  const cache = new Map();
  const get = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (cache.has(key)) return cache.get(key);
    const A = by.get(a), B = by.get(b);
    let shared = 0, gap = 0;
    if (A && B) for (const [book, s] of A) if (B.has(book)) { shared++; gap += Math.abs(s - B.get(book)); }
    const r = { shared, agreement: shared >= minShared ? 1 - gap / shared / 5 : null };
    cache.set(key, r);
    return r;
  };
  return { ids, get };
}

// ---------------------------------------------------------------- taste map

/**
 * Principal components of the members x books score table (missing scores count as the
 * book's average). Returns members' and books' positions on the two main axes:
 * a member sits toward the books they rated above the club's average.
 * { members: [{ id, x, y }], books: [{ id, x, y }], spread: [share of variance per axis] }
 */
export function tasteMap(entries, { minBooks = 3, minReaders = 2 } = {}) {
  const scores = new Map();
  for (const e of entries) if (e.tier in SCORE) (scores.get(e.member_id) ?? scores.set(e.member_id, new Map()).get(e.member_id)).set(e.book_id, SCORE[e.tier]);
  const members = [...scores.keys()].filter((m) => scores.get(m).size >= minBooks);
  const readers = {};
  for (const m of members) for (const b of scores.get(m).keys()) (readers[b] ??= []).push(scores.get(m).get(b));
  const books = Object.keys(readers).map(Number).filter((b) => readers[b].length >= minReaders);
  if (members.length < 3 || books.length < 2) return null;
  const mean = Object.fromEntries(books.map((b) => [b, readers[b].reduce((s, v) => s + v, 0) / readers[b].length]));
  const X = members.map((m) => books.map((b) => (scores.get(m).has(b) ? scores.get(m).get(b) - mean[b] : 0)));

  // top eigenvectors of X^T X by power iteration, deflating after each
  const B = books.length;
  const C = [...Array(B)].map((_, i) => [...Array(B)].map((_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
  const total = C.reduce((s, row, i) => s + row[i], 0) || 1;
  const axes = [], values = [];
  for (let k = 0; k < 2; k++) {
    let v = books.map((_, i) => Math.sin(i + 1 + k)); // deterministic start
    let lambda = 0;
    for (let it = 0; it < 300; it++) {
      const w = C.map((row) => row.reduce((s, c, j) => s + c * v[j], 0));
      lambda = Math.hypot(...w);
      if (!lambda) break;
      v = w.map((x) => x / lambda);
    }
    // fix the sign so results are stable: the largest component is positive
    const big = v.reduce((a, x, i) => (Math.abs(x) > Math.abs(v[a]) ? i : a), 0);
    if (v[big] < 0) v = v.map((x) => -x);
    axes.push(v); values.push(lambda);
    for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) C[i][j] -= lambda * v[i] * v[j];
  }
  return {
    members: members.map((id, r) => ({ id, x: X[r].reduce((s, x, i) => s + x * axes[0][i], 0), y: X[r].reduce((s, x, i) => s + x * axes[1][i], 0) })),
    books: books.map((id, i) => ({ id, x: axes[0][i], y: axes[1][i], mean: mean[id] })),
    spread: values.map((l) => l / total),
  };
}

/**
 * Predicted score (0-5) for each book a member hasn't ranked: the member's own average,
 * moved by how other members rated the book relative to their averages, weighted by how
 * much each agrees with this member (members who disagree count in reverse).
 */
export function predict(entries, memberId) {
  const ag = agreement(entries);
  const by = new Map();
  for (const e of entries) if (e.tier in SCORE) (by.get(e.member_id) ?? by.set(e.member_id, new Map()).get(e.member_id)).set(e.book_id, SCORE[e.tier]);
  const avg = (m) => { const s = [...(by.get(m)?.values() ?? [])]; return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 2.5; };
  const mine = by.get(memberId) ?? new Map(), myAvg = avg(memberId);
  const books = new Set(entries.filter((e) => e.tier in SCORE).map((e) => e.book_id));
  const out = [];
  for (const b of books) {
    if (mine.has(b)) continue;
    let num = 0, den = 0, n = 0;
    for (const [other, s] of by) {
      if (other === memberId || !s.has(b)) continue;
      const a = ag.get(memberId, other).agreement;
      if (a == null) continue;
      const sim = 2 * a - 1; // -1 opposite .. 1 identical
      num += sim * (s.get(b) - avg(other)); den += Math.abs(sim); n++;
    }
    if (!n) continue;
    const score = Math.max(0, Math.min(5, myAvg + (den ? num / den : 0)));
    out.push({ book_id: b, score, tier: RANKED[5 - Math.round(score)], basis: n });
  }
  return out.sort((x, y) => y.score - x.score);
}
