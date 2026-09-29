const DAY = 1440;
const DAWN = 360;
const DUSK = 1080;
const NAP_MINUTES = 90;
const NAP_STAMINA = 25;

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
