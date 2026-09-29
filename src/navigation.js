// Small deterministic ground planner. Obstacles include an allowance for the
// character's shoulders, so a route never merely clears a mesh by its centre.
export function blocked(x, z, obstacles, limit = 11.5) {
  if (Math.hypot(x, z) > limit) return true;
  return obstacles.some((item) => {
    if (item.type === 'box') return x >= item.x0 && x <= item.x1 && z >= item.z0 && z <= item.z1;
    if (item.type === 'oriented-box') {
      const dx = x - item.x, dz = z - item.z;
      const cos = Math.cos(item.angle), sin = Math.sin(item.angle);
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;
      return Math.abs(localX) <= item.halfWidth && Math.abs(localZ) <= item.halfDepth;
    }
    return Math.hypot(x - item.x, z - item.z) <= item.r;
  });
}

export function clearSegment(a, b, obstacles, limit = 11.5) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  for (let i = 0, count = Math.ceil(length / .15); i <= count; i++) {
    const t = count ? i / count : 0;
    if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, obstacles, limit)) return false;
  }
  return true;
}

export function planWalkRoute(start, destination, obstacles, limit = 11.5) {
  const length = Math.hypot(destination.x, destination.z);
  const goal = length > limit - .3
    ? { x: destination.x * (limit - .3) / length, z: destination.z * (limit - .3) / length }
    : { x: destination.x, z: destination.z };
  if (clearSegment(start, goal, obstacles, limit)) return [goal];
  const step = .4, extent = Math.ceil(limit / step), width = extent * 2 + 1;
  const id = (i, j) => j * width + i;
  const point = (i, j) => ({ x: (i - extent) * step, z: (j - extent) * step });
  const closest = (target) => {
    let best = null, bestDist = Infinity;
    for (let j = 0; j < width; j++) for (let i = 0; i < width; i++) {
      const p = point(i, j);
      if (blocked(p.x, p.z, obstacles, limit)) continue;
      const distance = Math.hypot(p.x - target.x, p.z - target.z);
      if (distance < bestDist) { best = { i, j, p }; bestDist = distance; }
    }
    return best;
  };
  const source = closest(start), target = closest(goal);
  if (!source || !target) return [];
  const destinationId = id(target.i, target.j);
  const cost = new Float32Array(width * width).fill(Infinity);
  const parent = new Int32Array(width * width).fill(-1);
  const open = [{ i: source.i, j: source.j, score: 0 }];
  cost[id(source.i, source.j)] = 0;
  while (open.length) {
    open.sort((a, b) => b.score - a.score);
    const current = open.pop();
    const currentId = id(current.i, current.j);
    if (currentId === destinationId) break;
    const from = point(current.i, current.j);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = current.i + di, j = current.j + dj;
      if (i < 0 || j < 0 || i >= width || j >= width) continue;
      const to = point(i, j);
      if (!clearSegment(from, to, obstacles, limit)) continue;
      const nextId = id(i, j), nextCost = cost[currentId] + Math.hypot(di, dj);
      if (nextCost >= cost[nextId]) continue;
      cost[nextId] = nextCost;
      parent[nextId] = currentId;
      open.push({ i, j, score: nextCost + Math.hypot(to.x - target.p.x, to.z - target.p.z) / step });
    }
  }
  if (!Number.isFinite(cost[destinationId])) return [];
  const cells = [];
  for (let cursor = destinationId; cursor !== -1; cursor = parent[cursor]) {
    cells.push(point(cursor % width, Math.floor(cursor / width)));
  }
  cells.reverse();
  const route = [];
  let from = start;
  for (let i = 1; i < cells.length; i++) {
    if (i < cells.length - 1 && clearSegment(from, cells[i + 1], obstacles, limit)) continue;
    route.push(cells[i]); from = cells[i];
  }
  if (!blocked(goal.x, goal.z, obstacles, limit) && clearSegment(from, goal, obstacles, limit)) route.push(goal);
  return route.length ? route : [target.p];
}
