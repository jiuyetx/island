export const FISHING_FORCES = Object.freeze(['light', 'steady', 'strong']);
export const FISHING_FORCE_LABELS = Object.freeze({ light: '轻收', steady: '稳收', strong: '快收' });
export const FISHING_FORCE_VALUES = Object.freeze({ light: .25, steady: .5, strong: .75 });

export const FISHING_CUE_SECONDS = 2.6;
const CUE_SECONDS = FISHING_CUE_SECONDS;
const CHANGE_GRACE_SECONDS = .8;
const CUES = Object.freeze({
  reefFish: ['steady', 'light', 'strong', 'steady', 'light', 'strong'],
  silverJack: ['light', 'strong', 'steady', 'light', 'strong', 'steady'],
});

export function createFishingSession(speciesId, rodLevel = 1, random = Math.random) {
  const level = Math.max(1, Math.min(3, Math.floor(rodLevel) || 1));
  const roll = Math.max(0, Math.min(.9999, Number(random()) || 0));
  return {
    speciesId, rodLevel: level, phase: 'casting', elapsed: 0, castSeconds: .72,
    biteAt: 2.7 + roll * 1.5,
    biteWindow: (speciesId === 'silverJack' ? 2.3 : 2.6) + (level - 1) * .22,
    force: 'steady', forceValue: .5, assisted: false, reelElapsed: 0, progress: 0, strain: 0,
    timingQuality: 0, reason: null,
  };
}

export function fishingCue(session) {
  const pattern = CUES[session.speciesId] || CUES.reefFish;
  return pattern[Math.floor(session.reelElapsed / CUE_SECONDS) % pattern.length];
}

export function fishingForceGuide(session) {
  const cue = fishingCue(session), target = FISHING_FORCE_VALUES[cue];
  const tolerance = .17 + (session.rodLevel - 1) * .02;
  const pattern = CUES[session.speciesId] || CUES.reefFish;
  const beat = Math.floor(session.reelElapsed / CUE_SECONDS);
  return { cue, target, min: Math.max(0, target - tolerance), max: Math.min(1, target + tolerance),
    next: pattern[(beat + 1) % pattern.length], seconds: CUE_SECONDS - session.reelElapsed % CUE_SECONDS };
}

export function hookFish(session) {
  if (session.phase !== 'bite') {
    if (session.phase === 'casting' || session.phase === 'waiting') {
      session.phase = 'failed'; session.reason = 'too-early';
    }
    return false;
  }
  const position = (session.elapsed - session.biteAt) / session.biteWindow;
  session.timingQuality = Math.max(.12, 1 - Math.abs(position - .43) / .63);
  session.phase = 'reeling';
  session.reelElapsed = 0;
  session.force = 'steady';
  session.forceValue = .5;
  return true;
}

export function setFishingForce(session, force) {
  if (session.phase !== 'reeling') return false;
  const value = typeof force === 'number' ? force : FISHING_FORCE_VALUES[force];
  if (!Number.isFinite(value)) return false;
  session.forceValue = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  session.force = session.forceValue < .375 ? 'light' : session.forceValue > .625 ? 'strong' : 'steady';
  session.assisted = false;
  return true;
}

export function setFishingAssistance(session, enabled) {
  if (session.phase !== 'reeling') return false;
  session.assisted = Boolean(enabled);
  return true;
}

export function advanceFishingSession(session, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0 || ['failed', 'landed'].includes(session.phase)) return session.phase;
  session.elapsed += seconds;
  if (session.phase === 'casting' && session.elapsed >= session.castSeconds) session.phase = 'waiting';
  if (session.phase === 'waiting' && session.elapsed >= session.biteAt) session.phase = 'bite';
  if (session.phase === 'bite' && session.elapsed > session.biteAt + session.biteWindow) {
    session.phase = 'failed'; session.reason = 'missed-bite';
  }
  if (session.phase !== 'reeling') return session.phase;

  // Resolve cue changes in fixed substeps so frame rate cannot change whether
  // the line survives a force switch at a beat boundary.
  let remaining = seconds;
  while (remaining > 0 && session.phase === 'reeling') {
    const boundary = (Math.floor(session.reelElapsed / CUE_SECONDS) + 1) * CUE_SECONDS;
    const step = Math.min(remaining, .05, Math.max(.0001, boundary - session.reelElapsed));
    const guide = fishingForceGuide(session);
    if (session.assisted) {
      session.forceValue += Math.max(-step * .5, Math.min(step * .5, guide.target - session.forceValue));
      session.force = session.forceValue < .375 ? 'light' : session.forceValue > .625 ? 'strong' : 'steady';
    }
    const value = session.forceValue;
    const error = Math.max(guide.min - value, value - guide.max, 0);
    // A broad visible safe band, and a brief grace period when fish behaviour
    // changes. Slight errors slow progress instead of immediately losing fish.
    const grace = session.reelElapsed % CUE_SECONDS < CHANGE_GRACE_SECONDS;
    if (error <= .000001) {
      session.progress = Math.min(1, session.progress + step * (.21 + session.timingQuality * .045));
      session.strain = Math.max(0, session.strain - step * (.27 + (session.rodLevel - 1) * .045));
    } else {
      session.progress = Math.min(1, session.progress + step * (error < .13 ? .12 : .015));
      if (!grace) session.strain = Math.min(1, session.strain + step * (.12 + error * 1.2)
        * (session.speciesId === 'silverJack' ? 1.08 : 1) * (1 - (session.rodLevel - 1) * .10));
    }
    session.reelElapsed += step;
    remaining -= step;
    if (session.strain >= 1) { session.phase = 'failed'; session.reason = 'hook-slip'; }
    else if (session.progress >= 1) session.phase = 'landed';
    else if (session.reelElapsed >= 18) { session.phase = 'failed'; session.reason = 'line-slack'; }
  }
  return session.phase;
}
