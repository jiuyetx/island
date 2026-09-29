const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const FRESHWATER_SITE = { x: -3.5, z: 1.3 };

export function freshWaterSupply() {
  return { hydration: 82, canteen: 3, canteenCapacity: 4, tank: 5, tankCapacity: 12,
    stillLevel: 0, lastYield: 0, lastYieldDay: 1 };
}

export function normalizeFreshWater(value) {
  const supply = freshWaterSupply();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return supply;
  supply.canteenCapacity = clamp(Math.floor(Number(value.canteenCapacity) || 4), 4, 8);
  supply.tankCapacity = clamp(Math.floor(Number(value.tankCapacity) || 12), 12, 30);
  supply.stillLevel = value.stillLevel === 1 ? 1 : 0;
  supply.hydration = clamp(Number.isFinite(value.hydration) ? value.hydration : supply.hydration, 0, 100);
  supply.canteen = clamp(Math.floor(Number(value.canteen) || 0), 0, supply.canteenCapacity);
  supply.tank = clamp(Math.floor(Number(value.tank) || 0), 0, supply.tankCapacity);
  supply.lastYield = clamp(Math.floor(Number(value.lastYield) || 0), 0, 12);
  supply.lastYieldDay = Math.max(1, Math.floor(Number(value.lastYieldDay) || 1));
  return supply;
}

export function rainForDay(dayId) {
  const cycle = Math.max(1, Math.floor(dayId)) % 4;
  return cycle === 0 ? 6 : cycle === 2 ? 3 : 0;
}

export function dailyWaterYield(dayId, stillLevel = 0) {
  return 1 + rainForDay(dayId) + (stillLevel ? 2 : 0);
}

export function staminaCeiling(state) {
  const hydration = state.freshwater?.hydration ?? 100;
  return hydration < 10 ? 50 : hydration < 25 ? 75 : 100;
}

export function advanceHydration(state, minutes) {
  const supply = state.freshwater;
  if (!supply || !Number.isFinite(minutes) || minutes <= 0) return;
  supply.hydration = clamp(supply.hydration - minutes * 40 / 1440, 0, 100);
  if (supply.hydration === 0) state.stamina = Math.max(0, state.stamina - minutes * 8 / 1440);
  state.stamina = Math.min(state.stamina, staminaCeiling(state));
}

export function collectAtDawn(state, dayId) {
  const supply = state.freshwater;
  if (!supply || dayId <= supply.lastYieldDay) return 0;
  const collected = Math.min(supply.tankCapacity - supply.tank, dailyWaterYield(dayId, supply.stillLevel));
  supply.tank += collected;
  supply.lastYield = collected;
  supply.lastYieldDay = dayId;
  return collected;
}

export function refillCanteen(state) {
  const supply = state.freshwater;
  if (!supply || supply.tank <= 0) return { ok: false, reason: 'empty' };
  const transferred = Math.min(supply.tank, supply.canteenCapacity - supply.canteen);
  if (transferred <= 0) return { ok: false, reason: 'full' };
  supply.tank -= transferred;
  supply.canteen += transferred;
  return { ok: true, transferred };
}

export function drinkWater(state) {
  const supply = state.freshwater;
  if (!supply || supply.canteen <= 0) return { ok: false, reason: 'empty' };
  if (supply.hydration >= 100) return { ok: false, reason: 'full' };
  supply.canteen--;
  supply.hydration = Math.min(100, supply.hydration + 35);
  state.stamina = Math.min(staminaCeiling(state), state.stamina + 3);
  return { ok: true, hydration: supply.hydration };
}
