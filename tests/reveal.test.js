import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createQuoteReveal, estimateDuration, splitWords } from '../src/reveal.js';

const dom = new JSDOM('<!doctype html><blockquote id="quote"></blockquote>');
globalThis.document = dom.window.document;
const element = () => {
  const node = dom.window.document.querySelector('#quote');
  node.textContent = '';
  node.className = '';
  return node;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const visible = node => [...node.querySelectorAll('.quote-word')].filter(word => word.classList.contains('is-visible')).length;

test('text is split into words with their positions', () => {
  assert.deepEqual(splitWords('Путь в тысячу ли'), [
    { text: 'Путь', start: 0, end: 4 },
    { text: 'в', start: 5, end: 6 },
    { text: 'тысячу', start: 7, end: 13 },
    { text: 'ли', start: 14, end: 16 },
  ]);
  assert.deepEqual(splitWords(''), []);
  assert.deepEqual(splitWords('  '), []);
});

test('the estimate grows with the phrase length', () => {
  assert.equal(estimateDuration('', 10), 600);
  assert.equal(estimateDuration('а'.repeat(100), 10), 10000);
  assert.equal(estimateDuration('а'.repeat(20), 20), 1000);
});

test('words appear one after another by the fallback schedule', async () => {
  const node = element();
  const reveal = createQuoteReveal({ element: node, text: 'Мягкая вода точит камень веками', charsPerSecond: 100 });
  reveal.start(240);
  assert.equal(reveal.words.length, 5);
  assert.equal(visible(node), 0);
  assert.equal(node.textContent, 'Мягкая вода точит камень веками'); // текст доступен сразу
  await wait(80);
  assert.ok(visible(node) >= 1 && visible(node) < 5, `промежуточное состояние: ${visible(node)}`);
  await reveal.whenDone();
  assert.equal(visible(node), 5);
  assert.equal(reveal.finished, true);
});

test('a boundary event jumps to the spoken word and reschedules the rest', async () => {
  const node = element();
  const text = 'Мягкая вода точит камень и не спешит';
  const reveal = createQuoteReveal({ element: node, text, charsPerSecond: 100 });
  reveal.start(estimateDuration(text, 100));
  reveal.revealTo(splitWords(text)[3].start); // произнесено четвёртое слово
  assert.equal(visible(node), 4);
  reveal.finish();
  assert.equal(visible(node), 7);
  await reveal.whenDone();
  assert.equal(visible(node), 7);
});

test('reduced motion shows the whole phrase at once without timers', () => {
  const node = element();
  const reveal = createQuoteReveal({ element: node, text: 'Путь в тысячу ли начинается с первого шага', reducedMotion: true });
  reveal.start(5000);
  assert.equal(visible(node), reveal.words.length);
  assert.equal(reveal.finished, true);
});

test('stop reveals the phrase and resolves the waiters', async () => {
  const node = element();
  const reveal = createQuoteReveal({ element: node, text: 'Кто умеет довольствоваться тот богат', charsPerSecond: 100 });
  reveal.start(4000);
  reveal.stop();
  assert.equal(visible(node), reveal.words.length);
  await reveal.whenDone();
  assert.equal(reveal.finished, true);
});

test('an empty phrase finishes immediately', () => {
  const node = element();
  const reveal = createQuoteReveal({ element: node, text: '' });
  reveal.start();
  assert.equal(reveal.finished, true);
  assert.equal(node.textContent, '');
});
