import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RECOVERY, THEMES, createQuoteSelector, lexicalSimilarity, nextWeights,
  quoteSource, recoverWeights, taoTeChing, themeSimilarity, weightedPick,
} from '../src/quotes.js';

test('the collection is a usable set of short free renderings with chapters', () => {
  assert.ok(taoTeChing.length >= 24, `expected an expanded collection, got ${taoTeChing.length}`);
  const ids = new Set();
  for (const quote of taoTeChing) {
    assert.ok(quote.id && !ids.has(quote.id), `duplicate id: ${quote.id}`);
    ids.add(quote.id);
    assert.ok(Number.isInteger(quote.chapter) && quote.chapter >= 1 && quote.chapter <= 81);
    assert.ok(quote.text.length > 20 && quote.text.length < 160, `suspicious length: ${quote.text}`);
    assert.ok(!/\s{2,}/.test(quote.text));
    assert.ok(quote.themes.length > 0 && quote.themes.every(theme => THEMES.includes(theme)), `bad themes: ${quote.id}`);
    assert.equal(quoteSource(quote), `Дао дэ цзин, глава ${quote.chapter} · вольный перевод`);
  }
  const texts = new Set(taoTeChing.map(quote => quote.text));
  assert.equal(texts.size, taoTeChing.length, 'quote texts must be unique');
});

test('weights start uniform, drop to zero for the picked quote and recover gradually', () => {
  const uniform = [1, 1, 1, 1];
  assert.deepEqual(recoverWeights(uniform), uniform);
  assert.deepEqual(nextWeights(uniform, 2), [1, 1, 0, 1]);
  // Выбранная обнуляется, прежняя возвращает половину расстояния до единицы.
  assert.deepEqual(nextWeights(nextWeights(uniform, 1), 2), [1, 0.5, 0, 1]);
  assert.deepEqual(nextWeights(nextWeights(nextWeights(uniform, 1), 2), 3), [1, 0.75, 0.5, 0]);
  assert.deepEqual(recoverWeights([0, 0.5, 1]), [0.5, 0.75, 1]);
  assert.deepEqual(recoverWeights([0, 1], 1), [1, 1]);
  assert.deepEqual(recoverWeights([0, 1], 0), [0, 1]);
});

test('weighted pick follows the weights and falls back to uniform', () => {
  assert.equal(weightedPick([1, 1, 1, 1], () => 0.75), 3);
  assert.equal(weightedPick([1, 1, 1, 1], () => 0.5), 2);
  assert.equal(weightedPick([0, 0, 1], () => 0.1), 2);
  // Все веса нулевые (например, цитата одна) — выбор снова равномерный.
  assert.equal(weightedPick([0, 0], () => 0.6), 1);
  assert.equal(weightedPick([], () => 0), 0);
});

test('a freshly shown quote does not repeat while others are available', () => {
  let ticket = 0;
  const selector = createQuoteSelector({ quotes: taoTeChing, random: () => ticket });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    ticket = i / 12;
    seen.push(selector.pick().id);
  }
  assert.equal(new Set(seen).size, seen.length, `repeats in ${seen.join(', ')}`);
  assert.equal(selector.history.length, 12);
});

test('the previous quote recovers its weight after a few draws', () => {
  const quotes = [{ id: 'a', text: 'первая цитата' }, { id: 'b', text: 'вторая цитата' }, { id: 'c', text: 'третья цитата' }];
  const index = id => quotes.findIndex(quote => quote.id === id);
  const selector = createQuoteSelector({ quotes, random: () => 0.99, recovery: DEFAULT_RECOVERY });
  const first = selector.pick();
  assert.deepEqual(selector.weights, [1, 1, 0]);
  // Второй раз подряд ту же цитату выбрать нельзя: её вес равен нулю.
  const second = selector.pick();
  assert.notEqual(second.id, first.id);
  assert.equal(selector.weights[index(first.id)], 0.5);
  assert.equal(selector.weights[index(second.id)], 0);
  const third = selector.pick();
  assert.notEqual(third.id, second.id);
  assert.equal(selector.weights[index(second.id)], 0.5);
  assert.equal(selector.weights[index(third.id)], 0);
});

