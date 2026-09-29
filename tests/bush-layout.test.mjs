import assert from 'node:assert/strict';
import { sparseBushPlacements } from '../src/bushLayout.js';

const trees = [{ x: -8, z: 2, scale: 1 }];
const farmBeds = [[-5, -5], [-3, -5]];
const hut = { x: 1.6, z: -1.4 };
const dock = { x: 8, z: 3.4 };
const trade = { x: 7.7, z: 4.3 };
const candidates = [];
for (let x = -12; x <= 12; x += 2) {
  for (let z = -11; z <= 11; z += 2) candidates.push([x, 2, z, .75, 0]);
}
const options = { trees, farmBeds, hut, dock, trade, maxCount: 14 };
const selected = sparseBushPlacements(candidates, options);
assert.deepEqual(selected, sparseBushPlacements(candidates, options), 'bush arrangement must be stable');
assert(selected.length > 5 && selected.length <= 14, 'keep a few edge accents, not dense thickets');
for (const [x, , z, scale] of selected) {
  assert(!(Math.abs(x) < 3.8 && z > 1.5 && z < 7.2), 'central sightline must stay clear');
  assert(Math.hypot(x - hut.x, z - hut.z) >= 4.3 + scale * .4, 'hut must stay clear');
  assert(Math.hypot(x - dock.x, z - dock.z) >= 2.8 + scale * .5, 'dock must stay clear');
  assert(Math.hypot(x - trade.x, z - trade.z) >= 2.3 + scale * .5, 'trade sign must stay clear');
  assert(farmBeds.every(([bx, bz]) => Math.hypot(x - bx, z - bz) >= 1.8 + scale * .45), 'farm beds must stay clear');
  assert(trees.every((tree) => Math.hypot(x - tree.x, z - tree.z) >= 1.75 + tree.scale * .45 + scale * .3), 'tree trunks must stay clear');
}
for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
  const [x, , z, scale] = selected[i], [otherX, , otherZ, otherScale] = selected[j];
  assert(Math.hypot(x - otherX, z - otherZ) >= 1.95 + (scale + otherScale) * .45, 'bushes must not overlap');
}
console.log('bush layout check passed');
