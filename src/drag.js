import { BOARD_COLUMNS, BOARD_ROWS, connectedIds, moveBlocks, resolveBoard } from './board.js?v=7';

const EPS = 1e-7;
export const DEFAULT_STUDS = { height: 0.12, maxWidth: 0.32, inset: 0.04 };
const overlap = (a0, a1, b0, b1) => a0 < b1 - EPS && a1 > b0 + EPS;

// Stud geometry matches the per-cell centred studs used by the renderer.
function shapes(block, dx, dy, studs) {
  const x = block.x + dx, y = block.y + dy;
  const result = [{ left: x, right: x + block.length, top: y, bottom: y + 1, kind: 'body' }];
  if (studs.height <= 0) return result;
  const innerWidth = Math.max(0, block.length - 2 * studs.inset);
  const step = innerWidth / block.length;
  const width = Math.min(studs.maxWidth, step * 0.39);
  for (let i = 0; i < block.length; i++) {
    const center = x + studs.inset + (i + 0.5) * step;
    result.push({ left: center - width / 2, right: center + width / 2, top: y - studs.height, bottom: y, kind: 'stud' });
  }
  return result;
}

// Body-only occupancy is used for grid placement: studs may be inserted into a
// vertically adjacent brick at rest, but solid brick bodies cannot overlap.
export function canPreview(blocks, ids, dx, dy) {
  const moving = blocks.filter(b => ids.has(b.id)), fixed = blocks.filter(b => !ids.has(b.id));
  return moving.every(b => {
    const x = b.x + dx, y = b.y + dy;
    return x >= -EPS && x + b.length <= BOARD_COLUMNS + EPS && y >= -EPS && y + 1 <= BOARD_ROWS + EPS &&
      fixed.every(o => !overlap(x, x + b.length, o.x, o.x + o.length) || !overlap(y, y + 1, o.y, o.y + 1));
  });
}

// Axis-aligned swept collision against bodies and protruding studs. Existing
// interlocked studs may move vertically out of their socket, never sideways.
export function sweepAxis(blocks, ids, position, axis, target, studs = DEFAULT_STUDS, bodiesOnly = false) {
  const requested = target - position[axis];
  if (Math.abs(requested) < EPS) return position[axis];
  let distance = requested;
  const fixed = blocks.filter(b => !ids.has(b.id));
  for (const b of blocks.filter(b => ids.has(b.id))) {
    const x = b.x + position.x, y = b.y + position.y;
    const edge = axis === 'x' ? (requested > 0 ? BOARD_COLUMNS - x - b.length : -x) : (requested > 0 ? BOARD_ROWS - y - 1 : -y);
    distance = requested > 0 ? Math.min(distance, edge) : Math.max(distance, edge);
    const movingShapes = shapes(b, position.x, position.y, bodiesOnly ? { ...studs, height: 0 } : studs);
    for (const other of fixed) {
      const fixedShapes = shapes(other, 0, 0, bodiesOnly ? { ...studs, height: 0 } : studs);
      for (const m of movingShapes) for (const f of fixedShapes) {
        const perpendicular = axis === 'x' ? overlap(m.top, m.bottom, f.top, f.bottom) : overlap(m.left, m.right, f.left, f.right);
        if (!perpendicular) continue;
        const m0 = axis === 'x' ? m.left : m.top, m1 = axis === 'x' ? m.right : m.bottom;
        const f0 = axis === 'x' ? f.left : f.top, f1 = axis === 'x' ? f.right : f.bottom;
        if (overlap(m0, m1, f0, f1)) {
          // Only already-engaged studs can overlap at the start. Allow vertical
          // separation, but do not allow horizontal sliding through the joint.
          const separating = axis === 'y' && ((m.kind === 'body' && f.kind === 'stud' && requested < 0) || (m.kind === 'stud' && f.kind === 'body' && requested > 0));
          if (!separating) distance = 0;
          continue;
        }
        const gap = requested > 0 ? f0 - m1 : f1 - m0;
        if (requested > 0 && gap >= -EPS) distance = Math.min(distance, Math.max(0, gap));
        if (requested < 0 && gap <= EPS) distance = Math.max(distance, Math.min(0, gap));
      }
    }
  }
  return position[axis] + distance;
}

export function dragPosition(blocks, ids, position, target, studs = DEFAULT_STUDS) {
  const next = { ...position };
  if (target.y < next.y) next.y = sweepAxis(blocks, ids, next, 'y', target.y, studs);
  next.x = sweepAxis(blocks, ids, next, 'x', target.x, studs);
  if (target.y > next.y) {
    next.y = sweepAxis(blocks, ids, next, 'y', target.y, studs);
    // Lowering can disengage a stud from an upper block in this same gesture.
    next.x = sweepAxis(blocks, ids, next, 'x', target.x, studs);
  }
  return next;
}

// A final vertical insertion of at most one stud height may engage a socket.
function travelTo(blocks, ids, start, candidate, axes, studs) {
  const path = { ...start };
  for (const axis of axes) {
    const dest = candidate[axis];
    let actual = sweepAxis(blocks, ids, path, axis, dest, studs);
    if (axis === 'y' && Math.abs(actual - dest) <= studs.height + EPS) {
      const bodyEnd = sweepAxis(blocks, ids, path, axis, dest, studs, true);
      if (Math.abs(bodyEnd - dest) < EPS) actual = dest;
    }
    path[axis] = actual;
    if (Math.abs(actual - dest) > EPS) return false;
  }
  return true;
}

export function snapOffset(blocks, ids, position, studs = DEFAULT_STUDS) {
  const candidates = [];
  for (let y = -BOARD_ROWS; y <= BOARD_ROWS; y++) for (let x = -BOARD_COLUMNS; x <= BOARD_COLUMNS; x++) {
    if (canPreview(blocks, ids, x, y)) candidates.push({ x, y });
  }
  candidates.sort((a, b) => (a.x - position.x) ** 2 + (a.y - position.y) ** 2 - ((b.x - position.x) ** 2 + (b.y - position.y) ** 2));
  return candidates.find(candidate => travelTo(blocks, ids, position, candidate, ['x', 'y'], studs) || travelTo(blocks, ids, position, candidate, ['y', 'x'], studs)) ?? null;
}

// Search reachable placements, including extraction downwards and sideways in
// open space. Uses the same stud collisions as pointer dragging.
export function hasMove(blocks, mode, studs = DEFAULT_STUDS) {
  const groups = new Set();
  for (const block of blocks) {
    const ids = connectedIds(blocks, block.id, mode);
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (groups.has(key)) continue;
    groups.add(key);
    const queue = [{ x: 0, y: 0 }], visited = new Set(['0,0']);
    for (let i = 0; i < queue.length; i++) {
      const pos = queue[i];
      if (pos.x || pos.y) {
        const result = resolveBoard(moveBlocks(blocks, ids, pos.x, pos.y));
        if (result.lines || result.blocks.some((b, n) => b.x !== blocks[n].x || b.y !== blocks[n].y)) return true;
      }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const next = { x: pos.x + dx, y: pos.y + dy }, k = `${next.x},${next.y}`;
        if (!visited.has(k) && canPreview(blocks, ids, next.x, next.y) && travelTo(blocks, ids, pos, next, dx ? ['x'] : ['y'], studs)) {
          visited.add(k); queue.push(next);
        }
      }
    }
  }
  return false;
}
