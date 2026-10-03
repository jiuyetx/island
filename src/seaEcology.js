import { coastlineRadius } from './coastline.js';
import { fishPointClear, fishAvoidanceDirection } from './fishSpacing.js';

const FISH_SHORE_CLEARANCE = 3.2;

export function shoreRadiusAt(x, z) {
  return coastlineRadius(Math.atan2(-z, x));
}

// Washed-up supplies belong on dry upper sand, not on the grassy island core.
export function upperBeachPoint(angle, inset = 1.8) {
  const x = Math.cos(angle), z = Math.sin(angle);
  const radius = shoreRadiusAt(x, z) - inset;
  return { x: x * radius, z: z * radius };
}

export function offshorePlacements(placements, clearance = 2) {
  return placements.filter(([x, , z]) => Math.hypot(x, z) > shoreRadiusAt(x, z) + clearance);
}

function nextRandom(roamer) {
  roamer.seed = (Math.imul(roamer.seed, 1664525) + 1013904223) >>> 0;
  return roamer.seed / 4294967296;
}

function chooseTarget(roamer) {
  const angle = nextRandom(roamer) * Math.PI * 2;
  const distance = 1.6 + nextRandom(roamer) * 2.5;
  let x = roamer.homeX + Math.cos(angle) * distance;
  let z = roamer.homeZ + Math.sin(angle) * distance;
  const minRadius = shoreRadiusAt(x, z) + FISH_SHORE_CLEARANCE;
  const radius = Math.hypot(x, z);
  if (radius < minRadius) {
    x *= minRadius / radius;
    z *= minRadius / radius;
  }
  roamer.targetX = x;
  roamer.targetZ = z;
}

export function createRoamer(radius, phase, speed, seed, neighbors = [], clearanceRadius = .6) {
  const roamer = {
    targetX: 0, targetZ: 0, heading: 0, speed, seed: seed >>> 0,
    clearanceRadius, active: true,
  };
  for (let attempt = 0; attempt < 128; attempt++) {
    const angle = phase + attempt * 2.399;
    const safeRadius = Math.max(radius + Math.floor(attempt / 32) * 1.5,
      shoreRadiusAt(Math.cos(angle), Math.sin(angle)) + FISH_SHORE_CLEARANCE);
    roamer.x = roamer.homeX = Math.cos(angle) * safeRadius;
    roamer.z = roamer.homeZ = Math.sin(angle) * safeRadius;
    if (fishPointClear(roamer, roamer.x, roamer.z, neighbors)) break;
  }
  chooseTarget(roamer);
  roamer.heading = Math.atan2(roamer.targetZ - roamer.z, roamer.targetX - roamer.x);
  return roamer;
}

export function stepRoamer(roamer, seconds, neighbors = []) {
  let dx = roamer.targetX - roamer.x;
  let dz = roamer.targetZ - roamer.z;
  let distance = Math.hypot(dx, dz);
  if (distance < .18) {
    chooseTarget(roamer);
    dx = roamer.targetX - roamer.x;
    dz = roamer.targetZ - roamer.z;
    distance = Math.hypot(dx, dz);
  }
  if (distance <= 0 || seconds <= 0) return roamer;
  const dt = Math.min(.1, seconds);
  const direction = fishAvoidanceDirection(roamer, dx, dz, neighbors);
  const step = Math.min(distance, roamer.speed * dt);
  const nextX = roamer.x + direction.x * step;
  const nextZ = roamer.z + direction.z * step;
  if (Math.hypot(nextX, nextZ) <= shoreRadiusAt(nextX, nextZ) + FISH_SHORE_CLEARANCE
    || !fishPointClear(roamer, nextX, nextZ, neighbors)) {
    chooseTarget(roamer);
    return roamer;
  }
  roamer.x = nextX;
  roamer.z = nextZ;
  const desired = Math.atan2(direction.z, direction.x);
  const turn = Math.atan2(Math.sin(desired - roamer.heading), Math.cos(desired - roamer.heading));
  roamer.heading += turn * Math.min(1, dt * 1.8);
  return roamer;
}
