import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFallFrames, fallKeyframes } from '../src/motion.js';

const blocks = (a, b) => [{ id: 1, y: a }, { id: 2, y: b }];

test('fall steps animate continuously without skipping a subsequent line clear', () => {
  const frames = [
    { type: 'fall', blocks: blocks(6, 9) },
    { type: 'fall', blocks: blocks(7, 9) },
    { type: 'clear', blocks: blocks(7, 9) },
  ];
  const { positions, nextIndex } = collectFallFrames(frames, 0, blocks(5, 8));
  assert.equal(nextIndex, 2);
  assert.equal(frames[nextIndex].type, 'clear');
  assert.deepEqual(fallKeyframes(positions, 1, 40), [
    { transform: 'translateY(-80px)', offset: 0 },
    { transform: 'translateY(-40px)', offset: 0.5 },
    { transform: 'translateY(0px)', offset: 1 },
  ]);
  assert.deepEqual(fallKeyframes(positions, 2, 40), [
    { transform: 'translateY(-40px)', offset: 0 },
    { transform: 'translateY(0px)', offset: 0.5 },
    { transform: 'translateY(0px)', offset: 1 },
  ]);
});

test('stationary and missing bricks do not create fall animations', () => {
  assert.deepEqual(fallKeyframes([blocks(3, 9), blocks(4, 9)], 2, 30), []);
  assert.deepEqual(fallKeyframes([blocks(3, 9), []], 1, 30), []);
});
