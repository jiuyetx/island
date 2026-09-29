import assert from 'node:assert/strict';
import { advanceFishingSession, createFishingSession, fishingCue, hookFish, setFishingForce } from '../src/fishing.js';
import { catchSeafood, freshState } from '../src/economy.js';

const early = createFishingSession('reefFish', 1, () => 0);
advanceFishingSession(early, 1);
assert.equal(hookFish(early), false);
assert.equal(early.reason, 'too-early');

const missed = createFishingSession('reefFish', 1, () => 0);
advanceFishingSession(missed, missed.biteAt + missed.biteWindow + .01);
assert.equal(missed.reason, 'missed-bite');

const precise = createFishingSession('reefFish', 1, () => 0);
advanceFishingSession(precise, precise.biteAt + precise.biteWindow * .43);
assert.equal(hookFish(precise), true);
assert(precise.timingQuality > .99);
for (let i = 0; i < 100 && precise.phase === 'reeling'; i++) {
  setFishingForce(precise, fishingCue(precise));
  advanceFishingSession(precise, .05);
}
assert.equal(precise.phase, 'landed');

const rough = createFishingSession('silverJack', 1, () => 0);
advanceFishingSession(rough, rough.biteAt + .35);
hookFish(rough);
setFishingForce(rough, 'strong');
advanceFishingSession(rough, 3);
assert.equal(rough.phase, 'failed');
assert.equal(rough.reason, 'hook-slip');

const upgraded = createFishingSession('silverJack', 3, () => 0);
assert(upgraded.biteWindow > rough.biteWindow);

const fish = freshState(0);
fish.ecology.reefFish = 12;
const withoutSkill = catchSeafood(fish, 'reefFish', 'rod', () => .78);
assert.equal(withoutSkill.caught, 0);
const withSkill = catchSeafood(fish, 'reefFish', 'rod', () => .78, { rodSkillBonus: .2 });
assert.equal(withSkill.caught, 1);
console.log('fishing interaction check passed');
