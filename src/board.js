export const BOARD_COLUMNS = 8;
export const BOARD_ROWS = 10;

export function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLUMNS).fill(null));
}

// A block occupies one horizontal row. IDs identify bricks, not connected groups.
export function cellsFor(blocks) {
  const board = createEmptyBoard();
  for (const block of blocks) {
    for (let x = block.x; x < block.x + block.length; x++) board[block.y][x] = block.id;
  }
  return board;
}

export function makeRow(random = Math.random, allowed = [1, 2, 3, 4]) {
  const lengths = [...new Set(allowed)].filter(n => Number.isInteger(n) && n >= 1 && n <= 6);
  if (!lengths.length) throw new RangeError('At least one block length must be enabled');
  const occupied = Array(BOARD_COLUMNS).fill(false);
  const result = [];
  let used = 0;
  while (true) {
    // Choose a length first so larger bricks are not drowned out by many short positions.
    const choices = lengths.map(length => ({
      length,
      positions: Array.from({ length: BOARD_COLUMNS - length + 1 }, (_, x) => x)
        .filter(x => used + length < BOARD_COLUMNS && occupied.slice(x, x + length).every(cell => !cell))
    })).filter(choice => choice.positions.length);
    if (!choices.length || (result.length && random() < 0.4)) break;
    const choice = choices[Math.floor(random() * choices.length)];
    const x = choice.positions[Math.floor(random() * choice.positions.length)];
    result.push({ x, length: choice.length });
    occupied.fill(true, x, x + choice.length);
    used += choice.length;
  }
  return result.sort((a, b) => a.x - b.x);
}

function touchesVertically(a, b) {
  return Math.abs(a.y - b.y) === 1 && a.x < b.x + b.length && b.x < a.x + a.length;
}

// 'all' carries the whole connected construction; 'above' detaches from everything below.
export function connectedIds(blocks, id, mode = 'all') {
  const selected = blocks.find(block => block.id === id);
  if (!selected) return new Set();
  const ids = new Set([id]);
  const queue = [selected];
  while (queue.length) {
    const current = queue.shift();
    for (const other of blocks) {
      if (!ids.has(other.id) && touchesVertically(current, other) &&
          (mode === 'all' || other.y < current.y)) {
        ids.add(other.id);
        queue.push(other);
      }
    }
  }
  return ids;
}

export function canMove(blocks, ids, dx, dy) {
  const board = cellsFor(blocks);
  return blocks.filter(b => ids.has(b.id)).every(block => {
    const y = block.y + dy;
    const x = block.x + dx;
    if (y < 0 || y >= BOARD_ROWS || x < 0 || x + block.length > BOARD_COLUMNS) return false;
    for (let col = x; col < x + block.length; col++) {
      if (board[y][col] !== null && !ids.has(board[y][col])) return false;
    }
    return true;
  });
}

export function moveBlocks(blocks, ids, dx, dy) {
  return blocks.map(b => ids.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : { ...b });
}

// Recalculate components on every gravity step. All free components advance together;
// components cannot attach to one another halfway through an individual step.
export function settle(blocks, onStep = () => {}) {
  let current = blocks.map(b => ({ ...b }));
  while (true) {
    const groups = [];
    const owners = new Map();
    for (const block of current) {
      if (owners.has(block.id)) continue;
      const ids = connectedIds(current, block.id);
      const index = groups.length;
      groups.push(ids);
      for (const id of ids) owners.set(id, index);
    }
    const board = cellsFor(current);
    const blocked = new Set();
    for (const b of current) if (b.y === BOARD_ROWS - 1) blocked.add(owners.get(b.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of current) {
        const group = owners.get(b.id);
        if (blocked.has(group) || b.y === BOARD_ROWS - 1) continue;
        for (let x = b.x; x < b.x + b.length; x++) {
          const below = board[b.y + 1][x];
          if (below !== null && owners.get(below) !== group && blocked.has(owners.get(below))) {
            blocked.add(group); changed = true; break;
          }
        }
      }
    }
    const moving = new Set();
    groups.forEach((ids, i) => { if (!blocked.has(i)) for (const id of ids) moving.add(id); });
    if (!moving.size) return current;
    current = moveBlocks(current, moving, 0, 1);
    onStep(current);
  }
}

// Trace is optional: gameplay can replay each simultaneous fall and clear, while
// move searches use the exact same physics without allocating animation frames.
export function resolveBoard(blocks, { trace = false } = {}) {
  let current = blocks.map(b => ({ ...b }));
  let score = 0, lines = 0, combo = 0;
  const frames = [];
  const snapshot = (type, state, rows = []) => {
    if (trace) frames.push({ type, blocks: state.map(b => ({ ...b })), rows: [...rows], score, lines, combo });
  };
  while (true) {
    const board = cellsFor(current);
    const full = new Set(board.flatMap((row, y) => row.every(cell => cell !== null) ? [y] : []));
    if (!full.size) {
      const settled = settle(current, step => snapshot('fall', step));
      if (settled.every((b, i) => b.y === current[i].y)) break;
      current = settled;
      continue;
    }
    combo++;
    lines += full.size;
    score += full.size * 100 * combo;
    snapshot('clear', current, full);
    current = current.filter(block => !full.has(block.y));
    snapshot('remove', current);
    current = settle(current, step => snapshot('fall', step));
  }
  return { blocks: current, score, lines, combo, ...(trace ? { frames } : {}) };
}

export function canGenerate(blocks, direction) {
  return !blocks.some(b => b.y === 0); // bottom pushes upward; top needs an empty entry row
}

export function addRow(blocks, row, direction, nextId) {
  if (!canGenerate(blocks, direction)) return null;
  const shifted = blocks.map(b => ({ ...b, y: b.y - (direction === 'bottom' ? 1 : 0) }));
  const y = direction === 'bottom' ? BOARD_ROWS - 1 : 0;
  return [...shifted, ...row.map((piece, i) => ({ ...piece, y, id: nextId + i }))];
}

// A useful move must change the settled board (or clear a line), not merely lift
// a brick that falls back into the same place. Search reachable ghost positions.
export function hasMove(blocks, mode) {
  const checkedGroups = new Set();
  for (const block of blocks) {
    const ids = connectedIds(blocks, block.id, mode);
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (checkedGroups.has(key)) continue;
    checkedGroups.add(key);
    if (!canMove(blocks, ids, 0, -1)) continue;
    const queue = [[0, -1]], visited = new Set(['0,-1']);
    for (let i = 0; i < queue.length; i++) {
      const [dx, dy] = queue[i];
      const result = resolveBoard(moveBlocks(blocks, ids, dx, dy));
      if (result.lines || result.blocks.some((b, n) => b.x !== blocks[n].x || b.y !== blocks[n].y)) return true;
      for (const [sx, sy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (sx && dy >= 0) continue;
        const x = dx + sx, y = dy + sy, pos = `${x},${y}`;
        if (!visited.has(pos) && canMove(blocks, ids, x, y)) { visited.add(pos); queue.push([x, y]); }
      }
    }
  }
  return false;
}
