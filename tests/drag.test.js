import test from 'node:test';
import assert from 'node:assert/strict';
import { canPreview, dragPosition, snapOffset, sweepAxis, hasMove } from '../src/drag.js';
const b = (id, x, y, length = 1) => ({ id, x, y, length });
const studs = { height: .12, maxWidth: .32, inset: .04 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('sideways is locked by an actual lower stud, not by the initial height', () => {
  const blocks = [b(1, 2, 8, 2), b(2, 2, 9, 2)], ids = new Set([1]);
  const blocked = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 1, y: -.05 }, studs);
  near(blocked.x, 0); near(blocked.y, -.05);
  const freed = dragPosition(blocks, ids, blocked, { x: 1, y: -.12 }, studs);
  near(freed.x, 1); near(freed.y, -.12);
  const open = [b(1, 2, 8, 2)];
  assert.deepEqual(dragPosition(open, ids, { x: 0, y: 0 }, { x: 1, y: 0 }, studs), { x: 1, y: 0 });
  assert.deepEqual(dragPosition(open, ids, { x: 0, y: 0 }, { x: 1, y: 1 }, studs), { x: 1, y: 1 });
});

test('a moving stud cannot slide through an upper block, and clearing it releases motion', () => {
  const blocks = [b(1, 1, 5), b(2, 3, 4)], ids = new Set([1]);
  const blocked = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 2, y: 0 }, studs);
  assert.ok(blocked.x > 1 && blocked.x < 2);
  const freed = dragPosition(blocks, ids, blocked, { x: 2, y: .15 }, studs);
  near(freed.x, 2); near(freed.y, .15);
});

test('a fixed stud prevents sliding a ghost through it from the side', () => {
  const blocks = [b(1, 1, 5), b(2, 3, 6)], ids = new Set([1]);
  const blocked = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 2, y: 0 }, studs);
  assert.ok(blocked.x > 1 && blocked.x < 2);
  const lifted = dragPosition(blocks, ids, blocked, { x: 2, y: -.12 }, studs);
  near(lifted.x, 2);
});

test('a one-cell block can enter a one-cell gap and snap into it', () => {
  const blocks = [b(1, 0, 4), b(2, 1, 5), b(3, 3, 5)], ids = new Set([1]);
  const above = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 2, y: -.2 }, studs);
  near(above.x, 2);
  const gap = dragPosition(blocks, ids, above, { x: 2, y: 1 }, studs);
  near(gap.x, 2); near(gap.y, 1);
  assert.deepEqual(snapOffset(blocks, ids, gap, studs), { x: 2, y: 1 });
});

test('a vertical sweep stops at protruding studs before contacting the body', () => {
  const down = [b(1, 2, 4), b(2, 2, 7)];
  near(sweepAxis(down, new Set([1]), { x: 0, y: 0 }, 'y', 5, studs), 1.88);
  const up = [b(1, 2, 8), b(2, 2, 5)];
  near(sweepAxis(up, new Set([1]), { x: 0, y: 0 }, 'y', -5, studs), -1.88);
});

test('extraction downwards, walls, and high-speed body collision remain safe', () => {
  const blocks = [b(1, 1, 5), b(2, 3, 5)], ids = new Set([1]);
  const below = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 0, y: 1 }, studs);
  near(below.y, 1);
  assert.equal(canPreview(blocks, ids, -2, 0), false);
  assert.equal(sweepAxis(blocks, ids, { x: 0, y: 0 }, 'x', 7, studs), 1);
  assert.equal(hasMove([b(1, 2, 0)], 'above', studs), true);
});

test('a slightly off-centre one-cell ghost is guided into a one-cell opening', () => {
  const blocks = [b(1, 2, 4), b(2, 0, 5, 2), b(3, 3, 5, 2)], ids = new Set([1]);
  // The pointer is slightly right of centre, as in the reported screenshot.
  for (const offset of [-0.14, 0.14, 0.35]) {
    const preview = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: offset, y: 1 }, studs);
    near(preview.x, 0); near(preview.y, 1);
    assert.deepEqual(snapOffset(blocks, ids, preview, studs), { x: 0, y: 1 });
  }
});

test('gap guidance never pushes a wider block through an opening', () => {
  const blocks = [b(1, 2, 4, 2), b(2, 0, 5, 2), b(3, 3, 5, 2)], ids = new Set([1]);
  const preview = dragPosition(blocks, ids, { x: 0, y: 0 }, { x: 0.14, y: 1 }, studs);
  assert.ok(preview.y < 1);
  assert.equal(canPreview(blocks, ids, preview.x, preview.y), true);
});
