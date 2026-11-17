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

// ---------------------------------------------------------------------------
// Цитаты, озвучка и рекорды
// ---------------------------------------------------------------------------
class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

function fakeSynth(voices = [{ name: 'Milena', lang: 'ru-RU' }]) {
  return {
    spoken: [],
    paused: false,
    cancelled: 0,
    getVoices: () => voices,
    speak(utterance) { this.spoken.push(utterance); },
    cancel() { this.cancelled += 1; },
  };
}

let tag = 0;
// Открывает игру заново в отдельном окне: режим, генератор случайных чисел,
// синтезатор речи и сохранённые рекорды задаются тестом.
async function open({ search = '?mode=prototype', value = 0.45, synth = null, records = null, reduced = true } = {}) {
  const state = { value };
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), { url: `http://localhost/${search}` });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.localStorage = dom.window.localStorage;
  dom.window.matchMedia = () => ({ matches: reduced });
  dom.window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve() });
  if (records) dom.window.localStorage.setItem('promezhutok.records.v1', JSON.stringify(records));
  if (synth) {
    globalThis.speechSynthesis = synth;
    globalThis.SpeechSynthesisUtterance = FakeUtterance;
  }
  Math.random = () => state.value;
  await import(`../src/main.js?test=extra-${tag++}`);
  await ready(dom.window.document);
  const $ = selector => dom.window.document.querySelector(selector);
  const setRandom = next => { state.value = next; };
  return { dom, $, setRandom, document: dom.window.document, window: dom.window };
}

function cleanup(dom, { synth = false } = {}) {
  dom.window.close();
  Math.random = originalRandom;
  delete globalThis.localStorage;
  if (synth) {
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  }
}

async function waitFor(check, timeout = 8000) {
  for (let i = 0; i < timeout / 20; i++) {
    if (check()) return;
    await wait(20);
  }
  throw new Error('condition was not met in time');
}

const words = doc => [...doc.querySelectorAll('#quote-text .quote-word')];
const shown = doc => words(doc).filter(word => word.classList.contains('is-visible')).length;

// Ряды из семи блоков в колонках 0..6 (значение 0.45) и в колонках 1..7 (0.5).
async function threeRows({ dom, $, setRandom, document }) {
  for (const input of document.querySelectorAll('.length-options input')) input.checked = input.value === '1';
  $('#direction').value = 'top';
  $('#bond').value = 'above';
  $('#auto-row').checked = true;
  $('#quotes').checked = true;
  $('#reset').click();
  await ready(document);
  $('#generate').click();
  await ready(document);
  await wait(50);
  setRandom(0.5); // следующий ряд займёт колонки 1..7 и добьёт нижний ряд
  $('#generate').click();
  await ready(document);
  await wait(50);
  assert.equal(document.querySelectorAll('#board button.brick').length, 21);
}

test('a quote appears when one line burns before and one after the new row', async () => {
  const game = await open();
  try {
    await threeRows(game);
    const { document, $, window } = game;
    // Верхний блок правого столбца уходит в пустую колонку 7 и заполняет нижний ряд.
    const upper = [...document.querySelectorAll('#board button.brick')].find(el => el.style.left === '75%' && el.style.top === '70%');
    assert.ok(upper, 'блок в колонке 6, ряду 7 не найден');
    upper.click();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    $('#place').click();
    await wait(300);
    await ready(document);
    await wait(300);
    assert.equal($('#lines').textContent, 'ЛИНИЙ: 2');
    assert.equal($('#score').textContent, '200');
    // Одна волна до появления ряда и одна после: цитата всё равно показывается.
    assert.equal($('#quote').hidden, false, 'цитата за ход не показана');
    assert.match($('#quote-source').textContent, /^Дао дэ цзин, глава \d+ · вольный перевод$/);
    assert.ok($('#quote-text').textContent.length > 20);
    // За ход выдаётся ровно одна цитата, а не по одной на волну.
    assert.equal(document.querySelectorAll('.quote-card').length, 1);
    $('#quote-dismiss').click();
    assert.equal($('#quote').hidden, true);
  } finally {
    cleanup(game.dom);
  }
});

test('no quote repeats back to back, and no quote appears without a trigger', async () => {
  const game = await open();
  try {
    await threeRows(game);
    const { document, $ } = game;
    const texts = [];
    for (let round = 0; round < 6; round++) {
      // Разный жребий на каждом показе: при постоянном значении выбор вырожден.
      game.setRandom(0.1 + round * 0.15);
      $('#animation-demo').click(); // две волны очистки за одно разрешение
      await wait(60);
      await ready(document);
      await wait(120);
      assert.equal($('#quote').hidden, false);
      texts.push($('#quote-text').textContent);
    }
    // Повтор подряд невозможен: только что показанная цитата имеет нулевой вес.
    for (let i = 1; i < texts.length; i++) {
      assert.notEqual(texts[i], texts[i - 1], `цитата повторилась подряд: ${texts[i]}`);
    }
    assert.ok(new Set(texts).size >= 4, `мало разных цитат: ${new Set(texts).size}`);
    // Цитата не появляется сама по себе: сбрасываем партию и смотрим карточку.
    $('#reset').click();
    await ready(document);
    assert.equal($('#quote').hidden, true);
  } finally {
    cleanup(game.dom);
  }
});

