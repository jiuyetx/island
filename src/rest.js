const DAY = 1440;
const DAWN = 360;
const DUSK = 1080;
const NAP_MINUTES = 90;
const NAP_STAMINA = 25;

export function restNutritionCost(kind, progress) {
  return (kind === 'overnight' ? 20 : 10) * Math.max(0, Math.min(1, progress));
}

export function restPreview(plan, gameMinutes, stamina, cap, rate) {
  if (!plan.ok) return null;
  const gameMinutesLeft = Math.max(0, plan.targetMinutes - gameMinutes);
  return { gameMinutes: gameMinutesLeft, realSeconds: gameMinutesLeft / rate,
    staminaGain: Math.max(0, Math.min(cap - stamina, plan.staminaGain)) };
}

export function restProgress(rest, deltaSeconds, gameMinutesPerSecond) {
  const duration = (rest.targetMinutes - rest.fromMinutes) / gameMinutesPerSecond;
  rest.elapsed = Math.min(duration, rest.elapsed + Math.max(0, deltaSeconds));
  const progress = rest.elapsed / duration;
  return { progress, minutes: rest.fromMinutes + (rest.targetMinutes - rest.fromMinutes) * progress,
    stamina: Math.min(rest.recoveryCap, rest.initialStamina + rest.staminaGain * progress), done: progress >= 1 };
}

export function bedRestPlan(state, busy = false) {
  if (busy) return { ok: false, reason: 'busy' };
  if (!state.shelter.inside) return { ok: false, reason: 'outside' };
  if (state.shelter.doorOpen) return { ok: false, reason: 'door' };
  if (state.satiety < 20) return { ok: false, reason: 'food' };
  if (state.stamina >= state.recoveryCap && state.recoveryCap < 100) return { ok: false, reason: 'nutrition' };
  return planRest(state.gameMinutes, state.stamina, state.storm?.impactAt, state.recoveryCap);
}

export function planRest(gameMinutes, stamina, impactAt, staminaCap = 100) {
  if (!Number.isFinite(gameMinutes)) return { ok: false, reason: 'time' };
  const warningAt = Number.isFinite(impactAt) ? impactAt - 2 * DAY : Infinity;
  if (gameMinutes >= warningAt && gameMinutes < impactAt) return { ok: false, reason: 'storm' };
  const minuteOfDay = ((gameMinutes % DAY) + DAY) % DAY;
  const isDaytime = minuteOfDay >= DAWN && minuteOfDay < DUSK;
  if (isDaytime && stamina >= staminaCap) return { ok: false, reason: 'full' };
  const nextDawn = DAWN + (Math.floor((gameMinutes - DAWN) / DAY) + 1) * DAY;
  const intendedTarget = isDaytime
    ? Math.min(gameMinutes + NAP_MINUTES, gameMinutes - minuteOfDay + DUSK)
    : nextDawn;
  const targetMinutes = Math.min(intendedTarget, warningAt);
  if (targetMinutes <= gameMinutes) return { ok: false, reason: 'storm' };
  return {
    ok: true,
    kind: isDaytime ? 'nap' : 'overnight',
    targetMinutes,
    staminaGain: isDaytime ? NAP_STAMINA * (targetMinutes - gameMinutes) / NAP_MINUTES
      : Math.min(Math.max(0, staminaCap - stamina), (targetMinutes - gameMinutes) / 6),
    interruptedByStorm: targetMinutes < intendedTarget,
  };
}
