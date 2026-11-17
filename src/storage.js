// Обёртка над localStorage. Игра должна работать и там, где хранилище недоступно:
// приватный режим, открытый файл в Safari, тесты в Node без DOM, переполненный диск.
export function createStorage(backend = globalThis.localStorage) {
  const memory = new Map();
  let usable = false;
  try {
    const probe = '__promezhutok_probe__';
    backend.setItem(probe, '1');
    backend.removeItem(probe);
    usable = true;
  } catch {
    usable = false;
  }

  return {
    get available() {
      return usable;
    },
    read(key, fallback = null) {
      if (memory.has(key)) return memory.get(key);
      if (!usable) return fallback;
      try {
        const raw = backend.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      memory.set(key, value);
      if (!usable) return false;
      try {
        backend.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        // Хранилище может переполниться уже после проверки: дальше работаем в памяти.
        usable = false;
        return false;
      }
    },
    remove(key) {
      memory.delete(key);
      if (!usable) return;
      try {
        backend.removeItem(key);
      } catch {
        usable = false;
      }
    },
  };
}
