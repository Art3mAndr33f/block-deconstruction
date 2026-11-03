import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(document) {
  for (let i = 0; i < 400; i++) {
    if (!document.querySelector('#generate').disabled && document.querySelector('#board button.brick')) return;
    await wait(10);
  }
  throw new Error('game did not become ready');
}
async function setup(secondColumn) {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), { url: 'http://localhost/?mode=prototype' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  dom.window.matchMedia = () => ({ matches: true });
  const animations = [];
  dom.window.HTMLElement.prototype.animate = function (keyframes, options) {
    animations.push({ keyframes, options });
    return { finished: Promise.resolve() };
  };
  Math.random = () => 0;
  await import(`../src/main.js?test=${secondColumn}`);
  await ready(dom.window.document);
  const $ = selector => dom.window.document.querySelector(selector);
  for (const input of dom.window.document.querySelectorAll('.length-options input')) input.checked = input.value === '1';
  // Seven one-cell blocks in columns 0..6, then one in the chosen column.
  const numbers = [0, 0, ...Array.from({ length: 6 }, () => [0.5, 0, 0]).flat(), 0, (secondColumn + 0.1) / 8, 0];
  let index = 0;
  Math.random = () => numbers[index++] ?? 0;
  $('#reset').click();
  await ready(dom.window.document);
  assert.equal(dom.window.document.querySelectorAll('#board button.brick').length, 7);
  return { dom, $, animations };
}

const originalRandom = Math.random;
test('an empty field is refilled once after a manually generated clearing row', async () => {
  const { dom, $ } = await setup(7);
  try {
    $('#generate').click();
    await wait(100);
    await ready(dom.window.document);
    assert.equal($('#lines').textContent, 'ЛИНИЙ: 1');
    assert.equal($('#score').textContent, '100');
    assert.equal(dom.window.document.querySelectorAll('#board button.brick').length, 1);
  } finally { dom.window.close(); Math.random = originalRandom; }
});

test('automatic generation does not add a second row after an empty-field refill', async () => {
  const { dom, $ } = await setup(6);
  try {
    $('#generate').click();
    await wait(100);
    await ready(dom.window.document);
    assert.equal(dom.window.document.querySelectorAll('#board button.brick').length, 8);
    $('#bond').value = 'above'; $('#bond').dispatchEvent(new dom.window.Event('change'));
    $('#auto-row').checked = true;
    // Upper brick in column 7 lifts off its support, slides right, and fills the gap.
    const upper = [...dom.window.document.querySelectorAll('#board button.brick')].find(el => el.style.left === '75%' && el.style.top === '80%');
    assert.ok(upper);
    upper.click();
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    $('#place').click();
    await wait(150);
    await ready(dom.window.document);
    assert.equal($('#lines').textContent, 'ЛИНИЙ: 1');
    assert.equal($('#score').textContent, '100');
    assert.equal(dom.window.document.querySelectorAll('#board button.brick').length, 1);
  } finally { dom.window.close(); Math.random = originalRandom; }
});


test('the animation demo replays two clearing waves and refills the field', async () => {
  const { dom, $ } = await setup('demo');
  try {
    $('#animation-demo').click();
    await wait(40);
    assert.equal($('#animation-demo').disabled, true);
    assert.equal(dom.window.document.querySelectorAll('.clearing').length, 4);
    assert.equal($('#score').textContent, '100');
    await ready(dom.window.document);
    assert.equal($('#lines').textContent, 'ЛИНИЙ: 2');
    assert.equal($('#score').textContent, '300');
    assert.ok(dom.window.document.querySelector('#board button.brick'));
    assert.equal($('#animation-demo').disabled, false);
  } finally { dom.window.close(); Math.random = originalRandom; }
});

test('reset during a demo cancels its pending clearing phases', async () => {
  const { dom, $ } = await setup('cancel');
  try {
    $('#animation-demo').click();
    await wait(40);
    $('#reset').click();
    await ready(dom.window.document);
    await wait(800);
    assert.equal($('#lines').textContent, 'ЛИНИЙ: 0');
    assert.equal($('#score').textContent, '0');
    assert.equal(dom.window.document.querySelectorAll('.clearing').length, 0);
    assert.equal($('#board').classList.contains('is-burning'), false);
  } finally { dom.window.close(); Math.random = originalRandom; }
});


test('default fall speed is 15 cells per second without changing burn duration', async () => {
  const { dom, $ } = await setup('default-speed');
  try {
    assert.equal($('#fall-speed').value, '15');
    assert.equal($('#fall-speed-value').textContent, '15');
    assert.equal($('#burn-duration').value, '1.2');
  } finally { dom.window.close(); Math.random = originalRandom; }
});


test('fall remains animated under reduced motion and uses the accelerated duration', async () => {
  const { dom, $, animations } = await setup('accelerated-fall');
  try {
    animations.length = 0;
    $('#animation-demo').click();
    // jsdom has no renderer; the mock records the Web Animations API request.
    for (let i = 0; i < 250 && !animations.length; i++) await wait(10);
    assert.ok(animations.length > 0, 'fall animation was not requested');
    assert.ok(Math.abs(animations[0].options.duration - (2000 / 15)) < 1e-6);
    assert.equal(animations[0].options.easing, 'linear');
    assert.equal($('#fall-motion'), null);
    await ready(dom.window.document);
  } finally { dom.window.close(); Math.random = originalRandom; }
});
