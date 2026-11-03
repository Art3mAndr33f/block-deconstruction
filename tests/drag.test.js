import test from 'node:test';
import assert from 'node:assert/strict';
import { canPreview, dragPosition, snapOffset, sweepAxis } from '../src/drag.js';

const brick = (id, x, y, length = 1) => ({ id, x, y, length });

test('fractional ghost motion stays within the field and out of other bricks', () => {
  const blocks = [brick(1, 1, 8, 2), brick(2, 3, 7, 2), brick(3, 1, 9, 2)];
  const ids = new Set([1]);
  assert.equal(canPreview(blocks, ids, 0, -0.4), true);
  assert.equal(canPreview(blocks, ids, 0, 0.1), false);
  assert.equal(canPreview(blocks, ids, 0.1, -0.4), false);
  assert.equal(canPreview(blocks, ids, -2, -1), false);
  assert.equal(canPreview(blocks, ids, 0, -1), true);
});

test('sideways drag becomes possible after lifting by the stud height', () => {
  const blocks = [brick(1, 2, 9, 2)], ids = new Set([1]);
  const start = { x: 0, y: 0 };
  assert.deepEqual(dragPosition(blocks, ids, start, { x: 1.2, y: -0.1 }, 0.12), { x: 0, y: -0.1 });
  const lifted = dragPosition(blocks, ids, start, { x: 1.2, y: -0.12 }, 0.12);
  assert.deepEqual(lifted, { x: 1.2, y: -0.12 });
  assert.deepEqual(snapOffset(blocks, ids, lifted), { x: 1, y: 0 });
});

test('fast drag cannot tunnel through adjacent bricks and clears them only with enough space', () => {
  const blocks = [brick(1, 1, 9, 2), brick(2, 3, 9, 2)], ids = new Set([1]);
  const blocked = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 5, y: -0.12 }, 0.12);
  assert.deepEqual(blocked, { x: 0, y: -0.12 });
  const cleared = dragPosition(blocks, ids, blocked, { x: 5, y: -1 }, 0.12);
  assert.deepEqual(cleared, { x: 5, y: -1 });
  assert.equal(canPreview(blocks, ids, cleared.x, cleared.y), true);
  assert.equal(sweepAxis(blocks, ids, { x: 0, y: 0 }, 'x', 7), 0);
});

test('drag and snapping respect walls, groups and collision-free paths', () => {
  const blocks = [brick(1, 0, 9), brick(2, 0, 8), brick(3, 2, 8)];
  const ids = new Set([1, 2]);
  const preview = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: -10, y: -0.2 }, 0.1);
  assert.deepEqual(preview, { x: 0, y: -0.2 });
  const right = dragPosition(blocks, ids, preview, { x: 10, y: -0.2 }, 0.1);
  assert.equal(right.x, 1); // group is stopped by block 3
  const snapped = snapOffset(blocks, ids, right);
  assert.ok(snapped);
  assert.equal(canPreview(blocks, ids, snapped.x, snapped.y), true);
});
