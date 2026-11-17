// Озвучка цитат через системный синтезатор речи (Web Speech API).
//
// Почему синтез речи, а не готовые аудиодорожки:
// · пользователь сможет добавить свой цитатник — текст озвучится без записи;
// · размер игры не растёт: десятки минут речи весили бы мегабайтами;
// · голос и темп можно выбрать в системе, дорожки пришлось бы перезаписывать.
// Что проигрываем: звучание зависит от устройства и браузера, на части платформ
// русского голоса нет вовсе. Поэтому озвучка — необязательная настройка, а при
// отсутствии синтезатора цитата просто появляется текстом (см. `supported`).

export function createSpeechController({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  locale = 'ru-RU',
  rate = 0.95,
  pitch = 1,
  volume = 1,
} = {}) {
  let voices = [];
  let listening = false;
  let speaking = false;
  let current = null;
  const listeners = new Set();

  const refresh = () => {
    try {
      voices = typeof synth?.getVoices === 'function' ? [...synth.getVoices()] : [];
    } catch {
      voices = [];
    }
    return voices;
  };

  const listen = () => {
    if (listening || typeof synth?.addEventListener !== 'function') return;
    listening = true;
    try {
      synth.addEventListener('voiceschanged', () => {
        refresh();
        for (const listener of listeners) listener([...voices]);
      });
    } catch {
      listening = false;
    }
  };

  listen();
  refresh();

  const shortLocale = locale.split('-')[0].toLowerCase();

  function preferredVoice() {
    const list = voices.length ? voices : refresh();
    return list.find(voice => (voice.lang ?? '').toLowerCase().replace('_', '-') === locale.toLowerCase())
      ?? list.find(voice => (voice.lang ?? '').toLowerCase().startsWith(shortLocale))
      ?? null;
  }

  function stop() {
    if (current) {
      current.onstart = null; current.onend = null; current.onerror = null; current.onboundary = null;
      current = null;
    }
    speaking = false;
    if (typeof synth?.cancel === 'function') {
      try {
        synth.cancel();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  return {
    get supported() {
      return Boolean(synth && typeof Utterance === 'function');
    },
    get speaking() {
      return speaking;
    },
    get locale() {
      return locale;
    },
    voices() {
      return voices.length ? [...voices] : refresh();
    },
    preferredVoice,
    // Часть браузеров отдаёт границы только по словам, часть — не отдаёт вовсе;
    // вызывающий код обязан иметь резервный таймер (см. src/reveal.js).
    speak(text, { onStart, onBoundary, onEnd, onError } = {}) {
      const phrase = String(text ?? '').trim();
      if (!phrase || !synth || typeof Utterance !== 'function' || typeof synth.speak !== 'function') return false;
      stop();
      let utterance;
      try {
        utterance = new Utterance(phrase);
      } catch {
        return false;
      }
      utterance.lang = locale;
      const voice = preferredVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = rate; utterance.pitch = pitch; utterance.volume = volume;
      utterance.onstart = () => { speaking = true; onStart?.(); };
      utterance.onboundary = event => onBoundary?.(Math.max(event?.charIndex ?? 0, 0), event);
      utterance.onend = () => { speaking = false; current = null; onEnd?.(); };
      utterance.onerror = event => { speaking = false; current = null; onError?.(event); };
      current = utterance;
      speaking = true;
      try {
        // Chrome приостанавливает очередь после cancel(); resume есть не везде.
        if (typeof synth.resume === 'function' && synth.paused) synth.resume();
        synth.speak(utterance);
        return true;
      } catch (error) {
        speaking = false; current = null;
        onError?.(error);
        return false;
      }
    },
    stop,
  };
}
