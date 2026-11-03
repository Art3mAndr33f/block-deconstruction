import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullscreenController } from '../src/fullscreen.js';

function mockDocument(enabled = true) {
  const doc = new EventTarget();
  doc.fullscreenEnabled = enabled;
  doc.fullscreenElement = null;
  doc.documentElement = {
    requestFullscreen: async () => { doc.fullscreenElement = doc.documentElement; doc.dispatchEvent(new Event('fullscreenchange')); },
  };
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange')); };
  return doc;
}

test('native fullscreen can be entered, exited, and follows external Escape', async () => {
  const doc = mockDocument();
  let state;
  const controller = createFullscreenController(doc, value => { state = value; });
  assert.equal(state.active, false);
  await controller.toggle();
  assert.deepEqual(state, { native: true, fallback: false, active: true });
  doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(state.active, false);
  await controller.toggle(); await controller.toggle();
  assert.equal(state.active, false);
});

test('unavailable or rejected fullscreen opens a reversible viewport fallback', async () => {
  for (const disabled of [true, false]) {
    const doc = mockDocument(!disabled);
    if (!disabled) doc.documentElement.requestFullscreen = async () => { throw new Error('denied'); };
    let state;
    const controller = createFullscreenController(doc, value => { state = value; });
    await controller.toggle();
    assert.deepEqual(state, { native: false, fallback: true, active: true });
    assert.equal(controller.exitFallback(), true);
    assert.equal(state.active, false);
    assert.equal(controller.exitFallback(), false);
    await controller.toggle(); await controller.toggle();
    assert.equal(state.active, false);
  }
});
