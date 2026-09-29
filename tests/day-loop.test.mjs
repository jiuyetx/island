import assert from 'node:assert/strict';
import { advanceGameTime, buyItem, freshState, plantCrop, harvestCrop, sellItem } from '../src/economy.js';

const state = freshState(0);
for (const plot of state.plots) assert.equal(plantCrop(state, plot.id, 'sweetPotato').ok, true);
advanceGameTime(state, (1800 - state.gameMinutes) / 2);
assert.equal(state.dayId, 2);
for (const plot of state.plots) assert.equal(harvestCrop(state, plot.id).quantity, 2);
assert.equal(sellItem(state, 'sweetPotato', state.inventory.sweetPotato).value, 32);
assert.equal(buyItem(state, 'tomatoSeed', 4).cost, 20);
for (const plot of state.plots) assert.equal(plantCrop(state, plot.id, 'tomato').ok, true);

const harvestAt = Math.max(...state.plots.map((plot) => plot.crop.plantedAt + 1440));
advanceGameTime(state, (harvestAt - state.gameMinutes) / 2);
assert.equal(state.dayId, 3);
for (const plot of state.plots) assert.equal(harvestCrop(state, plot.id).quantity, 2);
assert.equal(sellItem(state, 'tomato', state.inventory.tomato).value, 48);
assert.equal(state.gold, 140); // 80 start + 32 crops - 20 seeds + 48 crops.
assert.equal(state.soldLifetime, 80);
console.log('three-day loop passed');
