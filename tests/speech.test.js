import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechController } from '../src/speech.js';

function fakeSynth(voices = []) {
  const events = new Map();
  const spoken = [];
  return {
    spoken,
    paused: false,
    cancelled: 0,
    resumed: 0,
    getVoices: () => voices,
    addEventListener: (name, handler) => events.set(name, handler),
    dispatchVoicesChanged() {
      voices.push({ name: 'поздний голос', lang: 'ru-RU' });
      events.get('voiceschanged')?.();
    },
    speak: utterance => spoken.push(utterance),
    cancel() { this.cancelled++; },
    resume() { this.resumed++; },
  };
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    FakeUtterance.last = this;
  }
}

test('without a synthesizer speech is unsupported and never throws', () => {
  const speech = createSpeechController({ synth: undefined, Utterance: undefined });
  assert.equal(speech.supported, false);
  assert.equal(speech.speak('текст'), false);
  assert.equal(speech.stop(), false);
  assert.deepEqual(speech.voices(), []);
  assert.equal(speech.preferredVoice(), null);
  assert.equal(speech.speaking, false);
});

test('speech chooses a Russian voice and reports events', () => {
  const synth = fakeSynth([
    { name: 'Anna', lang: 'en-US' },
    { name: 'Milena', lang: 'ru-RU' },
    { name: 'Yuri', lang: 'ru-RU' },
  ]);
  const speech = createSpeechController({ synth, Utterance: FakeUtterance, rate: 0.9 });
  assert.equal(speech.supported, true);
  assert.equal(speech.preferredVoice().name, 'Milena');

  const seen = { start: 0, boundary: [], end: 0, error: 0 };
  assert.equal(speech.speak('  Мягкая вода точит камень  ', {
    onStart: () => seen.start++,
    onBoundary: index => seen.boundary.push(index),
    onEnd: () => seen.end++,
    onError: () => seen.error++,
  }), true);
  const utterance = synth.spoken.at(-1);
  assert.equal(utterance.text, 'Мягкая вода точит камень');
  assert.equal(utterance.lang, 'ru-RU');
  assert.equal(utterance.voice.name, 'Milena');
  assert.equal(utterance.rate, 0.9);
  assert.equal(speech.speaking, true);

  utterance.onstart(); utterance.onboundary({ charIndex: 7 });
  utterance.onboundary({ charIndex: 14 });
  utterance.onend();
  assert.equal(seen.start, 1);
  assert.deepEqual(seen.boundary, [7, 14]);
  assert.equal(seen.end, 1);
  assert.equal(speech.speaking, false);
});

test('a missing boundary index is reported as zero, not undefined', () => {
  const synth = fakeSynth([{ name: 'Milena', lang: 'ru_RU' }]);
  const speech = createSpeechController({ synth, Utterance: FakeUtterance });
  const indexes = [];
  speech.speak('фраза', { onBoundary: index => indexes.push(index) });
  const utterance = synth.spoken.at(-1);
  assert.equal(utterance.voice.name, 'Milena'); // подчёркивание в коде локали не мешает
  utterance.onboundary({});
  utterance.onboundary({ charIndex: -3 });
  assert.deepEqual(indexes, [0, 0]);
});

test('a new phrase cancels the previous one, and stop reports its result', () => {
  const synth = fakeSynth([{ name: 'Milena', lang: 'ru-RU' }]);
  const speech = createSpeechController({ synth, Utterance: FakeUtterance });
  let errors = 0;
  speech.speak('первая фраза', { onError: () => errors++ });
  speech.speak('вторая фраза');
  // Перед каждой фразой очередь очищается, иначе фразы встают друг за другом.
  assert.equal(synth.cancelled, 2);
  assert.equal(synth.spoken.length, 2);
  // Прерванная фраза не считается ошибкой: обработчики сняты при отмене.
  assert.equal(synth.spoken[0].onerror, null);
  assert.equal(errors, 0);
  assert.equal(speech.stop(), true);
  assert.equal(synth.cancelled, 3);
  assert.equal(speech.speak(''), false);
});

test('a synthesizer that throws is reported through onError', () => {
  const synth = fakeSynth();
  synth.speak = () => { throw new Error('no output device'); };
  const speech = createSpeechController({ synth, Utterance: FakeUtterance });
  let error = null;
  assert.equal(speech.speak('фраза', { onError: event => { error = event; } }), false);
  assert.ok(error instanceof Error);
  assert.equal(speech.speaking, false);
});

test('voices that load late are picked up', () => {
  const synth = fakeSynth([]);
  const speech = createSpeechController({ synth, Utterance: FakeUtterance });
  assert.equal(speech.preferredVoice(), null);
  synth.dispatchVoicesChanged();
  assert.equal(speech.preferredVoice().name, 'поздний голос');
  assert.equal(speech.voices().length, 1);
});

test('without a Russian voice the phrase is still spoken with the Russian locale', () => {
  const synth = fakeSynth([{ name: 'Alex', lang: 'en-US' }]);
  const speech = createSpeechController({ synth, Utterance: FakeUtterance });
  speech.speak('фраза');
  const utterance = synth.spoken.at(-1);
  assert.equal(utterance.lang, 'ru-RU');
  assert.equal(utterance.voice, undefined); // голос не подменяется чужим
});