test('history is restored between sessions, so recent quotes stay unlikely', () => {
  const quotes = [{ id: 'a', text: 'первая цитата' }, { id: 'b', text: 'вторая цитата' }, { id: 'c', text: 'третья цитата' }];
  const restored = createQuoteSelector({ quotes, random: () => 0.99, history: ['a', 'b'] });
  assert.deepEqual(restored.history, ['a', 'b']);
  assert.deepEqual(restored.weights, [0.5, 0, 1]);
  assert.equal(restored.pick().id, 'c');
  const unknown = createQuoteSelector({ quotes, random: () => 0.99, history: ['нет такой'] });
  assert.deepEqual(unknown.weights, [1, 1, 1]);
});

test('a single quote can repeat, and an empty collection is rejected', () => {
  const only = createQuoteSelector({ quotes: [{ id: 'a', text: 'одна цитата' }], random: () => 0.5 });
  assert.equal(only.pick().id, 'a');
  assert.equal(only.pick().id, 'a');
  assert.throws(() => createQuoteSelector({ quotes: [] }), RangeError);
});

test('similarity helpers measure theme and lexical overlap', () => {
  const soft = { text: 'мягкая вода точит камень', themes: ['мягкость'] };
  const softer = { text: 'мягкая вода точит камень', themes: ['мягкость'] };
  const strict = { text: 'имя и слава тревожат сердце', themes: ['мера'] };
  assert.equal(themeSimilarity(soft, softer), 1);
  assert.equal(themeSimilarity(soft, strict), 0);
  assert.equal(themeSimilarity(soft, { themes: ['мягкость', 'покой'] }), 0.5);
  assert.equal(lexicalSimilarity(soft, softer), 1);
  assert.equal(lexicalSimilarity(soft.text, strict.text), 0);
  assert.ok(lexicalSimilarity('мягкая вода точит камень', 'вода точит твёрдый камень') > 0.4);
  assert.equal(lexicalSimilarity('', 'совсем другой текст'), 0);
});

test('a semantic boost shifts probability towards close quotes without repeats', () => {
  const quotes = [
    { id: 'a', text: 'мягкая вода точит камень', themes: ['мягкость'] },
    { id: 'b', text: 'мягкая трава гнётся под ветром', themes: ['мягкость'] },
    { id: 'c', text: 'имя и слава тревожат сердце', themes: ['мера'] },
  ];
  const context = { text: 'мягкое побеждает твёрдое', themes: ['мягкость'] };
  // «Сто игроков» с равномерно растущим жребием: считаем долю каждой цитаты
  // на первом выборе, где веса ещё одинаковы.
  const share = boost => {
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 100; i++) {
      let ticket = i / 100 + 0.005;
      const selector = createQuoteSelector({
        quotes, random: () => ticket, similarity: themeSimilarity, boost,
      });
      counts[selector.pick(context).id] += 1;
    }
    return counts;
  };
  const plain = share(0);
  assert.ok(Math.abs(plain.c - plain.a) <= 2, `ожидалось равномерное распределение: ${JSON.stringify(plain)}`);
  const boosted = share(3);
  assert.ok(boosted.c < plain.c, `дальняя цитата не стала реже: ${JSON.stringify(boosted)}`);
  assert.ok(boosted.a > plain.a && boosted.b > plain.b, `близкие цитаты не стали чаще: ${JSON.stringify(boosted)}`);

  // Усиление не отменяет защиту от повторов.
  const selector = createQuoteSelector({ quotes, random: () => 0.5, similarity: themeSimilarity, boost: 3 });
  const picks = [];
  for (let i = 0; i < 6; i++) picks.push(selector.pick(context).id);
  for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1], `повтор подряд: ${picks.join(', ')}`);
  assert.ok(new Set(picks).size > 1, 'усиление не должно привязывать к одной цитате');
});
