// Arithmetic checks for the proposed design, not tests of the implemented game.
import assert from 'node:assert/strict';

const close = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
};

const cropDaily = 4 * (2 * 6 - 5);
const catchGross = 3 * .65 * 18 + 4 * .95 * 6 + .85 * 6 + 2 * .65 * 26 + .6 * 36;
close(catchGross + cropDaily - 1 - 3, 142.4);
assert.equal(20 + 24 + 16 + 4 + 20 + 12, 96);
assert.equal(2 + 3 + 2 + .5 + .5 + 2 + 1.5 + .5 + .5, 12.5);
assert.equal(8 + 3 + 5 + 2 + 1, 19); // Worst-case products fit the 20-unit pack.

const cropLoss = (wind, flood, net = 1, drain = 1) => 1 - (1 - wind * net) * (1 - flood * drain);
close(cropLoss(.3, .15), .405);
close(cropLoss(.45, .3), .615);
close(cropLoss(.6, .45), .78);
close(cropLoss(.6, .45, .4, .3), .3426);
const exposed = 40 * 6 * .78 + 20 * 26 * .5 + 90 * 2 + 75 + 60;
const guarded = 40 * 6 * .3426 + 20 * 26 * .1 + 27 * 2 + 30 + 24;
close(exposed, 762.2);
close(guarded, 242.224);
const defenseCost = Math.ceil(20 / 6) * (60 + 80) + 70 + 50 + 100 + 60;
assert.equal(defenseCost, 840);
close(exposed - guarded - defenseCost * .1, 435.976);
assert.equal((defenseCost / (exposed - guarded - defenseCost * .1)).toFixed(2), '1.93');
assert.equal(60 + 120 + 240, 420);
assert.equal((70 / (2 * .65 * 18 - 1.5 * .65 * 18)).toFixed(0), '12');
assert.equal((240 / (.5 * 14.3 - 5)).toFixed(0), '112');
console.log('Design arithmetic passed. Gameplay balance and runtime remain unverified.');
