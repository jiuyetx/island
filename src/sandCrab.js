import { shoreRadiusAt } from './seaEcology.js';
import { coastlineBandRadius } from './coastline.js';
import { DOCK_DECK_OBSTACLE } from './dockNavigation.js';

const TAU = Math.PI * 2, TICK = 1 / 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
function random(crab) {
  crab.seed = (Math.imul(crab.seed, 1664525) + 1013904223) >>> 0;
  return crab.seed / 4294967296;
}

export function safeSandCrabPoint(x, z) {
  // Normalized to the actual irregular shoreline; both sides leave room for
  // the complete crab silhouette, not just the centre of its shell.
  const radius = Math.hypot(x, z) * 14.7 / shoreRadiusAt(x, z);
  const dock = DOCK_DECK_OBSTACLE;
  const dx = x - dock.x, dz = z - dock.z;
  const localX = dx * Math.cos(dock.angle) + dz * Math.sin(dock.angle);
  const localZ = -dx * Math.sin(dock.angle) + dz * Math.cos(dock.angle);
  const drySandInner = coastlineBandRadius(Math.atan2(-z, x), 10.5);
  return radius >= 11.7 && radius <= 13.45 && Math.hypot(x, z) >= drySandInner + .32
    && !(Math.abs(localX) < dock.halfWidth + .4 && Math.abs(localZ) < dock.halfDepth + .4);
}

function safeSegment(crab, x, z) {
  for (let i = 1; i <= 12; i++) {
    if (!safeSandCrabPoint(crab.x + (x - crab.x) * i / 12, crab.z + (z - crab.z) * i / 12)) return false;
  }
  return true;
}

function chooseTarget(crab) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const angle = random(crab) * TAU, distance = .5 + random(crab) * 2.2;
    const x = crab.x + Math.cos(angle) * distance, z = crab.z + Math.sin(angle) * distance;
    if (Math.hypot(x - crab.homeX, z - crab.homeZ) > 3 || !safeSegment(crab, x, z)) continue;
    crab.targetX = x; crab.targetZ = z;
    crab.cruise = .22 + random(crab) * .35;
    crab.targetSeconds = 3 + random(crab) * 5;
    // Choose the side requiring the smallest turn, so reversing direction
    // can be a left-side step rather than turning the crab's face backwards.
    const direction = Math.atan2(z - crab.z, x - crab.x);
    const right = wrap(direction - Math.PI / 2 - crab.heading);
    const left = wrap(direction + Math.PI / 2 - crab.heading);
    crab.side = Math.abs(right) <= Math.abs(left) ? 1 : -1;
    return;
  }
  crab.targetX = crab.x; crab.targetZ = crab.z;
  crab.pause = .6 + random(crab); crab.targetSeconds = 1;
}

export function createSandCrab(radius, angle, seed) {
  const crab = { seed: seed >>> 0, heading: angle, gait: random({ seed: seed >>> 0 }) * TAU,
    activity: 0, speed: 0, pause: 0, accumulator: 0, side: 1 };
  let normalized = clamp(radius, 12.0, 13.1);
  let x, z;
  for (let attempt = 0; attempt < 64; attempt++) {
    const safeRadius = shoreRadiusAt(Math.cos(angle), Math.sin(angle)) * normalized / 14.7;
    x = Math.cos(angle) * safeRadius; z = Math.sin(angle) * safeRadius;
    if (safeSandCrabPoint(x, z)) break;
    angle += .24; normalized = 12.3;
  }
  crab.x = crab.homeX = x; crab.z = crab.homeZ = z;
  chooseTarget(crab);
  crab.heading = Math.atan2(crab.targetZ - z, crab.targetX - x) - crab.side * Math.PI / 2;
  crab.pause = random(crab) * 1.8;
  return crab;
}

function tick(crab) {
  crab.speed = 0;
  if (crab.pause > 0) {
    crab.pause = Math.max(0, crab.pause - TICK);
    crab.activity = Math.max(0, crab.activity - TICK * 6);
    if (!crab.pause) chooseTarget(crab);
    return;
  }
  crab.targetSeconds -= TICK;
  let distance = Math.hypot(crab.targetX - crab.x, crab.targetZ - crab.z);
  if (distance < .07 || crab.targetSeconds <= 0) {
    if (random(crab) < .5) {
      crab.pause = .5 + random(crab) * 2.2;
      crab.activity = Math.max(0, crab.activity - TICK * 6);
      return;
    }
    chooseTarget(crab);
    if (crab.pause > 0) { crab.activity = Math.max(0, crab.activity - TICK * 6); return; }
    distance = Math.hypot(crab.targetX - crab.x, crab.targetZ - crab.z);
  }
  const desired = Math.atan2(crab.targetZ - crab.z, crab.targetX - crab.x) - crab.side * Math.PI / 2;
  const turn = wrap(desired - crab.heading);
  crab.heading = wrap(crab.heading + clamp(turn, -TICK * 2.5, TICK * 2.5));
  // Pivot in place before walking. Every translating step is perpendicular
  // to the shell's forward axis; no head-first sliding around corners.
  if (Math.abs(turn) > .06) {
    crab.activity = Math.max(0, crab.activity - TICK * 6);
    return;
  }
  const direction = crab.heading + crab.side * Math.PI / 2;
  const step = Math.min(distance, crab.cruise * TICK);
  const x = crab.x + Math.cos(direction) * step, z = crab.z + Math.sin(direction) * step;
  if (!safeSandCrabPoint(x, z)) { chooseTarget(crab); return; }
  crab.x = x; crab.z = z; crab.speed = step / TICK;
  crab.activity = Math.min(1, crab.activity + TICK * 8);
  crab.gait = (crab.gait + step / .15 * TAU * crab.side) % TAU;
}

export function stepSandCrab(crab, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return crab;
  crab.accumulator += Math.min(seconds, .25);
  while (crab.accumulator + 1e-10 >= TICK) {
    tick(crab); crab.accumulator = Math.max(0, crab.accumulator - TICK);
  }
  return crab;
}

// Alternating tetrads: four stance legs support the body while the other four
// sweep and lift. Rendering uses the same phase offsets in the vertex shader.
export function sandCrabLegPose(index, phase, activity) {
  const offset = ((index % 4) % 2 + Math.floor(index / 4)) * Math.PI;
  const swing = Math.sin(phase + offset), weight = clamp(activity, 0, 1);
  if (!weight) return { yaw: 0, lift: 0 };
  return { yaw: swing * .24 * weight, lift: Math.max(0, swing) * .065 * weight };
}
