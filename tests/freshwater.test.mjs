import assert from 'node:assert/strict';
import { freshState } from '../src/economy.js';
import { advanceHydration, collectAtDawn, drinkWater, refillCanteen, staminaCeiling } from '../src/freshwater.js';

const state = freshState(0);
state.freshwater.hydration = 20;
assert.equal(staminaCeiling(state), 75);
state.stamina = 90;
advanceHydration(state, 60);
assert.equal(state.stamina, 75);
assert.equal(drinkWater(state).ok, true);
assert.equal(Math.round(state.freshwater.hydration), 53);

state.freshwater.canteen = 0;
const tankBefore = state.freshwater.tank;
assert.equal(refillCanteen(state).transferred, 4);
assert.equal(state.freshwater.tank, tankBefore - 4);

state.freshwater.tank = 0;
state.freshwater.lastYieldDay = 1;
assert.equal(collectAtDawn(state, 2), 4); // dew + light rain
assert.equal(collectAtDawn(state, 2), 0); // once per dawn

console.log('freshwater survival check passed');
