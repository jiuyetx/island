import assert from 'node:assert/strict';
import { advanceFishingSession, createFishingSession, fishingCue, fishingForceGuide, hookFish, setFishingForce, setFishingAssistance } from '../src/fishing.js';
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

function reel(species = 'reefFish') {
  const s = createFishingSession(species, 1, () => 0);
  advanceFishingSession(s, s.biteAt + .4); hookFish(s); return s;
}
const controlled = reel();
assert.equal(setFishingForce(controlled, .47), true);
assert.equal(controlled.forceValue, .47, 'continuous force supports precise percentage control');
setFishingForce(controlled, controlled.forceValue + .05);
assert.equal(controlled.forceValue, .52, '5% adjustment is exact, without floating point drift');
setFishingForce(controlled, -5); assert.equal(controlled.forceValue, 0);
setFishingForce(controlled, 5); assert.equal(controlled.forceValue, 1);
assert.equal(setFishingForce(controlled, NaN), false);
assert.equal(setFishingForce(controlled, 'unknown'), false);
assert.equal(setFishingForce(createFishingSession('reefFish'), .5), false, 'no force input before a bite');

const forgiving = reel();
setFishingForce(forgiving, fishingForceGuide(forgiving).min + .02);
advanceFishingSession(forgiving, 1);
assert.ok(forgiving.progress > .2 && forgiving.strain === 0, 'whole green band is safe, no perfect precision required');
advanceFishingSession(forgiving, 1.65);
const strainBefore = forgiving.strain;
advanceFishingSession(forgiving, .4);
assert.equal(forgiving.strain, strainBefore, 'reaction grace at a cue change');

for (const species of ['reefFish', 'silverJack']) {
  const delayed = reel(species);
  for (let i = 0; i < 180 && delayed.phase === 'reeling'; i++) {
    if (delayed.reelElapsed % 2.6 > .6) setFishingForce(delayed, fishingCue(delayed));
    advanceFishingSession(delayed, .1);
  }
  assert.equal(delayed.phase, 'landed', 'human reaction delay and occasional imprecise input still succeed');
  const assisted = reel(species);
  setFishingAssistance(assisted, true);
  for (let i = 0; i < 180 && assisted.phase === 'reeling'; i++) advanceFishingSession(assisted, .1);
  assert.equal(assisted.phase, 'landed', 'optional assistance follows recommendations safely');
}
const assisted = reel(); setFishingAssistance(assisted, true); setFishingForce(assisted, .63);
assert.equal(assisted.assisted, false, 'manual control takes over from assistance');
const coarse = reel('silverJack'), fine = reel('silverJack');
setFishingAssistance(coarse, true); setFishingAssistance(fine, true);
advanceFishingSession(coarse, 3);
for (let i = 0; i < 60; i++) advanceFishingSession(fine, .05);
assert.ok(Math.abs(coarse.progress - fine.progress) < .002 && Math.abs(coarse.strain - fine.strain) < .002, 'large vs small ticks agree');

const fish = freshState(0);
fish.ecology.reefFish = 12;
const withoutSkill = catchSeafood(fish, 'reefFish', 'rod', () => .78);
assert.equal(withoutSkill.caught, 0);
const withSkill = catchSeafood(fish, 'reefFish', 'rod', () => .78, { rodSkillBonus: .2 });
assert.equal(withSkill.caught, 1);
console.log('fishing interaction check passed');
