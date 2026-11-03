import test from 'node:test';
import assert from 'node:assert/strict';
import { weightedStar, tally, replay, applyRound, emptyState, weightsFor, DEBT_PARAMS } from '../src/tally.js';

const B = (voter, scores) => ({ voter, scores });

test('plain STAR: runoff can overturn the score leader', () => {
  // A has the higher total thanks to one fan, but more voters prefer B.
  const ballots = [B('x', { A: 5, B: 0 }), B('y', { A: 3, B: 4 }), B('z', { A: 3, B: 4 })];
  const r = weightedStar(['A', 'B'], ballots);
  assert.equal(r.totals.A, 11);
  assert.equal(r.totals.B, 8);
  assert.equal(r.winner, 'B');
});

test('weights scale scores and runoff votes once each', () => {
  const ballots = [B('x', { A: 5, B: 0 }), B('y', { A: 0, B: 5 })];
  const r = weightedStar(['A', 'B'], ballots, { x: 2, y: 1 });
  assert.equal(r.totals.A, 10);
  assert.equal(r.runoff.A, 2);
  assert.equal(r.runoff.B, 1);
  assert.equal(r.winner, 'A');
});

test('scoring-round tie broken head-to-head', () => {
  // B and C tie for 2nd on totals (6 each); C beats B head-to-head 2-1.
  const ballots = [B('x', { A: 5, B: 4, C: 0 }), B('y', { A: 5, B: 1, C: 3 }), B('z', { A: 5, B: 1, C: 3 })];
  const r = weightedStar(['A', 'B', 'C'], ballots);
  assert.deepEqual(r.finalists, ['A', 'C']);
  assert.equal(r.tiebreaks[0].how, 'head-to-head wins among tied books');
});

test('runoff tie broken by score total, then five-stars', () => {
  const ballots = [B('x', { A: 5, B: 0 }), B('y', { A: 1, B: 2 })];
  const r = weightedStar(['A', 'B'], ballots);
  assert.equal(r.winner, 'A');
  assert.equal(r.tiebreaks[0].how, 'higher score total');

  const b2 = [B('x', { A: 5, B: 0 }), B('y', { A: 0, B: 4 }), B('z', { A: 0, B: 1 }), B('w', { A: 0, B: 0 })];
  // runoff A 1 vs B 2 → B wins outright; make a true tie instead:
  const b3 = [B('x', { A: 5, B: 3 }), B('y', { A: 3, B: 5 })];
  const r3 = weightedStar(['A', 'B'], b3);
  assert.equal(r3.tiebreaks[0].how, 'drawing lots');
  assert.equal(weightedStar(['A', 'B'], b3).winner, r3.winner, 'lots are deterministic');
  assert.equal(weightedStar(['A', 'B'], b2).winner, 'B');
});

test('debt goes to the unhappy, sums to zero, and raises their weight next time', () => {
  const st = emptyState();
  const cands = ['A', 'B'];
  applyRound(st, cands, [B('x', { A: 5, B: 0 }), B('y', { A: 5, B: 1 }), B('z', { A: 0, B: 5 })], 'A');
  assert.ok(st.debt.z > 0 && st.debt.x < 0);
  assert.ok(Math.abs(st.debt.x + st.debt.y + st.debt.z) < 1e-9);
  const w = weightsFor(st, ['x', 'y', 'z']);
  assert.ok(w.z > w.x);
});

test('newcomers start at median debt with reduced attendance weight', () => {
  const st = replay([{ candidates: ['A', 'B'], ballots: [B('x', { A: 5, B: 0 }), B('y', { A: 0, B: 5 }), B('z', { A: 4, B: 5 })], winner: 'A' }]);
  const w = weightsFor(st, ['new']);
  const med = [...Object.values(st.debt)].sort((a, b) => a - b)[1];
  assert.ok(Math.abs(w.new - DEBT_PARAMS.newcomerAttendance * Math.max(DEBT_PARAMS.floor, 1 + med)) < 1e-9);
});

test('plain STAR method ignores debt', () => {
  const st = emptyState();
  st.debt = { x: 5, y: -5 };
  const r = tally({ method: 'star', candidates: ['A', 'B'], ballots: [B('x', { A: 5, B: 0 }), B('y', { A: 0, B: 5 }), B('z', { A: 0, B: 5 })] }, st);
  assert.equal(r.winner, 'B');
  assert.deepEqual(r.weights, { x: 1, y: 1, z: 1 });
});
