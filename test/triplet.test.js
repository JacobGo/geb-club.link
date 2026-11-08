import test from 'node:test';
import assert from 'node:assert/strict';
import { N, masks, filled, voxels } from '../public/triplet.js';

// Looking down each axis must show exactly that wall's letter: every lit cell of the
// letter has a cube somewhere along its line of sight, and no other cell does.
test('each shadow of the trip-let is exactly its letter', () => {
  const along = (f) => [...Array(N).keys()].some(f);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    assert.equal(along((x) => filled(x, b, a)), masks.left(a, b), `G at z=${a} y=${b}`);
    assert.equal(along((z) => filled(a, b, z)), masks.right(a, b), `E at x=${a} y=${b}`);
    assert.equal(along((y) => filled(a, y, b)), masks.floor(a, b), `B at x=${a} z=${b}`);
  }
});

test('the trip-let is one connected piece', () => {
  const cubes = voxels(), key = (v) => v.join();
  const all = new Set(cubes.map(key)), seen = new Set([key(cubes[0])]), queue = [cubes[0]];
  while (queue.length) {
    const [x, y, z] = queue.pop();
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const k = key([x + dx, y + dy, z + dz]);
      if (all.has(k) && !seen.has(k)) { seen.add(k); queue.push([x + dx, y + dy, z + dz]); }
    }
  }
  assert.equal(seen.size, all.size);
});
