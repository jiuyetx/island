import assert from 'node:assert/strict';
import { ISLANDS, PORTS, WORLD_RADIUS, autopilotInput, islandResourcePoint, landingPoint, navigable, normalizeVoyage, planSeaRoute, stepHelm, harvestIsland } from '../src/voyage.js';
import { freshState, normalizeState, eatMeal, advanceGameTime } from '../src/economy.js';

for (const island of PORTS) {
  const port = landingPoint(island);
  assert.ok(navigable(port.x, port.z), `${island.name} has a safe sea landing`);
  assert.equal(navigable(island.x, island.z), false, 'boats cannot sail across land');
}
assert.equal(navigable(NaN, 1), false);
assert.equal(navigable(WORLD_RADIUS + 1, 0), false);
for (const a of PORTS) for (const b of PORTS) {
  if (a === b) continue;
  const start = landingPoint(a), end = landingPoint(b), route = planSeaRoute(start, end);
  assert.ok(route.length, `${a.name} → ${b.name} reachable`);
  let previous = start;
  for (const point of route) {
    const steps = Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / .2);
    for (let i = 0; i <= steps; i++) assert.ok(navigable(previous.x + (point.x - previous.x) * i / steps, previous.z + (point.z - previous.z) * i / steps), 'all route segments stay offshore');
    previous = point;
  }
  assert.deepEqual(route.at(-1), end);
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const maxSpeed of [5, 6.5, 9]) {
    const sailor = { ...normalizeVoyage(null), ...start, heading };
    const waypoints = route.slice();
    for (let n = 0; n < 4000 && (waypoints.length || sailor.speed > .01); n++) {
      const result = stepHelm(sailor, .1, { ...autopilotInput(sailor, waypoints, maxSpeed), maxSpeed });
      assert.equal(result.collision, false, 'autopilot accounts for turning AND final stopping distance');
    }
    assert.equal(waypoints.length, 0, 'autopilot actually reaches every port');
    assert.ok(Math.hypot(sailor.x - end.x, sailor.z - end.z) < 2, 'ship stops beside the buoy, not beyond the beach');
  }
}
let v = normalizeVoyage(null);
const huge = stepHelm(v, 3600, { throttle: 1 });
assert.ok(huge.distance < .1, 'frame gaps do not teleport the boat');
v = normalizeVoyage({ mode: 'sailing', x: 40, z: 0 });
for (let i = 0; i < 100; i++) stepHelm(v, .1, { throttle: 1 });
assert.ok(v.distance > 40 && v.speed <= 5);
const island = ISLANDS[0];
v = { ...normalizeVoyage(null), x: island.x, z: island.z - island.radius - .9, heading: 0, speed: 5 };
const collision = stepHelm(v, .1, { throttle: 1 });
assert.equal(collision.collision, true); assert.equal(v.speed, 0);
assert.equal(planSeaRoute(landingPoint(PORTS[0]), { x: 0, z: 0 }).length, 0);
assert.equal(normalizeVoyage({ mode: 'sailing', x: NaN, z: Infinity }).mode, 'sailing'); // safe mooring fallback
assert.equal(normalizeVoyage({ mode: 'sailing', x: 0, z: 0 }).mode, 'home');
assert.equal(normalizeVoyage({ mode: 'ashore', islandId: 'made-up', x: 30, z: 30 }).mode, 'home');
assert.deepEqual(normalizeVoyage({ discovered: ['spring', 'spring', 'invalid'] }).discovered, ['home', 'spring']);

const state = freshState();
function land(id) {
  const target = ISLANDS.find(i => i.id === id), port = landingPoint(target);
  state.voyage = normalizeVoyage({ ...state.voyage, mode: 'ashore', islandId: id, ...port, walkX: target.x, walkZ: target.z });
}
assert.equal(harvestIsland(state, 'ruins').ok, false, 'cannot collect remotely');
land('ruins');
state.voyage.walkX += 4;
assert.equal(harvestIsland(state, 'ruins').ok, false, 'even on the island, distant resources cannot be captured');
state.voyage.walkX -= 4;
const beforeGold = state.gold;
assert.equal(harvestIsland(state, 'ruins').ok, true); assert.equal(state.gold, beforeGold + 65);
assert.equal(harvestIsland(state, 'ruins').ok, false);
state.gameMinutes += 1441;
assert.equal(harvestIsland(state, 'ruins').ok, false, 'treasure cannot be farmed');
const roundTrip = normalizeState(JSON.parse(JSON.stringify(state)));
assert.equal(roundTrip.voyage.mode, 'ashore'); assert.equal(roundTrip.voyage.islandId, 'ruins');
assert.equal(harvestIsland(roundTrip, 'ruins').ok, false, 'reward remains claimed after reload');
land('grove');
const food = state.food;
assert.equal(harvestIsland(state, 'grove').ok, true); assert.equal(state.food, food + 3);
state.inventory.corn = 1; state.satiety = 20;
assert.equal(eatMeal(state, 'food').ok, true); assert.equal(state.food, food + 2);
assert.equal(state.inventory.corn, 1, 'explicit food action does not eat valuable crops instead');
assert.equal(harvestIsland(state, 'grove').ok, false);
state.gameMinutes += 1441;
assert.equal(harvestIsland(state, 'grove').ok, true);
land('spring'); state.freshwater.canteen = 0;
assert.equal(harvestIsland(state, 'spring').ok, true);
assert.equal(state.freshwater.canteen, state.freshwater.canteenCapacity);
land('beacon'); state.backpackCapacity = 0;
assert.equal(harvestIsland(state, 'beacon').ok, false);
assert.equal(state.voyage.harvested['beacon-main'], undefined);
state.backpackCapacity = 20;
assert.equal(harvestIsland(state, 'beacon').ok, true);
assert.equal(state.inventory.pineappleSeed, 2);
const wood = state.wood;
const woodPoint = islandResourcePoint(ISLANDS.find(i => i.id === 'beacon'), 'wood');
state.voyage.walkX = woodPoint.x; state.voyage.walkZ = woodPoint.z;
assert.equal(harvestIsland(state, 'beacon', 'wood').ok, true); assert.equal(state.wood, wood + 3);
state.stamina = 0; state.gameMinutes += 1441;
assert.equal(harvestIsland(state, 'beacon', 'wood').ok, false);
const minutes = state.gameMinutes;
advanceGameTime(state, .1 * .125);
assert.ok(state.gameMinutes - minutes <= .026, 'passive voyage ticks at ordinary survival clock speed');
console.log('voyage: routes, collision, frame timing, supplies and persistent discoveries passed');
