import { BOARD_COLUMNS, BOARD_ROWS, addRow, canGenerate, canMove, connectedIds, isMoveGameOver, makeRow, moveBlocks, resolveBoard } from './board.js?v=8';
import { createFullscreenController } from './fullscreen.js?v=8';
import { dragPosition, snapOffset, hasMove, sweepAxis } from './drag.js?v=8';
import { collectFallFrames, fallKeyframes } from './motion.js?v=8';

const $ = selector => document.querySelector(selector);
const boardEl = $('#board'), messageEl = $('#message');
const strips = { top: $('#next-top'), bottom: $('#next-bottom') };
const bondEl = $('#bond'), directionEl = $('#direction'), autoRowEl = $('#auto-row');
const prototype = new URLSearchParams(location.search).get('mode') === 'prototype';
document.body.classList.toggle('play-mode', !prototype);
if (!prototype) { bondEl.value = 'above'; directionEl.value = 'random'; autoRowEl.checked = true; }
$('#mode-link').href = prototype ? location.pathname : '?mode=prototype';
$('#mode-link').textContent = prototype ? 'Играть ↗' : 'Прототип ↗';
const quotes = [
  { text: 'Знающий других мудр; знающий себя просветлён.', source: 'Дао дэ цзин, глава 33 · вольный перевод' },
  { text: 'Путь в тысячу ли начинается с первого шага.', source: 'Дао дэ цзин, глава 64 · вольный перевод' },
  { text: 'Кто умеет довольствоваться, тот богат.', source: 'Дао дэ цзин, глава 33 · вольный перевод' },
];
function showQuote() {
  if (!$('#quotes').checked) return;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  $('#quote-text').textContent = quote.text; $('#quote-source').textContent = quote.source; $('#quote').hidden = false;
}
function geometry() {
  const style = getComputedStyle(boardEl), rect = boardEl.getBoundingClientRect();
  const w = rect.width / BOARD_COLUMNS || 50, h = rect.height / BOARD_ROWS || 50;
  return { height: (parseFloat(style.getPropertyValue('--stud-height')) || 6) / h,
    maxWidth: (parseFloat(style.getPropertyValue('--stud-max-width')) || 16) / w,
    inset: (parseFloat(style.getPropertyValue('--brick-inset')) || 3) / w };
}
let blocks, next, nextId, score, lines, selection, gameOver, pointer;
let busy = false, epoch = 0, clearRows = [];
const lengthInputs = [...document.querySelectorAll('.length-options input')];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = ms => new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : ms));
const allowedLengths = () => lengthInputs.filter(input => input.checked).map(input => Number(input.value));
function makeNext(direction = directionEl.value === 'random' ? (Math.random() < 0.5 ? 'top' : 'bottom') : directionEl.value) {
  return { row: makeRow(Math.random, allowedLengths()), direction };
}

