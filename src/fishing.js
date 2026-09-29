export const FISHING_FORCES = Object.freeze(['light', 'steady', 'strong']);
export const FISHING_FORCE_LABELS = Object.freeze({ light: '轻收', steady: '稳收', strong: '快收' });

const CUE_SECONDS = 1.15;
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
    biteWindow: (speciesId === 'silverJack' ? 1.55 : 1.9) + (level - 1) * .22,
    force: 'steady', reelElapsed: 0, progress: 0, strain: 0,
    timingQuality: 0, reason: null,
  };
}

export function fishingCue(session) {
  const pattern = CUES[session.speciesId] || CUES.reefFish;
  return pattern[Math.floor(session.reelElapsed / CUE_SECONDS) % pattern.length];
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
  return true;
}

export function setFishingForce(session, force) {
  if (session.phase !== 'reeling' || !FISHING_FORCES.includes(force)) return false;
  session.force = force;
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
    const step = Math.min(remaining, Math.max(.0001, boundary - session.reelElapsed));
    const cue = fishingCue(session);
    const distance = Math.abs(FISHING_FORCES.indexOf(session.force) - FISHING_FORCES.indexOf(cue));
    if (distance === 0) {
      session.progress = Math.min(1, session.progress + step * (.25 + session.timingQuality * .055));
      session.strain = Math.max(0, session.strain - step * (.27 + (session.rodLevel - 1) * .045));
    } else {
      session.progress = Math.min(1, session.progress + step * .025);
      session.strain = Math.min(1, session.strain + step * (.47 + distance * .13)
        * (session.speciesId === 'silverJack' ? 1.12 : 1)
        * (1 - (session.rodLevel - 1) * .10));
    }
    session.reelElapsed += step;
    remaining -= step;
    if (session.strain >= 1) { session.phase = 'failed'; session.reason = 'hook-slip'; }
    else if (session.progress >= 1) session.phase = 'landed';
    else if (session.reelElapsed >= 8.5) { session.phase = 'failed'; session.reason = 'line-slack'; }
  }
  return session.phase;
}
