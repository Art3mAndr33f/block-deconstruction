// Пословное появление цитаты. Идея: слова открываются в том же темпе, в каком
// их произносит синтезатор. События `boundary` приходят не во всех браузерах и
// не для всех голосов, поэтому у каждого слова есть резервное расписание; как
// только приходит настоящая граница, оставшиеся слова перепланируются.
// При системной настройке уменьшения движения цитата показывается сразу целиком.

export function splitWords(text) {
  const tokens = [];
  const pattern = /\S+/gu;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

export function estimateDuration(text, charsPerSecond = 15) {
  const characters = String(text ?? '').trim().length;
  return Math.max(600, (characters / Math.max(charsPerSecond, 1)) * 1000);
}

export function createQuoteReveal({
  element,
  text = '',
  reducedMotion = false,
  charsPerSecond = 15,
  onProgress = () => {},
} = {}) {
  const tokens = splitWords(String(text ?? ''));
  const weight = token => token.text.length + 1;
  const totalWeight = tokens.reduce((sum, token) => sum + weight(token), 0) || 1;
  let timers = [];
  let revealed = -1;
  let words = [];
  let done;
  let finished = false;

  const settle = () => {
    if (!finished) {
      finished = true;
      done?.();
    }
  };

  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  }

  function render() {
    element.textContent = '';
    element.classList.add('is-revealing');
    words = [];
    let last = 0;
    for (const token of tokens) {
      if (token.start > last) element.append(document.createTextNode(text.slice(last, token.start)));
      const span = document.createElement('span');
      span.className = 'quote-word';
      span.textContent = token.text;
      element.append(span);
      words.push(span);
      last = token.end;
    }
    if (last < text.length) element.append(document.createTextNode(text.slice(last)));
  }

  function revealThrough(index) {
    const target = Math.min(index, words.length - 1);
    if (target <= revealed) return;
    for (let i = revealed + 1; i <= target; i++) words[i].classList.add('is-visible');
    revealed = target;
    onProgress(revealed + 1, tokens.length);
    if (revealed >= words.length - 1) {
      clearTimers();
      element.classList.remove('is-revealing');
      settle();
    }
  }

  function revealAll() {
    clearTimers();
    revealThrough(words.length - 1);
    element.classList.remove('is-revealing');
    settle();
  }

  function schedule(from, durationMs) {
    clearTimers();
    const rest = tokens.slice(from);
    const restWeight = rest.reduce((sum, token) => sum + weight(token), 0) || 1;
    let passed = 0;
    rest.forEach((token, offset) => {
      passed += weight(token);
      const at = Math.max(20, (durationMs * passed) / restWeight);
      timers.push(setTimeout(() => revealThrough(from + offset), at));
    });
  }

  return {
    tokens,
    get words() {
      return [...words];
    },
    get finished() {
      return finished;
    },
    start(estimatedDurationMs = estimateDuration(text, charsPerSecond)) {
      finished = false;
      revealed = -1;
      render();
      if (!words.length || reducedMotion) {
        revealAll();
        return this;
      }
      schedule(0, estimatedDurationMs);
      return this;
    },
    // Вызывается на событии `boundary`: charIndex — позиция произносимого слова.
    revealTo(charIndex) {
      if (finished || !words.length) return;
      let index = -1;
      for (let i = 0; i < tokens.length; i++) if (tokens[i].start <= charIndex) index = i;
      revealThrough(index);
      if (finished) return;
      const restWeight = tokens.slice(index + 1).reduce((sum, token) => sum + weight(token), 0);
      schedule(index + 1, (restWeight / totalWeight) * estimateDuration(text, charsPerSecond));
    },
    finish: revealAll,
    stop: revealAll,
    whenDone() {
      if (finished) return Promise.resolve();
      return new Promise(resolve => {
        done = resolve;
      });
    },
  };
}
