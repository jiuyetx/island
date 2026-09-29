const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Keep hibiscus as small edge accents, not a wall around the hut or farm.
// This is deterministic so existing saves do not acquire a new random layout.
export function sparseBushPlacements(candidates, { trees, farmBeds, hut, dock, trade, maxCount = 14 }) {
  const selected = [];
  const sectors = [0, 0, 0, 0];
  for (const point of candidates) {
    const [x, , z, scale = 1] = point;
    const location = { x, z };
    const sector = (x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0);
    if (Math.abs(x) < 3.8 && z > 1.5 && z < 7.2) continue;
    if (distance(location, hut) < 4.3 + scale * .4
      || distance(location, dock) < 2.8 + scale * .5
      || distance(location, trade) < 2.3 + scale * .5
      || farmBeds.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 1.8 + scale * .45)
      || trees.some((tree) => distance(location, tree) < 1.75 + tree.scale * .45 + scale * .3)
      || selected.some(([sx, , sz, otherScale]) => Math.hypot(x - sx, z - sz) < 1.95 + (scale + otherScale) * .45)) continue;
    if (sectors[sector] >= 4) continue;
    selected.push(point);
    sectors[sector]++;
    if (selected.length >= maxCount) break;
  }
  return selected;
}
