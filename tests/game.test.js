import test from 'node:test';
import assert from 'node:assert/strict';
import { addRow, canGenerate, canMove, cellsFor, connectedIds, hasMove, makeRow, moveBlocks, resolveBoard, settle } from '../src/board.js';

const b = (id, x, y, length = 1) => ({ id, x, y, length });

test('generated rows always have at least one hole, at least one brick, and lengths 1–4', () => {
  const samples = [() => 0, () => 0.99999, Math.random];
  for (const random of samples) for (let i = 0; i < 1000; i++) {
    const row = makeRow(random);
    assert.ok(row.length > 0);
    const occupied = new Set();
    for (const piece of row) {
      assert.ok(piece.length >= 1 && piece.length <= 4);
      for (let x = piece.x; x < piece.x + piece.length; x++) { assert.ok(x >= 0 && x < 8); assert.ok(!occupied.has(x)); occupied.add(x); }
    }
    assert.ok(occupied.size < 8);
  }
});

test('connections are vertical and can include the whole structure or only the upper branch', () => {
  const blocks = [b(1, 1, 9, 3), b(2, 2, 8, 2), b(3, 3, 7), b(4, 4, 8), b(5, 0, 8, 2)];
  assert.deepEqual([...connectedIds(blocks, 2, 'all')].sort(), [1, 2, 3, 5]);
  assert.deepEqual([...connectedIds(blocks, 2, 'above')].sort(), [2, 3]);
  assert.deepEqual([...connectedIds(blocks, 4, 'all')], [4]); // horizontal contact does not bond
});

test('moves reject walls and other blocks but ignore their own occupied cells', () => {
  const blocks = [b(1, 0, 8, 3), b(2, 2, 7), b(3, 4, 8)];
  const ids = connectedIds(blocks, 1);
  assert.equal(canMove(blocks, ids, 0, -1), true);
  assert.equal(canMove(blocks, ids, 2, 0), false);
  assert.equal(canMove(blocks, ids, -1, 0), false);
  assert.deepEqual(moveBlocks(blocks, ids, 0, -1).map(x => x.y), [7, 6, 8]);
});

test('bottom row pushes up; top row falls; entry is blocked at top', () => {
  const existing = [b(1, 0, 9)]; const row = [{ x: 2, length: 2 }];
  assert.deepEqual(addRow(existing, row, 'bottom', 2), [b(1, 0, 8), b(2, 2, 9, 2)]);
  const top = addRow(existing, row, 'top', 2);
  assert.equal(top[1].y, 0);
  assert.equal(settle(top)[1].y, 9);
  assert.equal(canGenerate([b(1, 0, 0)], 'top'), false);
  assert.equal(addRow([b(1, 0, 0)], row, 'bottom', 2), null);
});

test('after a clear the upper and lower parts fall simultaneously', () => {
  const blocks = [b(1, 0, 6), b(2, 0, 7, 4), b(3, 4, 7, 4), b(4, 0, 8)];
  const result = resolveBoard(blocks);
  assert.equal(result.lines, 1); assert.equal(result.score, 100);
  assert.deepEqual(result.blocks.map(block => [block.id, block.y]), [[1, 8], [4, 9]]);
});

test('full lines clear, including cascades, and award combo points', () => {
  const blocks = [b(1, 0, 9, 4), b(2, 4, 9, 4), b(3, 0, 7, 4), b(4, 4, 6, 4)];
  const result = resolveBoard(blocks);
  assert.equal(result.lines, 2); assert.equal(result.combo, 2); assert.equal(result.score, 300);
  assert.deepEqual(result.blocks, []);
});

test('game over detection distinguishes useful moves from lifting and falling in place', () => {
  const full = Array.from({ length: 10 }, (_, y) => [b(y * 2 + 1, 0, y, 4), b(y * 2 + 2, 4, y, 4)]).flat();
  assert.equal(hasMove(full, 'all'), false);
  assert.equal(hasMove([b(1, 0, 9)], 'all'), true);
  assert.equal(cellsFor([b(1, 0, 9, 4)])[9].filter(Boolean).length, 4);
});

test('custom length selection is respected and never produces a full row', () => {
  for (const lengths of [[1], [5], [6], [2, 5, 6], [1, 2, 3, 4, 5, 6]]) {
    for (let i = 0; i < 300; i++) {
      const row = makeRow(Math.random, lengths);
      assert.ok(row.length > 0);
      assert.ok(row.every(b => lengths.includes(b.length)));
      assert.ok(row.reduce((sum, b) => sum + b.length, 0) < 8);
      for (let j = 1; j < row.length; j++) assert.ok(row[j - 1].x + row[j - 1].length <= row[j].x);
    }
  }
  assert.throws(() => makeRow(Math.random, []), RangeError);
  assert.deepEqual(makeRow(() => 0, [6]), [{ x: 0, length: 6 }]);
  assert.deepEqual(makeRow(() => 0.99999, [5]), [{ x: 3, length: 5 }]);
});

test('animation trace shows clearing before removal and synchronized falling', () => {
  const blocks = [b(1, 0, 6), b(2, 0, 7, 4), b(3, 4, 7, 4), b(4, 0, 8)];
  const traced = resolveBoard(blocks, { trace: true });
  assert.deepEqual(traced.frames.map(frame => frame.type), ['clear', 'remove', 'fall', 'fall']);
  assert.deepEqual(traced.frames[0].rows, [7]);
  assert.equal(traced.frames[0].blocks.length, 4);
  assert.deepEqual(traced.frames[1].blocks.map(block => block.id), [1, 4]);
  assert.deepEqual(traced.frames[2].blocks.map(block => block.y), [7, 9]);
  assert.deepEqual(traced.frames[3].blocks.map(block => block.y), [8, 9]);
  const plain = resolveBoard(blocks);
  assert.deepEqual(traced.blocks, plain.blocks);
  assert.equal(traced.score, plain.score);
  assert.equal(traced.lines, plain.lines);
});
