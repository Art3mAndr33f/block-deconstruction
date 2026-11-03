// Consecutive physics steps belong to one uninterrupted fall, but clear/remove
// frames remain separate so the player can see exactly what disappeared.
export function collectFallFrames(frames, index, startBlocks) {
  const positions = [startBlocks];
  while (index < frames.length && frames[index].type === 'fall') positions.push(frames[index++].blocks);
  return { positions, nextIndex: index };
}

// Every step has the same duration. A brick that lands early stays in place in
// later keyframes while the remaining unsupported bricks continue falling.
export function fallKeyframes(positions, id, cellHeight) {
  const points = positions.map(frame => frame.find(block => block.id === id));
  if (points.length < 2 || !points.every(Boolean) || points.every(point => point.y === points.at(-1).y)) return [];
  const last = points.at(-1);
  return points.map((point, i) => ({ transform: `translateY(${(point.y - last.y) * cellHeight}px)`, offset: i / (points.length - 1) }));
}

// Respect reduced motion by default; enabling movement is an explicit choice.
export function fallMotionEnabled(setting, systemReduced) {
  if (setting === 'full') return true;
  if (setting === 'off') return false;
  return !systemReduced;
}
