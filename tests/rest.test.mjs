import assert from 'node:assert/strict';
import { planRest } from '../src/rest.js';

const at = (day, hour, minute = 0) => (day - 1) * 1440 + hour * 60 + minute;
assert.deepEqual(planRest(at(1, 8, 7), 100), { ok: false, reason: 'full' });
assert.deepEqual(planRest(at(1, 8, 7), 60), {
  ok: true, kind: 'nap', targetMinutes: at(1, 9, 37), staminaGain: 25, interruptedByStorm: false,
});
assert.equal(planRest(at(1, 17, 45), 60).targetMinutes, at(1, 18));
assert.equal(planRest(at(1, 20), 100).targetMinutes, at(2, 6));
assert.equal(planRest(at(2, 2), 30).targetMinutes, at(2, 6));
assert.deepEqual(planRest(at(4, 20), 30, at(6, 12)), { ok: false, reason: 'storm' });
const beforeWarning = planRest(at(4, 17), 30, at(6, 17, 30));
assert.equal(beforeWarning.targetMinutes, at(4, 17, 30));
assert.equal(beforeWarning.interruptedByStorm, true);
console.log('rest timing check passed');
