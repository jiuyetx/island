import assert from 'node:assert/strict';
import { HUT_DOOR_INSIDE, HUT_DOOR_OUTSIDE, createHutCrossing, hutControls, hutDoorIntent, isOutsideHut, keepHutControlsOpen, stepHutCrossing } from '../src/hut.js';
import { freshState, normalizeState } from '../src/economy.js';
import { blocked, planWalkRoute } from '../src/navigation.js';

const state = freshState(0);
state.shelter.inside = true;
state.stamina = 0; state.satiety = 0; state.freshwater.hydration = 0;
const shelter = state.shelter;
assert.equal(hutDoorIntent(shelter), 'open');
assert.equal(hutControls(shelter)[0].id, 'hut-door');
assert.equal(createHutCrossing(shelter, HUT_DOOR_INSIDE, false), null);
shelter.doorOpen = true;
assert.equal(hutDoorIntent(shelter), 'close'); // Indoors the door itself closes, never silently exits.
assert.deepEqual(hutControls(shelter).map(({ id }) => id), ['hut-close', 'hut-exit']);
const destination = { x: -1, z: -6 };
const crossing = createHutCrossing(shelter, HUT_DOOR_INSIDE, false, destination);
assert.equal(crossing.destination, destination);
assert.equal(createHutCrossing(shelter, HUT_DOOR_INSIDE, true), null);
const halfway = stepHutCrossing(shelter, crossing, .425);
assert.equal(halfway.done, false); assert.equal(shelter.inside, true);
assert.equal(halfway.z, (HUT_DOOR_INSIDE.z + HUT_DOOR_OUTSIDE.z) / 2);
const completed = stepHutCrossing(shelter, crossing, .425);
assert.equal(completed.done, true); assert.equal(shelter.inside, false);
assert.equal(shelter.doorOpen, true); // Closing is a separate action.
assert.deepEqual({ x: completed.x, z: completed.z }, HUT_DOOR_OUTSIDE);
assert.equal(state.stamina, 0); // Low resources cannot trap the player indoors.
assert.equal(normalizeState(JSON.parse(JSON.stringify(state))).shelter.inside, false);
assert.equal(hutDoorIntent(shelter), 'enter');
assert.equal(hutDoorIntent(shelter, 3), 'approach');
const entering = createHutCrossing(shelter, HUT_DOOR_OUTSIDE, true, destination);
assert.equal(entering.destination, null);
stepHutCrossing(shelter, entering, 1);
assert.equal(shelter.inside, true);
assert.equal(hutDoorIntent(shelter), 'close');
shelter.doorOpen = false;
assert.equal(hutDoorIntent(shelter), 'open');
assert.equal(hutControls(shelter).length, 1);
assert.equal(keepHutControlsOpen('hut-close', shelter), true, 'tap dispatcher must not hide indoor controls after closing');
assert.equal(keepHutControlsOpen('hut-door', shelter), true, 'reopening must keep the explicit exit available');
assert.equal(keepHutControlsOpen('hut-exit', shelter), false);
assert.equal(shelter.inside, true, 'closing must keep the player indoors');
const closedSave = normalizeState(JSON.parse(JSON.stringify(state)));
assert.equal(closedSave.shelter.inside, true);
assert.equal(closedSave.shelter.doorOpen, false);
assert.equal(createHutCrossing(shelter, HUT_DOOR_INSIDE, false), null, 'closed doors block exiting');
shelter.doorOpen = true;
assert.equal(hutControls(shelter)[0].id, 'hut-close', 'opening restores visible closing action');
const reopeningExit = createHutCrossing(shelter, HUT_DOOR_INSIDE, false);
assert.ok(reopeningExit, 'explicit exit remains available after closing and reopening');
stepHutCrossing(shelter, reopeningExit, 1);
assert.equal(shelter.inside, false);
assert.equal(hutControls(shelter)[0].id, 'hut-door');
assert.equal(keepHutControlsOpen('hut-close', shelter), false);
assert.equal(isOutsideHut(HUT_DOOR_INSIDE), false);
assert.equal(isOutsideHut(HUT_DOOR_OUTSIDE), true);
assert.equal(isOutsideHut(destination), true);
const houseObstacles = [
  { type: 'box', x0: -.68, x1: 3.88, z0: -3.25, z1: .45 },
  { type: 'box', x0: -.3, x1: 1.55, z0: -4.95, z1: -3.77 },
  { x: 2.55, z: -4.26, r: .62 }, { x: .25, z: -4.72, r: .24 }, { x: 2.95, z: -4.72, r: .24 },
];
assert.equal(blocked(HUT_DOOR_OUTSIDE.x, HUT_DOOR_OUTSIDE.z, houseObstacles), false);
assert.ok(planWalkRoute(HUT_DOOR_OUTSIDE, destination, houseObstacles, 31).length > 0);
assert.deepEqual(stepHutCrossing(shelter, entering, NaN), { ...HUT_DOOR_INSIDE, done: true });

// Moving the obstructing palm must work for existing saves without resetting
// harvested/growing trees or their care history.
const oldSave = freshState(0);
const oldPalm = oldSave.trees.find(tree => tree.id === 'palm3');
Object.assign(oldPalm, { x: 4.8, z: -5.5, stage: 'growing', ageMinutes: 400, health: 65, lastTendedDay: 2 });
const relocated = normalizeState(JSON.parse(JSON.stringify(oldSave)));
const movedPalm = relocated.trees.find(tree => tree.id === 'palm3');
assert.deepEqual([movedPalm.x, movedPalm.z], [11.8, 0]);
for (const key of ['stage', 'ageMinutes', 'health', 'lastTendedDay']) assert.equal(movedPalm[key], oldPalm[key]);
assert.equal(relocated.trees.length, oldSave.trees.length);
assert.ok(Math.hypot(movedPalm.x - HUT_DOOR_OUTSIDE.x, movedPalm.z - HUT_DOOR_OUTSIDE.z) > 8,
  'mature crown must remain well outside the door and approach');
assert.ok(relocated.trees.filter(tree => tree.id !== movedPalm.id)
  .every(tree => Math.hypot(tree.x - movedPalm.x, tree.z - movedPalm.z) > 4), 'new site avoids neighbouring palms');
const trees = relocated.trees.filter(tree => ['mature', 'growing'].includes(tree.stage))
  .map(tree => ({ x: tree.x, z: tree.z, r: .32 + tree.scale * .2 }));
const hutApproach = { x: 1.6, z: -5.4 };
assert.equal(blocked(hutApproach.x, hutApproach.z, [...houseObstacles, ...trees]), false);
assert.ok(planWalkRoute(hutApproach, HUT_DOOR_OUTSIDE, [...houseObstacles, ...trees], 31).length > 0);
console.log('hut: door intent, crossing, saved state, relocated palm and clear outdoor route passed');
