import test from 'node:test';
import assert from 'node:assert/strict';
import { bookStats, agreement } from '../public/members/tierstats.js';

const E = (member_id, book_id, tier) => ({ member_id, book_id, tier });

test('book stats: mean, spread, consensus tier; N is not a score', () => {
  const books = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const [a, b, c] = bookStats(books, [E(1, 1, 'S'), E(2, 1, 'F'), E(3, 1, 'N'), E(1, 2, 'A'), E(2, 2, 'B')]);
  assert.equal(a.readers, 2); assert.equal(a.mean, 2.5); assert.equal(a.spread, 2.5); assert.equal(a.counts.N, 1);
  assert.equal(a.tier, 'B'); // halfway rounds up: 2.5 -> 3 = B
  assert.equal(b.mean, 3.5); assert.equal(b.tier, 'A');
  assert.equal(c.readers, 0); assert.equal(c.tier, null); assert.equal(c.spread, null);
});

test('agreement: 1 for identical lists, 0 for opposite ends, null below the minimum overlap', () => {
  const same = agreement([E(1, 1, 'S'), E(1, 2, 'C'), E(1, 3, 'F'), E(2, 1, 'S'), E(2, 2, 'C'), E(2, 3, 'F')]);
  assert.deepEqual(same.get(1, 2), { shared: 3, agreement: 1 });
  const opp = agreement([E(1, 1, 'S'), E(1, 2, 'S'), E(1, 3, 'F'), E(2, 1, 'F'), E(2, 2, 'F'), E(2, 3, 'S')]);
  assert.equal(opp.get(2, 1).agreement, 0);
  const few = agreement([E(1, 1, 'S'), E(1, 2, 'A'), E(2, 1, 'S'), E(2, 2, 'A'), E(2, 3, 'N'), E(1, 3, 'B')]);
  assert.deepEqual(few.get(1, 2), { shared: 2, agreement: null });
});

import { tasteMap, predict } from '../public/members/tierstats.js';

test('taste map: members who agree land together, opposite members apart', () => {
  // members 1 and 2 love book 10 and hate book 11; member 3 the reverse; 4 is in between
  const es = [];
  const rate = (m, pairs) => pairs.forEach(([b, t]) => es.push(E(m, b, t)));
  rate(1, [[10, 'S'], [11, 'F'], [12, 'B']]);
  rate(2, [[10, 'A'], [11, 'D'], [12, 'B']]);
  rate(3, [[10, 'F'], [11, 'S'], [12, 'B']]);
  rate(4, [[10, 'C'], [11, 'C'], [12, 'B']]);
  const map = tasteMap(es);
  const at = (id) => map.members.find((m) => m.id === id);
  assert.ok(Math.sign(at(1).x) === Math.sign(at(2).x));
  assert.ok(Math.sign(at(1).x) !== Math.sign(at(3).x));
  assert.ok(Math.abs(at(4).x) < Math.abs(at(1).x));
  assert.ok(map.spread[0] > 0.9); // one axis explains nearly everything
});

test('predict: borrow from members who agree', () => {
  const es = [];
  const rate = (m, pairs) => pairs.forEach(([b, t]) => es.push(E(m, b, t)));
  rate(1, [[1, 'S'], [2, 'F'], [3, 'S']]);           // hasn't ranked 4
  rate(2, [[1, 'S'], [2, 'F'], [3, 'S'], [4, 'S']]); // agrees with 1, loves 4
  rate(3, [[1, 'F'], [2, 'S'], [3, 'F'], [4, 'F']]); // disagrees with 1, hates 4
  const [p] = predict(es, 1);
  assert.equal(p.book_id, 4);
  assert.ok(p.score > 3.5, `predicted ${p.score}`);
});
