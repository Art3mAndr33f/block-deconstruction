import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(document) {
  for (let i = 0; i < 100; i++) {
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
  return { dom, $ };
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
