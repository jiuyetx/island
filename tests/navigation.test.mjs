import assert from 'node:assert/strict';
import { blocked, clearSegment, planWalkRoute } from '../src/navigation.js';
import { DOCK_APPROACH, DOCK_DECK_OBSTACLE, TRADE_SIGN_POSITION } from '../src/dockNavigation.js';

const obstacles = [
  { type: 'box', x0: -.68, x1: 3.88, z0: -3.25, z1: .45 },
  { type: 'box', x0: -.3, x1: 1.55, z0: -4.95, z1: -3.77 },
  { x: 2.55, z: -4.26, r: .62 },
  { x: -3.2, z: -4.8, r: .5 },
];
const start = { x: -1.3, z: .8 };
const goal = { x: 2, z: -2 };
const route = planWalkRoute(start, goal, obstacles);
assert.ok(route.length > 0, 'there must be a reachable approach to the hut');
assert.ok(!blocked(route.at(-1).x, route.at(-1).z, obstacles));
for (let i = 0; i < route.length; i++) {
  assert.ok(clearSegment(i ? route[i - 1] : start, route[i], obstacles), 'route must not cross walls or plants');
}
assert.ok(!clearSegment(start, goal, obstacles), 'a straight walk through the hut is blocked');
for (const destination of [{ x: -5.1, z: -5.5 }, DOCK_APPROACH]) {
  const fromPorch = { x: 1.6, z: -5.4 };
  const path = planWalkRoute(fromPorch, destination, obstacles);
  assert.ok(path.length, 'porch must connect to farm and dock');
  for (let i = 0; i < path.length; i++)
    assert.ok(clearSegment(i ? path[i - 1] : fromPorch, path[i], obstacles), 'porch route must clear furniture');
}
const spawn = { x: -2, z: -3.9 };
const porch = { x: 1.6, z: -5.4 };
const porchRoute = planWalkRoute(spawn, porch, obstacles);
assert.ok(porchRoute.length, 'spawn must reach the hut entrance');
for (let i = 0; i < porchRoute.length; i++)
  assert.ok(clearSegment(i ? porchRoute[i - 1] : spawn, porchRoute[i], obstacles), 'hut entrance route must clear porch furniture');
const doorThreshold = { x: 1.5, z: -3.55 };
for (const from of [spawn, { x: 8, z: -5 }]) {
  const route = planWalkRoute(from, doorThreshold, obstacles, 31);
  assert.ok(route.length, 'the door threshold must be reachable from both sides of the island');
  for (let i = 0; i < route.length; i++)
    assert.ok(clearSegment(i ? route[i - 1] : from, route[i], obstacles, 31), 'door route must clear hut and porch');
}

const palm = [{ x: 0, z: 0, r: .7 }];
const aroundPalm = planWalkRoute({ x: -2, z: 0 }, { x: 2, z: 0 }, palm);
assert.ok(aroundPalm.length >= 2);
for (let i = 0; i < aroundPalm.length; i++)
assert.ok(clearSegment(i ? aroundPalm[i - 1] : { x: -2, z: 0 }, aroundPalm[i], palm));

assert.ok(blocked(9.2, 6.4, [DOCK_DECK_OBSTACLE]), 'the old trading point must be inside the raised dock');
assert.ok(!blocked(DOCK_APPROACH.x, DOCK_APPROACH.z, [DOCK_DECK_OBSTACLE]), 'trading point must be on shore');
assert.ok(!blocked(TRADE_SIGN_POSITION.x, TRADE_SIGN_POSITION.z, [DOCK_DECK_OBSTACLE]), 'trade sign must not overlap dock');
assert.ok(Math.hypot(DOCK_APPROACH.x - 5.9, DOCK_APPROACH.z - 4.8) > 1.5,
  'trading point must clear the nearby palm silhouette');
for (const start of [{ x: 0, z: 0 }, { x: 8, z: 3 }, { x: 12, z: 10 }]) {
  const dockRoute = planWalkRoute(start, DOCK_APPROACH, [DOCK_DECK_OBSTACLE], 31);
  assert.ok(dockRoute.length, 'dock trading point must stay reachable');
  for (let i = 0; i < dockRoute.length; i++)
    assert.ok(clearSegment(i ? dockRoute[i - 1] : start, dockRoute[i], [DOCK_DECK_OBSTACLE], 31), 'route must avoid dock deck');
}

console.log('navigation check passed');
