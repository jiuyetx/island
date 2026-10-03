import assert from 'node:assert/strict';
import { createRoamer, offshorePlacements, shoreRadiusAt, stepRoamer, upperBeachPoint } from '../src/seaEcology.js';
import { WAVE_BARRIER_APPROACH, WAVE_BARRIER_POSTS, WAVE_BARRIER_SITE } from '../src/waveBarrier.js';
import { BOAT_MOOR } from '../src/boat.js';
import { createReefFish, safeReefFishPoint, stepReefFish } from '../src/reefFish.js';
import { createFishMaterial } from '../src/fishVisual.js';

const fishMaterial = createFishMaterial();
assert.equal(fishMaterial.opacity, 1, 'fish bodies must not show the fish behind them');
assert.equal(fishMaterial.depthWrite, true, 'overlapping instances must occlude each other regardless of draw order');
fishMaterial.dispose();

function checkSchool(fish, step, safe) {
  const moved = fish.map(() => 0);
  for (let frame = 0; frame < 3600; frame++) {
    fish.forEach((member, index) => {
      const before = { x: member.x, z: member.z };
      step(member, .1, fish);
      const distance = Math.hypot(member.x - before.x, member.z - before.z);
      assert(distance < .08, 'avoidance cannot teleport fish apart');
      moved[index] += distance;
      assert(safe(member), 'avoidance cannot steer fish onto land');
      for (const other of fish) if (other !== member) {
        assert(Math.hypot(member.x - other.x, member.z - other.z) >= member.clearanceRadius + other.clearanceRadius - 1e-8,
          'different fish bodies cannot intersect while swimming or pausing');
      }
    });
  }
  assert(moved.every(distance => distance > 8), 'fish keep exploring instead of becoming stuck in a crowd');
}
const mixedSchool = [];
// Multiple overlapping species use one neighbor list, including fish already
// spawned at the same angle. This reproduces the crowded main-island reef.
for (let i = 0; i < 52; i++) mixedSchool.push(createRoamer(i < 40 ? 17 + i % 3 : 24 + i % 7,
  (i % 24) * 2.399, .25 + (i % 4) * .05, 71 + i * 73, mixedSchool, i < 40 ? .85 : 1.15));
checkSchool(mixedSchool, stepRoamer, fish => Math.hypot(fish.x, fish.z) > shoreRadiusAt(fish.x, fish.z) + 3.1);
for (const radius of [7, 8, 9, 10]) {
  const reefSchool = [];
  for (let i = 0; i < 12; i++) reefSchool.push(createReefFish(radius, { x: radius + 2.2, z: 0 }, i, 312 + i * 1003, reefSchool));
  checkSchool(reefSchool, stepReefFish, fish => safeReefFishPoint(fish, fish.x, fish.z));
}

for (const point of [WAVE_BARRIER_SITE, ...WAVE_BARRIER_POSTS]) {
  assert(Math.hypot(point.x, point.z) - shoreRadiusAt(point.x, point.z) > 1.9,
    'the entire breakwater must stand offshore through high and low tide');
  assert(Math.hypot(point.x - BOAT_MOOR.x, point.z - BOAT_MOOR.z) > 4,
    'the breakwater must not block the moored boat');
}
assert(shoreRadiusAt(WAVE_BARRIER_APPROACH.x, WAVE_BARRIER_APPROACH.z)
  - Math.hypot(WAVE_BARRIER_APPROACH.x, WAVE_BARRIER_APPROACH.z) > 2,
  'the build interaction must stay on dry beach');

for (const angle of [2.1, -2.1]) {
  const point = upperBeachPoint(angle);
  const radius = Math.hypot(point.x, point.z);
  assert(radius > 11, 'washed-up wood must not appear in the grassy island core');
  assert(Math.abs(shoreRadiusAt(point.x, point.z) - radius - 1.8) < 1e-6,
    'washed-up wood must remain on upper dry sand');
}

const sites = [[4, 0, 4], [20, 0, 0], [0, 0, 23], [-22, 0, 0]];
const offshore = offshorePlacements(sites, 2);
assert(!offshore.some(([x, , z]) => Math.hypot(x, z) <= shoreRadiusAt(x, z) + 2));
assert(!offshore.some(([x]) => x === 4), 'island-center coral must never be accepted');

for (let fishIndex = 0; fishIndex < 40; fishIndex++) {
  const phase = fishIndex * Math.PI * 2 / 40;
  const roamer = createRoamer(20 + fishIndex % 11, phase, .28 + fishIndex % 5 * .05, 71 + fishIndex * 73);
  let moved = 0;
  for (let frame = 0; frame < 900; frame++) {
    const beforeX = roamer.x, beforeZ = roamer.z;
    stepRoamer(roamer, .1);
    const distance = Math.hypot(roamer.x - beforeX, roamer.z - beforeZ);
    assert(distance <= roamer.speed * .1 + 1e-9, 'fish movement exceeds cruising speed');
    assert(Math.hypot(roamer.x, roamer.z) > shoreRadiusAt(roamer.x, roamer.z) + 3.1,
      'fish must remain in water while wandering');
    moved += distance;
  }
  assert(moved > 10, 'fish should explore its local patch');
}
console.log('sea ecology check passed');
