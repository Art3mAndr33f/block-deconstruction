import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = new URL('..', import.meta.url);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function build() {
  const dir = await mkdtemp(join(tmpdir(), 'promezhutok-'));
  const output = join(dir, 'promezhutok.html');
  const { execFile } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    execFile(process.execPath, [new URL('scripts/build-standalone.mjs', root).pathname, '--out', output],
      error => (error ? reject(error) : resolve()));
  });
  return { dir, output, html: await readFile(output, 'utf8') };
}

test('the standalone file keeps the whole game and no module syntax', async () => {
  const { dir, html } = await build();
  try {
    assert.ok(html.includes('<!doctype html>'));
    // Модули по протоколу file:// не работают: в файле не должно быть импортов.
    assert.equal(/^\s*import\s[\s\S]*?from\s/m.test(html), false, 'в файле остался import');
    assert.equal(/\bexport\s+(?:async\s+)?(?:function|const|let|class)\b/.test(html), false, 'в файле остался export');
    // Стили и вся игра перенесены внутрь.
    assert.ok(html.includes('.brick-inner'), 'стили не встроены');
    assert.ok(html.includes('<link rel="manifest"') === false, 'манифест не нужен без HTTPS');
    for (const marker of ['resolveBoard', 'createQuoteSelector', 'createSpeechController', 'createQuoteReveal', 'createRecordStore']) {
      assert.ok(html.includes(marker), `в сборке нет модуля с ${marker}`);
    }
    // Скрипт перенесён в конец body: классический скрипт выполняется сразу.
    assert.ok(html.indexOf('<script>') > html.indexOf('id="board"'));
    assert.ok(html.includes('board-title'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the standalone file starts and is playable without a server', async () => {
  const { dir, html } = await build();
  try {
    const errors = [];
    const dom = new JSDOM(html, {
      // Проверяем именно одиночный файл: без URL модулей и внешних ссылок.
      url: 'http://localhost/promezhutok.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.matchMedia = () => ({ matches: true });
        window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve() });
        window.addEventListener('error', event => errors.push(String(event.error ?? event.message)));
      },
    });
    try {
      await wait(200);
      const doc = dom.window.document;
      assert.deepEqual(errors, [], `ошибки при запуске: ${errors.join('; ')}`);
      assert.ok(doc.querySelectorAll('#board button.brick').length > 0, 'поле пустое');
      assert.equal(doc.querySelector('#score').textContent, '0');
      // Игровой режим по умолчанию: прототипные настройки скрыты, меню на месте.
      assert.equal(doc.body.classList.contains('play-mode'), true);
      assert.equal(doc.querySelector('#best-score').textContent, '0');
      assert.equal(doc.querySelector('#record-list').children.length, 1);
      assert.equal(doc.querySelector('#voice').disabled, true); // синтезатора речи в Node нет
      // Ход выполняется: блок выбирается и двигается стрелками.
      const brick = doc.querySelector('#board button.brick');
      brick.click();
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      assert.ok(doc.querySelector('#board .ghost'), 'призрак не появился');
      doc.querySelector('#cancel').click();
      assert.equal(doc.querySelector('#board .ghost'), null);
      assert.deepEqual(errors, [], `ошибки при ходе: ${errors.join('; ')}`);
    } finally {
      dom.window.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