test('voiceover speaks the quote and the words follow the voice', async () => {
  const synth = fakeSynth();
  // Без уменьшения движения: слова должны открываться постепенно.
  const game = await open({ synth, reduced: false });
  try {
    const { document, $ } = game;
    assert.equal($('#voice').disabled, false, 'озвучка должна быть доступна с синтезатором');
    $('#quotes').checked = true;
    $('#voice').checked = true;
    $('#animation-demo').click();
    await waitFor(() => $('#quote').hidden === false);
    assert.equal($('#quote').hidden, false);
    const uttered = synth.spoken.at(-1);
    assert.ok(uttered, 'синтезатор не получил текст');
    assert.equal(uttered.lang, 'ru-RU');
    assert.equal(uttered.voice.name, 'Milena');
    assert.equal(uttered.text, $('#quote-text').textContent);
    assert.equal($('#quote-voice').hidden, false);
    assert.equal($('#quote-voice').textContent, '■ Остановить');

    // Слова закрыты до первого события границы и открываются по мере речи.
    assert.ok(words(document).length > 3);
    assert.equal(shown(document), 0);
    assert.equal(document.querySelector('#quote-text').textContent, uttered.text);
    const { splitWords } = await import('../src/reveal.js');
    const third = splitWords(uttered.text)[2].start;
    uttered.onboundary({ charIndex: third });
    assert.equal(shown(document), 3);

    // Кнопка останавливает речь, текст при этом остаётся прочитанным.
    const cancelled = synth.cancelled;
    $('#quote-voice').click();
    assert.ok(synth.cancelled > cancelled, 'кнопка не остановила речь');
    assert.equal(synth.spoken.length, 1, 'остановка не должна запускать новую фразу');
    assert.equal(shown(document), words(document).length);
    assert.equal($('#quote-voice').textContent, '▶ Озвучить');
    // Повторное нажатие читает цитату заново.
    $('#quote-voice').click();
    assert.equal(synth.spoken.length, 2);
    assert.equal($('#quote-voice').textContent, '■ Остановить');
    // Закрытие карточки останавливает речь.
    $('#quote-dismiss').click();
    assert.equal($('#quote').hidden, true);
    assert.ok(synth.cancelled >= 2);
  } finally {
    cleanup(game.dom, { synth: true });
  }
});

test('without the voice setting the quote is only shown, not spoken', async () => {
  const synth = fakeSynth();
  const game = await open({ synth, reduced: false });
  try {
    const { document, $ } = game;
    $('#quotes').checked = true;
    $('#animation-demo').click();
    await waitFor(() => $('#quote').hidden === false);
    assert.equal($('#quote').hidden, false);
    assert.equal(synth.spoken.length, 0);
    assert.equal($('#quote-voice').textContent, '▶ Озвучить');
    // Без событий границ слова открывает резервное расписание.
    await wait(1200);
    assert.ok(shown(document) >= 1, 'резервное расписание не открывает слова');
    assert.ok(shown(document) < words(document).length, 'слова открылись все сразу');
  } finally {
    cleanup(game.dom, { synth: true });
  }
});

test('records saved in the browser are shown and can be cleared', async () => {
  const stored = {
    bestScore: 1200, bestLines: 9, games: 4, updatedAt: '2026-01-02T00:00:00.000Z',
    top: [
      { score: 1200, lines: 9, date: '2026-01-01T00:00:00.000Z' },
      { score: 400, lines: 3, date: '2026-01-02T00:00:00.000Z' },
    ],
  };
  const game = await open({ search: '', records: stored });
  try {
    const { document, $ } = game;
    assert.equal(document.body.classList.contains('play-mode'), true);
    assert.equal($('#best-score').textContent, '1200');
    assert.equal($('#best-lines').textContent, '9');
    assert.equal($('#score-record').textContent, '1200');
    assert.equal($('#record-list').children.length, 2);
    assert.ok($('#record-list').textContent.includes('1200'));
    assert.ok($('#record-list').textContent.includes('9 линий'));
    // Первое нажатие только спрашивает, второе очищает.
    $('#clear-records').click();
    assert.equal($('#record-list').children.length, 2);
    assert.equal($('#best-score').textContent, '1200');
    assert.equal($('#clear-records').textContent, 'Точно очистить рекорды?');
    $('#clear-records').click();
    assert.equal($('#clear-records').textContent, 'Очистить рекорды');
    assert.equal($('#best-score').textContent, '0');
    assert.equal($('#best-lines').textContent, '0');
    assert.equal($('#record-list').children.length, 1);
    assert.equal(game.dom.window.localStorage.getItem('promezhutok.records.v1'), null);
  } finally {
    cleanup(game.dom);
  }
});

test('the prototype shows the records but never writes them', async () => {
  const game = await open();
  try {
    const { document, $ } = game;
    assert.equal(document.body.classList.contains('play-mode'), false);
    assert.ok($('#records-hint').textContent.includes('прототипе'));
    $('#animation-demo').click();
    await wait(60);
    await ready(document);
    await wait(100);
    assert.equal($('#lines').textContent, 'ЛИНИЙ: 2');
    assert.equal($('#best-score').textContent, '0');
    assert.equal(game.dom.window.localStorage.getItem('promezhutok.records.v1'), null);
  } finally {
    cleanup(game.dom);
  }
});