function say(text, error = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle('error', error);
}
function newGame() {
  epoch++; busy = false; clearRows = [];
  blocks = []; nextId = 1; score = 0; lines = 0; selection = null; gameOver = false; pointer = null;
  next = makeNext(); $('#quote').hidden = true;
  generate(true);
}
function checkGameOver({ afterMove = false, wasFullHeight = false } = {}) {
  const blocked = !canGenerate(blocks, next.direction);
  gameOver = (afterMove && isMoveGameOver(blocks, wasFullHeight, autoRowEl.checked)) || (blocked && !hasMove(blocks, bondEl.value, geometry()));
  if (gameOver) say(`Игра окончена. Счёт: ${score}. Начните заново, чтобы попробовать ещё раз.`, true);
}
async function animateResolution(initialMessage, { fromGhost = false, afterMove = false, wasFullHeight = false } = {}) {
  const action = ++epoch;
  busy = true;
  const baseScore = score, baseLines = lines;
  const result = resolveBoard(blocks, { trace: true });
  say(initialMessage); render({ fromGhost });
  await pause(240);
  if (action !== epoch) return false;
  for (let i = 0; i < result.frames.length; i++) {
    const frame = result.frames[i];
    if (frame.type === 'fall') {
      // Replay all consecutive gravity steps as one continuous linear animation.
      // Each brick has its own keyframes, so earlier landings stay synchronized.
      const { positions, nextIndex } = collectFallFrames(result.frames, i, blocks);
      i = nextIndex - 1;
      blocks = positions.at(-1); clearRows = [];
      say('Конструкции падают одновременно.');
      const duration = (positions.length - 1) * (1000 / Number($('#fall-speed').value));
      render({ fallFrames: positions, duration });
      await pause(duration);
    } else {
      blocks = frame.blocks; clearRows = frame.rows;
      score = baseScore + frame.score; lines = baseLines + frame.lines;
      if (frame.type === 'clear') say(`Линия заполнена! ${frame.combo > 1 ? `Комбо ×${frame.combo}` : 'Освобождаем пространство.'}`);
      render();
      await pause(frame.type === 'clear' ? 850 : 120);
    }
    if (action !== epoch) return false;
  }
  blocks = result.blocks; clearRows = []; score = baseScore + result.score; lines = baseLines + result.lines;
  busy = false;
  if (result.lines) say(`Линии: ${result.lines} · +${result.score} очков${result.combo > 1 ? ` · комбо ×${result.combo}` : ''}`);
  else say(initialMessage);
  if (result.combo > 1 || result.lines > 1) showQuote();
  checkGameOver({ afterMove, wasFullHeight }); render();
  // Empty fields are unplayable: refill once in both modes, including after a
  // generation-triggered cascade. Signal place() to avoid a second auto row.
  if (!gameOver && blocks.length === 0) {
    generate(false, 'Поле очищено. Добавлен новый ряд.');
    return { refilled: true };
  }
  return { refilled: false };
}
function generate(initial = false, message = '') {
  if (gameOver || busy) return;
  if (selection) { say('Сначала разместите конструкцию или отмените ход.', true); return; }
  const added = addRow(blocks, next.row, next.direction, nextId);
  if (!added) { checkGameOver(); if (!gameOver) say('Нет места для нового ряда. Освободите верх поля.', true); render(); return; }
  blocks = added; nextId += next.row.length; next = makeNext();
  animateResolution(initial ? 'Выберите блок, чтобы начать движение.' : (message || 'Новый ряд добавлен. Выберите блок.'));
}
function select(id) {
  if (gameOver || busy) return;
  selection = { ids: connectedIds(blocks, id, bondEl.value), dx: 0, dy: 0, visual: null };
  say('Разъедините выступы и переместите конструкцию.');
  render();
}
function step(dx, dy) {
  if (!selection || gameOver || busy) return false;
  const x = selection.dx + dx, y = selection.dy + dy;
  const studs = geometry(), pos = { x: selection.dx, y: selection.dy };
  const axis = dx ? 'x' : 'y';
  const reached = sweepAxis(blocks, selection.ids, pos, axis, axis === 'x' ? x : y, studs);
  const engaged = !dx && Math.abs(reached - y) <= studs.height + 1e-7 && Math.abs(sweepAxis(blocks, selection.ids, pos, axis, y, studs, true) - y) < 1e-7;
  if ((!engaged && Math.abs(reached - (dx ? x : y)) > 1e-7) || !canMove(blocks, selection.ids, x, y)) { say('Здесь мешают край поля или другой блок.', true); flashInvalid(); return false; }
  selection.dx = x; selection.dy = y; selection.visual = null;
  say('Серый призрак показывает положение. Отпустите или нажмите «Разместить».'); render();
  return true;
}
function flashInvalid() {
  boardEl.classList.remove('invalid'); void boardEl.offsetWidth; boardEl.classList.add('invalid');
}
async function place() {
  if (!selection || busy) return;
  if (!selection.dx && !selection.dy) { selection = null; say('Ход отменён.'); render(); return; }
  const wasFullHeight = !canGenerate(blocks, next.direction);
  blocks = moveBlocks(blocks, selection.ids, selection.dx, selection.dy);
  selection = null;
  const completed = await animateResolution('Конструкция размещена.', { fromGhost: true, afterMove: true, wasFullHeight });
  if (completed && !completed.refilled && autoRowEl.checked && !gameOver) generate();
}
function cancel() { selection = null; say('Ход отменён. Выберите блок.'); render(); }
function position(element, block, dx = 0, dy = 0) {
  element.style.left = `${(block.x + dx) / BOARD_COLUMNS * 100}%`;
  element.style.top = `${(block.y + dy) / BOARD_ROWS * 100}%`;
  element.style.width = `${block.length / BOARD_COLUMNS * 100}%`;
  element.style.height = `${100 / BOARD_ROWS}%`;
}
function brick(block, ghost = false) {
  const el = document.createElement(ghost ? 'div' : 'button');
  el.dataset.id = String(block.id);
  if (!ghost) { el.type = 'button'; el.setAttribute('aria-label', `Блок длиной ${block.length}, ряд ${block.y + 1}, столбец ${block.x + 1}`); }
  else el.setAttribute('aria-hidden', 'true');
  el.className = `brick ${ghost ? 'ghost' : `color-${block.id % 4}`}`;
  el.style.zIndex = ghost ? '50' : String(block.y + 1);
  if (!ghost && selection?.ids.has(block.id)) el.classList.add('selected');
  if (!ghost && clearRows.includes(block.y)) el.classList.add('clearing');
  const inside = document.createElement('span'); inside.className = 'brick-inner'; inside.style.setProperty('--brick-length', block.length);
  for (let i = 0; i < block.length; i++) { const stud = document.createElement('i'); stud.className = 'stud'; inside.append(stud); }
  el.append(inside); position(el, block, ghost ? (selection.visual?.x ?? selection.dx) : 0, ghost ? (selection.visual?.y ?? selection.dy) : 0);
  return el;
}
function render({ fromGhost = false, fallFrames = null, duration = 220 } = {}) {
  const focusedId = boardEl.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  const oldPositions = new Map([...boardEl.querySelectorAll('button.brick')].map(el => [el.dataset.id, el.getBoundingClientRect()]));
  const oldGhosts = new Map([...boardEl.querySelectorAll('.ghost')].map(el => [el.dataset.id, el.getBoundingClientRect()]));
  boardEl.replaceChildren();
  // Decorative background cells are hidden from assistive technology; brick buttons are labelled individually.
  const grid = document.createElement('div'); grid.className = 'grid-bg'; grid.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < BOARD_ROWS * BOARD_COLUMNS; i++) { const cell = document.createElement('div'); cell.className = `cell${clearRows.includes(Math.floor(i / BOARD_COLUMNS)) ? ' clear-cell' : ''}`; grid.append(cell); }
  boardEl.append(grid);
  for (const y of clearRows) { const flame = document.createElement('div'); flame.className = 'burn-line'; flame.setAttribute('aria-hidden', 'true'); flame.style.top = `${y / BOARD_ROWS * 100}%`; flame.style.height = `${100 / BOARD_ROWS}%`; boardEl.append(flame); }
  for (const block of blocks) boardEl.append(brick(block));
  if (selection) for (const block of blocks.filter(b => selection.ids.has(b.id))) boardEl.append(brick(block, true));
  if (focusedId) boardEl.querySelector(`button[data-id="${focusedId}"]`)?.focus({ preventScroll: true });
  // Animate from the previous visual position, not from the original cell when dropping a ghost.
  if (!reducedMotion()) {
    const cellHeight = boardEl.clientHeight / BOARD_ROWS;
    for (const el of boardEl.querySelectorAll('button.brick')) {
      const id = Number(el.dataset.id), now = el.getBoundingClientRect();
      if (fallFrames) {
        const keyframes = fallKeyframes(fallFrames, id, cellHeight);
        if (keyframes.length) el.animate(keyframes, { duration, easing: 'linear' });
      } else {
        const old = (fromGhost && oldGhosts.get(el.dataset.id)) || oldPositions.get(el.dataset.id);
        if (old && (old.left !== now.left || old.top !== now.top)) el.animate([{ transform: `translate(${old.left - now.left}px, ${old.top - now.top}px)` }, { transform: 'translate(0, 0)' }], { duration, easing: 'ease-out' });
      }
    }
    // Arrow-button moves retain a short smooth transition. Dragging updates ghosts directly.
    for (const el of boardEl.querySelectorAll('.ghost')) {
      const old = oldGhosts.get(el.dataset.id), now = el.getBoundingClientRect();
      if (old && (old.left !== now.left || old.top !== now.top)) el.animate([{ transform: `translate(${old.left - now.left}px, ${old.top - now.top}px)` }, { transform: 'translate(0, 0)' }], { duration: 160, easing: 'ease-out' });
    }
  }
  for (const [direction, strip] of Object.entries(strips)) {
    const active = next.direction === direction;
    strip.classList.toggle('active', active);
    strip.replaceChildren();
    for (let x = 0; x < BOARD_COLUMNS; x++) {
      const slot = document.createElement('div'); slot.className = 'preview-slot'; strip.append(slot);
    }
    if (active) for (const piece of next.row) {
      const mini = document.createElement('div'); mini.className = 'preview-brick';
      mini.style.left = `${piece.x / BOARD_COLUMNS * 100}%`;
      mini.style.width = `${piece.length / BOARD_COLUMNS * 100}%`;
      strip.append(mini);
    }
    const side = direction === 'top' ? 'сверху' : 'снизу';
    strip.setAttribute('aria-label', active
      ? `Следующий ряд ${side}: ${next.row.map(b => `блок ${b.length} с позиции ${b.x + 1}`).join(', ')}, остальные клетки пусты`
      : `Следующий ряд ${side} не появится`);
  }
  $('#next-direction').textContent = `Следующий ряд — ${next.direction === 'top' ? 'сверху ↓' : 'снизу ↑'}`;
  $('#score').textContent = score; $('#lines').textContent = `ЛИНИЙ: ${lines}`;
  $('#board-status').textContent = gameOver ? 'ИГРА ОКОНЧЕНА' : busy ? 'ДВИЖЕНИЕ' : selection ? 'КОНСТРУКЦИЯ ВЫБРАНА' : 'ВЫБЕРИТЕ БЛОК';
  $('.move-controls').classList.toggle('active', !!selection && !busy);
  $('#generate').disabled = gameOver || !!selection || busy;
  document.querySelectorAll('#place, #cancel').forEach(el => el.disabled = !selection || gameOver || busy);
  [bondEl, directionEl, autoRowEl, $('#stud-style'), $('#fall-speed'), ...lengthInputs].forEach(el => el.disabled = busy);
  if (!busy && allowedLengths().length === 1) lengthInputs.find(input => input.checked).disabled = true;
}
boardEl.addEventListener('pointerdown', event => {
  const target = event.target.closest('button[data-id]');
  if (!target || event.button !== 0) return;
  event.preventDefault();
  select(Number(target.dataset.id));
  pointer = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId };
});
window.addEventListener('pointermove', event => {
  if (!pointer || event.pointerId !== pointer.id || !selection) return;
  const rect = boardEl.getBoundingClientRect(), unitX = rect.width / BOARD_COLUMNS, unitY = rect.height / BOARD_ROWS;
  if (!unitX || !unitY) return;
  const target = { x: (event.clientX - pointer.x) / unitX, y: (event.clientY - pointer.y) / unitY };
  const studs = geometry();
  const current = selection.visual ?? { x: selection.dx, y: selection.dy };
  const visual = dragPosition(blocks, selection.ids, current, target, studs);
  selection.visual = visual;
  if (Math.abs(visual.x) > 0.01 || Math.abs(visual.y) > 0.01) pointer.moved = true;
  for (const el of boardEl.querySelectorAll('.ghost')) {
    const block = blocks.find(b => b.id === Number(el.dataset.id));
    if (block) position(el, block, visual.x, visual.y);
  }
  if (pointer.moved) say('Серый призрак показывает положение. Отпустите или нажмите «Разместить».');
});
window.addEventListener('pointerup', event => {
  if (pointer && event.pointerId === pointer.id) {
    const moved = pointer.moved; pointer = null;
    if (moved && selection) {
      const snapped = snapOffset(blocks, selection.ids, selection.visual, geometry());
      if (snapped) { selection.dx = snapped.x; selection.dy = snapped.y; place(); }
      else { selection.visual = null; say('Не удалось разместить конструкцию. Попробуйте другое положение.', true); render(); }
    } else if (selection) render();
  }
});
window.addEventListener('pointercancel', () => { if (pointer) { pointer = null; cancel(); } });
// Keyboard activation for brick buttons (pointer selection is handled separately).
boardEl.addEventListener('click', event => { const target = event.target.closest('button[data-id]'); if (target && event.detail === 0) select(Number(target.dataset.id)); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && fullscreen.exitFallback()) return;
  if (!selection || ['SELECT', 'INPUT'].includes(document.activeElement.tagName)) return;
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (delta) { event.preventDefault(); step(...delta); }
  else if (event.key === 'Escape') cancel();
});
$('#place').addEventListener('click', place); $('#cancel').addEventListener('click', cancel); $('#generate').addEventListener('click', () => generate()); $('#reset').addEventListener('click', newGame);
bondEl.addEventListener('change', () => { if (selection) selection = null; $('#bond-hint').textContent = bondEl.value === 'all' ? 'При подъёме движутся все связанные блоки, в том числе снизу.' : 'Выбранный блок отделяется от нижних и забирает связанные блоки выше.'; say('Режим сцепления изменён. Выберите блок.'); checkGameOver(); render(); });
directionEl.addEventListener('change', () => { $('#generation-hint').textContent = directionEl.value === 'bottom' ? 'Ряд появится снизу и поднимет поле.' : directionEl.value === 'top' ? 'Ряд появится сверху и упадёт вниз.' : 'Направление выбирается для каждого ряда случайно.'; newGame(); });
lengthInputs.forEach(input => input.addEventListener('change', () => {
  if (!allowedLengths().length) { input.checked = true; return; }
  next = makeNext(next.direction); say('Следующий ряд обновлён с учётом выбранных длин.'); render();
}));
$('#fall-speed').addEventListener('input', event => { $('#fall-speed-value').textContent = event.target.value; });
$('#quotes').addEventListener('change', event => { if (!event.target.checked) $('#quote').hidden = true; });
$('#quote-dismiss').addEventListener('click', () => { $('#quote').hidden = true; });
$('#stud-style').addEventListener('change', event => { boardEl.classList.toggle('studs-center', event.target.value === 'center'); });
const fullscreenButton = $('#fullscreen');
const fullscreen = createFullscreenController(document, state => {
  document.body.classList.toggle('expanded-mode', state.active);
  fullscreenButton.setAttribute('aria-pressed', String(state.active));
  const label = state.fallback ? 'Свернуть расширенный вид' : state.native ? 'Выйти из полного экрана' : 'На весь экран';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.querySelector('.fullscreen-label').textContent = state.active ? 'Свернуть' : 'На весь экран';
  if (state.fallback) say('Браузер не разрешил полный экран. Открыт расширенный вид внутри окна.');
});
fullscreenButton.addEventListener('click', () => fullscreen.toggle());
newGame();
