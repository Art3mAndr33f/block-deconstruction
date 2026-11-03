import { BOARD_COLUMNS, BOARD_ROWS } from './board.js?v=6';

const EPSILON = 1e-7;

// Fractional coordinates are only used while dragging; committed blocks stay on the grid.
export function canPreview(blocks, ids, dx, dy) {
  const moving = blocks.filter(block => ids.has(block.id));
  const fixed = blocks.filter(block => !ids.has(block.id));
  return moving.every(block => {
    const left = block.x + dx, top = block.y + dy;
    if (left < -EPSILON || left + block.length > BOARD_COLUMNS + EPSILON || top < -EPSILON || top + 1 > BOARD_ROWS + EPSILON) return false;
    return fixed.every(other =>
      left + block.length <= other.x + EPSILON || left >= other.x + other.length - EPSILON ||
      top + 1 <= other.y + EPSILON || top >= other.y + 1 - EPSILON
    );
  });
}

// Sweep along an axis so even a fast pointer cannot move through a brick or a wall.
export function sweepAxis(blocks, ids, position, axis, target) {
  const current = position[axis];
  const requested = target - current;
  if (Math.abs(requested) < EPSILON) return current;
  const moving = blocks.filter(block => ids.has(block.id));
  const fixed = blocks.filter(block => !ids.has(block.id));
  let distance = requested;
  for (const block of moving) {
    const left = block.x + position.x, right = left + block.length;
    const top = block.y + position.y, bottom = top + 1;
    const edgeDistance = axis === 'x'
      ? (requested > 0 ? BOARD_COLUMNS - right : -left)
      : (requested > 0 ? BOARD_ROWS - bottom : -top);
    distance = requested > 0 ? Math.min(distance, edgeDistance) : Math.max(distance, edgeDistance);
    for (const other of fixed) {
      const overlap = axis === 'x'
        ? top < other.y + 1 - EPSILON && bottom > other.y + EPSILON
        : left < other.x + other.length - EPSILON && right > other.x + EPSILON;
      if (!overlap) continue;
      const gap = axis === 'x'
        ? (requested > 0 ? other.x - right : other.x + other.length - left)
        : (requested > 0 ? other.y - bottom : other.y + 1 - top);
      if (requested > 0 && gap >= -EPSILON) distance = Math.min(distance, Math.max(0, gap));
      if (requested < 0 && gap <= EPSILON) distance = Math.max(distance, Math.min(0, gap));
    }
  }
  return current + distance;
}

// Lift first, then shift, then lower. Sideways movement becomes available as
// soon as the visible studs clear the connection, not after a whole cell.
export function dragPosition(blocks, ids, position, target, liftHeight) {
  const next = { ...position };
  if (target.y < next.y) next.y = sweepAxis(blocks, ids, next, 'y', target.y);
  if (next.y <= -liftHeight + EPSILON) next.x = sweepAxis(blocks, ids, next, 'x', target.x);
  if (target.y > next.y) next.y = sweepAxis(blocks, ids, next, 'y', target.y);
  return next;
}

// Pick the nearest legal grid position that is reachable from the preview by
// an unobstructed horizontal/vertical path. Never snap through another block.
export function snapOffset(blocks, ids, position) {
  const candidates = [];
  for (let dy = -BOARD_ROWS; dy <= BOARD_ROWS; dy++) {
    for (let dx = -BOARD_COLUMNS; dx <= BOARD_COLUMNS; dx++) {
      if (canPreview(blocks, ids, dx, dy)) candidates.push({ x: dx, y: dy });
    }
  }
  candidates.sort((a, b) => (a.x - position.x) ** 2 + (a.y - position.y) ** 2 - ((b.x - position.x) ** 2 + (b.y - position.y) ** 2));
  for (const candidate of candidates) {
    for (const axes of [['x', 'y'], ['y', 'x']]) {
      const path = { ...position };
      for (const axis of axes) path[axis] = sweepAxis(blocks, ids, path, axis, candidate[axis]);
      if (Math.abs(path.x - candidate.x) < EPSILON && Math.abs(path.y - candidate.y) < EPSILON) return candidate;
    }
  }
  return null;
}
