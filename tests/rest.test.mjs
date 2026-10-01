import assert from 'node:assert/strict';
import { planRest, bedRestPlan, restProgress, restPreview, restNutritionCost } from '../src/rest.js';

const transition = { elapsed: 0, fromMinutes: 480, targetMinutes: 570,
  initialStamina: 50, staminaGain: 25, recoveryCap: 70 };
const normalRate = .125 * 2;
assert.deepEqual(restPreview(planRest(480, 50, undefined, 70), 480, 50, 70, normalRate),
  { gameMinutes: 90, realSeconds: 360, staminaGain: 20 });
assert.equal(restPreview({ ok: false }, 480, 50, 70, normalRate), null);
assert.equal(restNutritionCost('nap', .5), 5);
assert.equal(restNutritionCost('overnight', .5), 10);
assert.equal(restNutritionCost('nap', 0), 0);
assert.equal(restNutritionCost('nap', 2), 10);
// Splitting a rest into several short sessions does not bypass its nutrition cost.
assert.equal(restNutritionCost('nap', .2) * 5, restNutritionCost('nap', 1));
const first = restProgress(transition, 4, normalRate);
assert.equal(first.minutes, 481); // Four real seconds advance one game minute, just like ordinary play.
assert.equal(first.done, false);
assert.ok(first.stamina > 50 && first.stamina < 51);
assert.deepEqual(restProgress(transition, 176, normalRate), { progress: .5, minutes: 525, stamina: 62.5, done: false });
assert.deepEqual(restProgress(transition, 181, normalRate), { progress: 1, minutes: 570, stamina: 70, done: true });
assert.equal(restProgress(transition, 1, normalRate).stamina, 70);
const overnight = { ...transition, elapsed: 0, fromMinutes: 1200, targetMinutes: 1800 };
assert.equal(restProgress(overnight, 4, normalRate).minutes, 1201);
assert.equal(restProgress(overnight, 0, normalRate).done, false);

const indoors = { shelter: { inside: true, doorOpen: false }, satiety: 60,
  stamina: 50, recoveryCap: 100, gameMinutes: 480 };
assert.equal(bedRestPlan(indoors).ok, true);
assert.equal(bedRestPlan(indoors, true).reason, 'busy');
assert.equal(bedRestPlan({ ...indoors, shelter: { inside: false } }).reason, 'outside');
assert.equal(bedRestPlan({ ...indoors, shelter: { inside: true, doorOpen: true } }).reason, 'door');
assert.equal(bedRestPlan({ ...indoors, satiety: 19 }).reason, 'food');
assert.equal(bedRestPlan({ ...indoors, recoveryCap: 50 }).reason, 'nutrition');
assert.equal(bedRestPlan({ ...indoors, stamina: 100 }).reason, 'full');

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
