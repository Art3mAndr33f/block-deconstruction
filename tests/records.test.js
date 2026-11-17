import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { RECORDS_KEY, createRecordStore } from '../src/records.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
}

test('storage works without a backend and keeps values in memory', () => {
  const storage = createStorage(undefined);
  assert.equal(storage.available, false);
  assert.equal(storage.read('key', 'fallback'), 'fallback');
  assert.equal(storage.write('key', { a: 1 }), false);
  assert.deepEqual(storage.read('key'), { a: 1 });
  storage.remove('key');
  assert.equal(storage.read('key'), null);
});

test('a broken backend degrades to memory without throwing', () => {
  const failing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  const storage = createStorage(failing);
  assert.equal(storage.available, false);
  assert.equal(storage.read('key', 5), 5);
  storage.write('key', 1);
  storage.remove('key');
  assert.equal(storage.read('key', null), null);
});

test('records keep the best score, the best line count and a sorted top list', () => {
  const backend = fakeStorage();
  const store = createRecordStore({ storage: createStorage(backend), now: () => '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(store.state, { bestScore: 0, bestLines: 0, games: 0, updatedAt: null, top: [] });

  const first = store.submit({ score: 300, lines: 2 });
  assert.equal(first.record, true);
  assert.equal(first.rank, 1);
  const second = store.submit({ score: 100, lines: 4 });
  assert.equal(second.record, true); // рекорд по линиям
  assert.equal(second.rank, 2);
  const third = store.submit({ score: 200, lines: 1 });
  assert.equal(third.record, false);
  assert.equal(third.rank, 2);

  assert.equal(store.state.bestScore, 300);
  assert.equal(store.state.bestLines, 4);
  assert.equal(store.state.games, 3);
  assert.deepEqual(store.state.top.map(entry => entry.score), [300, 200, 100]);
  assert.ok(JSON.parse(backend.getItem(RECORDS_KEY)).bestScore === 300);
});

test('empty results are ignored and the list stays limited', () => {
  let clock = 0;
  const store = createRecordStore({ storage: createStorage(fakeStorage()), now: () => `d${clock++}`, limit: 3 });
  assert.deepEqual(store.submit({ score: 0, lines: 0 }), { record: false, rank: null, state: store.state });
  assert.equal(store.state.games, 0);
  for (const score of [100, 500, 200, 400, 300]) store.submit({ score, lines: 1 });
  assert.deepEqual(store.state.top.map(entry => entry.score), [500, 400, 300]);
  assert.equal(store.state.bestScore, 500);
});

test('stored records survive a reload, and damaged data is replaced by empty ones', () => {
  const backend = fakeStorage({ [RECORDS_KEY]: JSON.stringify({ bestScore: 900, bestLines: 7, top: [{ score: 900, lines: 7, date: 'd' }] }) });
  const restored = createRecordStore({ storage: createStorage(backend) });
  assert.equal(restored.state.bestScore, 900);
  assert.equal(restored.state.bestLines, 7);

  const broken = createRecordStore({
    storage: createStorage(fakeStorage({ [RECORDS_KEY]: '{"bestScore":"много","top":[null,{"score":-5},"x"],"games":null}' })),
  });
  assert.deepEqual(broken.state.top, []);
  assert.equal(broken.state.bestScore, 0);
  assert.equal(broken.state.games, 0);

  const alien = createRecordStore({ storage: createStorage(fakeStorage({ [RECORDS_KEY]: '"not an object"' })) });
  assert.deepEqual(alien.state.top, []);
});

test('clearing removes records from storage', () => {
  const backend = fakeStorage();
  const store = createRecordStore({ storage: createStorage(backend) });
  store.submit({ score: 700, lines: 3 });
  assert.ok(backend.getItem(RECORDS_KEY));
  store.clear();
  assert.equal(backend.getItem(RECORDS_KEY), null);
  assert.deepEqual(store.state, { bestScore: 0, bestLines: 0, games: 0, updatedAt: null, top: [] });
  assert.equal(store.available, true);
});
