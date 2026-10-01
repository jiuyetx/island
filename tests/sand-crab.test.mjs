import assert from 'node:assert/strict';
import { createSandCrab, safeSandCrabPoint, stepSandCrab, sandCrabLegPose } from '../src/sandCrab.js';
import { createSandCrabGeometry, createSandCrabMaterial } from '../src/sandCrabVisual.js';

let pauses = 0, reversals = 0, turns = 0;
for (let i = 0; i < 28; i++) {
  const crab = createSandCrab(12.6 + i % 4 * .3, i * Math.PI * 2 / 28, 103 + i * 73);
  assert.ok(safeSandCrabPoint(crab.x, crab.z), 'spawn on dry sand, outside dock');
  let distance = 0;
  for (let n = 0; n < 1200; n++) {
    const { x, z, heading, side } = crab;
    stepSandCrab(crab, 1 / 60);
    const dx = crab.x - x, dz = crab.z - z, moved = Math.hypot(dx, dz);
    distance += moved;
    assert.ok(safeSandCrabPoint(crab.x, crab.z), 'stay on sand throughout entire path');
    assert.ok(Math.hypot(crab.x - crab.homeX, crab.z - crab.homeZ) < 3.05, 'independent local exploration, not orbiting island');
    if (moved > 1e-8) {
      const forwardDot = (dx * Math.cos(crab.heading) + dz * Math.sin(crab.heading)) / moved;
      assert.ok(Math.abs(forwardDot) < .0001, 'sideways translation is perpendicular to face');
      assert.ok(moved <= .57 / 60, 'bounded speed, no teleport');
    }
    if (crab.pause > 0) pauses++;
    if (crab.side !== side) reversals++;
    if (Math.abs(crab.heading - heading) > .005) turns++;
  }
  assert.ok(distance > 1, 'each crab actually explores');
}
assert.ok(pauses > 500 && reversals > 10 && turns > 100, 'varied pauses, left/right steps and turns');

const a = createSandCrab(13, .4, 99), b = createSandCrab(13, .4, 99);
for (let i = 0; i < 300; i++) stepSandCrab(a, .1);
for (let i = 0; i < 1800; i++) stepSandCrab(b, 1 / 60);
assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-7, 'frame-rate independent random walk');
assert.equal(a.seed, b.seed);
const before = [a.x, a.z, a.gait];
stepSandCrab(a, 0); stepSandCrab(a, NaN); stepSandCrab(a, -1);
assert.deepEqual([a.x, a.z, a.gait], before, 'no movement without elapsed time');

const geometry = createSandCrabGeometry();
const legs = new Set(geometry.attributes.crabLeg.array);
assert.deepEqual([...legs].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8], 'body plus exactly eight independently animated walking legs');
const triangles = geometry.attributes.position.count / 3;
assert.ok(triangles < 2400, `instanced crab mesh budget: ${triangles}`);
assert.ok(geometry.boundingBox.min.y >= 0, 'no foot is below attachment plane');
for (let index = 0; index < 8; index++) {
  assert.deepEqual(sandCrabLegPose(index, 1, 0), { yaw: 0, lift: 0 }, 'stationary legs settle');
}
const lifts = Array.from({ length: 8 }, (_, index) => sandCrabLegPose(index, Math.PI / 2, 1).lift);
assert.equal(lifts.filter(lift => lift > .03).length, 4, 'four support legs and four recovery legs');
assert.ok(sandCrabLegPose(0, .7, 1).yaw * sandCrabLegPose(1, .7, 1).yaw < 0, 'adjacent legs alternate');
const material = createSandCrabMaterial();
const shader = { vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
material.onBeforeCompile(shader);
assert.ok(shader.vertexShader.includes('attribute vec2 crabGait') && shader.vertexShader.includes('transformed = crabPivot + limb'), 'articulated gait attached to shader');
geometry.dispose(); material.dispose();
console.log('sand crab: sideways motion, unpredictable paths, beach clearance and eight-leg gait passed');
