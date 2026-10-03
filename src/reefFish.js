import { fishPointClear, fishAvoidanceDirection } from './fishSpacing.js';

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const angleDelta = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
function random(fish) {
  fish.seed = (Math.imul(fish.seed, 1664525) + 1013904223) >>> 0;
  return fish.seed / 4294967296;
}

export function safeReefFishPoint(fish, x, z) {
  const radius = Math.hypot(x, z);
  return radius > fish.islandRadius + 3.05 && radius < fish.islandRadius + 10
    && Math.hypot(x - fish.homeX, z - fish.homeZ) <= 5.2
    && Math.hypot(x - fish.portX, z - fish.portZ) > 3.1;
}

function safeSegment(fish, x, z) {
  for (let i = 1; i <= 12; i++) {
    if (!safeReefFishPoint(fish, fish.x + (x - fish.x) * i / 12, fish.z + (z - fish.z) * i / 12)) return false;
  }
  return true;
}

function chooseTarget(fish) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = random(fish) * TAU, radius = Math.sqrt(random(fish)) * 4.8;
    const x = fish.homeX + Math.cos(angle) * radius, z = fish.homeZ + Math.sin(angle) * radius;
    if (Math.hypot(x - fish.x, z - fish.z) < 1 || !safeSegment(fish, x, z)) continue;
    fish.targetX = x; fish.targetZ = z;
    fish.cruiseSpeed = .25 + random(fish) * .48;
    fish.targetSeconds = 4 + random(fish) * 8;
    return;
  }
  fish.targetX = fish.homeX; fish.targetZ = fish.homeZ; fish.targetSeconds = 2;
}

// Each fish owns a small feeding patch, not an island-centred angular orbit.
// Targets, speed changes and pauses are independently seeded and frame based.
export function createReefFish(islandRadius, port, index, seed, neighbors = []) {
  const fish = { islandRadius, portX: port.x, portZ: port.z, seed: seed >>> 0,
    speed: 0, heading: 0, pause: 0, targetSeconds: 0, clearanceRadius: .5, active: true };
  let angle = index * 2.399 + random(fish) * .6;
  const radius = islandRadius + 5.5 + random(fish) * 1.1;
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let attempt = 0; attempt < 128; attempt++) {
    if (Math.hypot(x - port.x, z - port.z) >= 4 && fishPointClear(fish, x, z, neighbors)) break;
    angle += .37; x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  fish.x = fish.homeX = x; fish.z = fish.homeZ = z;
  chooseTarget(fish); fish.heading = Math.atan2(fish.targetZ - z, fish.targetX - x);
  return fish;
}

export function stepReefFish(fish, seconds, neighbors = []) {
  const dt = clamp(Number.isFinite(seconds) ? seconds : 0, 0, .1);
  if (!dt) return fish;
  fish.targetSeconds -= dt;
  const distance = Math.hypot(fish.targetX - fish.x, fish.targetZ - fish.z);
  if (fish.pause > 0) {
    fish.pause = Math.max(0, fish.pause - dt); fish.speed = 0;
    if (!fish.pause) chooseTarget(fish);
    return fish;
  }
  if (distance < .3 || fish.targetSeconds <= 0) {
    if (random(fish) < .32) { fish.pause = .7 + random(fish) * 2; fish.speed = 0; return fish; }
    chooseTarget(fish);
  }
  const direction = fishAvoidanceDirection(fish, fish.targetX - fish.x, fish.targetZ - fish.z, neighbors);
  const desired = Math.atan2(direction.z, direction.x);
  const turn = angleDelta(desired - fish.heading);
  fish.heading = angleDelta(fish.heading + clamp(turn, -dt * .9, dt * .9));
  const desiredSpeed = fish.cruiseSpeed * Math.max(.08, Math.cos(turn));
  fish.speed += clamp(desiredSpeed - fish.speed, -dt * 1.2, dt * .5);
  const x = fish.x + Math.cos(fish.heading) * fish.speed * dt;
  const z = fish.z + Math.sin(fish.heading) * fish.speed * dt;
  if (!safeReefFishPoint(fish, x, z) || !fishPointClear(fish, x, z, neighbors)) { fish.speed = 0; chooseTarget(fish); return fish; }
  fish.x = x; fish.z = z;
  return fish;
}
