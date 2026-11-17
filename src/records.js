// Рекорды партий. Хранятся в браузере игрока; если хранилище недоступно,
// рекорды живут только до перезагрузки, а игра не ломается.
// Прототип и демонстрация анимации в зачёт не идут: там правила настраиваемые.

import { createStorage } from './storage.js';

export const RECORDS_KEY = 'promezhutok.records.v1';

const number = value => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

function sanitize(raw, limit) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const top = Array.isArray(source.top) ? source.top : [];
  const entries = top
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      score: number(Number(entry.score)),
      lines: number(Number(entry.lines)),
      date: typeof entry.date === 'string' ? entry.date : null,
    }))
    .filter(entry => entry.score > 0 || entry.lines > 0)
    .sort((a, b) => b.score - a.score || b.lines - a.lines)
    .slice(0, limit);
  return {
    bestScore: Math.max(number(Number(source.bestScore)), entries[0]?.score ?? 0, 0),
    bestLines: Math.max(number(Number(source.bestLines)), ...entries.map(entry => entry.lines), 0),
    games: number(Number(source.games)),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
    top: entries,
  };
}

export function createRecordStore({
  storage = createStorage(),
  key = RECORDS_KEY,
  now = () => new Date().toISOString(),
  limit = 5,
} = {}) {
  let state = sanitize(storage.read(key, null), limit);

  const persist = () => {
    state.updatedAt = now();
    storage.write(key, state);
    return state;
  };

  return {
    get available() {
      return storage.available;
    },
    get state() {
      return { ...state, top: state.top.map(entry => ({ ...entry })) };
    },
    // Возвращает, побит ли рекорд, и место результата в списке лучших.
    submit({ score = 0, lines = 0 } = {}) {
      const entry = { score: number(score), lines: number(lines) };
      if (entry.score === 0 && entry.lines === 0) return { record: false, rank: null, state: this.state };
      const record = entry.score > state.bestScore || entry.lines > state.bestLines;
      entry.date = now();
      state.games += 1;
      state.bestScore = Math.max(state.bestScore, entry.score);
      state.bestLines = Math.max(state.bestLines, entry.lines);
      const entries = [...state.top, entry].sort((a, b) => b.score - a.score || b.lines - a.lines);
      const place = entries.indexOf(entry);
      state.top = entries.slice(0, limit);
      persist();
      return { record, rank: place >= 0 && place < limit ? place + 1 : null, state: this.state };
    },
    clear() {
      state = { bestScore: 0, bestLines: 0, games: 0, updatedAt: null, top: [] };
      storage.remove(key);
      return this.state;
    },
  };
}
