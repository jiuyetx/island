// Deterministic, save-friendly storm phases and one-shot settlement.
// state.storm: { id, seed?, intensity, impactAt, settledId?, stage?, result? }
const DAMAGE = {
  1: { wind: .30, water: .15, stock: .15, boat: 30, dock: 25, hut: 20 },
  2: { wind: .45, water: .30, stock: .30, boat: 60, dock: 50, hut: 40 },
  3: { wind: .60, water: .45, stock: .50, boat: 90, dock: 75, hut: 60 },
};
const PROTECTION_WEAR = 20;
const PROTECTION_REPAIR_COST = { windNet: 6, drainage: 8, anchor: 7, waterproofCabinet: 5, waveBarrier: 10, shutters: 6 };
const UNIT_VALUES = {
  sweetPotato: 4, tomato: 6, corn: 5, pineapple: 11, pumpkin: 16,
  sweetPotatoSeed: 4, tomatoSeed: 5, cornSeed: 7, pineappleSeed: 12, pumpkinSeed: 16,
  crab: 6, reefFish: 18, silverJack: 26, lobster: 36, pearlOyster: 50,
  diveSupply: 1, windNet: 60, drainage: 80, anchor: 70, waterproofCabinet: 50,
  waveBarrier: 100, windowReinforcement: 60, raisedBed: 20,
};
const NEVER_LOSE = new Set(['gold', 'coins', 'currency', 'rod', 'rodLevel', 'shovel', 'shovelLevel', 'diveLevel', 'divingSuit', 'story', 'storyItems', 'keyItems']);

function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function roll(seed, key) {
  return hash(`${seed}:${key}`) / 4294967296;
}

function getStage(storm, gameMinutes) {
  if (!storm || !Number.isFinite(storm.impactAt)) return 'calm';
  const impactAt = storm.impactAt;
  if (gameMinutes >= impactAt + 240 || storm.settledId === storm.id) return 'settled';
  if (gameMinutes >= impactAt) return 'impact';
  if (gameMinutes >= impactAt - 360) return 'preparation';
  if (gameMinutes >= impactAt - 2880) return 'warning';
  return 'calm';
}

function recordExposure(state, gameMinutes) {
  const shelter = state.shelter;
  const impactAt = state.storm?.impactAt;
  if (!shelter || !Number.isFinite(impactAt)) return;
  const previous = Number.isFinite(shelter.lastCheckedMinutes) ? shelter.lastCheckedMinutes : gameMinutes;
  const from = Math.max(previous, impactAt);
  const to = Math.min(gameMinutes, impactAt + 240);
  if (!(shelter.inside && !shelter.doorOpen) && to > from) {
    shelter.exposureMinutes = Math.min(240, (shelter.exposureMinutes || 0) + to - from);
  }
  shelter.lastCheckedMinutes = gameMinutes;
}

function promptFor(stage, intensity) {
  if (stage === 'warning') return `台风${intensity}级预警：检查作物、货物与船只防护。`;
  if (stage === 'preparation') return '台风即将登陆：召回船只、转移货物并完成加固。';
  if (stage === 'impact') return '台风来袭：暂停出海和露天作业，请留在避难屋。';
  if (stage === 'settled') return '台风已过：查看损失清单并安排修复。';
  return '';
}

function installedFlag(value) {
  if (typeof value === 'object' && value !== null) return value.installed !== false && Number(value.durability ?? 100) > 0;
  return value === true || (Number.isFinite(value) && value > 0);
}

function setWear(container, key) {
  const value = container?.[key];
  if (typeof value === 'number') container[key] = Math.max(0, value <= 1 ? 100 - PROTECTION_WEAR : value - PROTECTION_WEAR);
  else if (value === true) container[key] = 100 - PROTECTION_WEAR;
  else if (value && typeof value === 'object' && Number.isFinite(value.durability)) {
    value.durability = Math.max(0, value.durability - PROTECTION_WEAR);
    if (value.durability === 0) value.installed = false;
  }
}

function stableId(item, index, kind, key) {
  return String(item?.id ?? `${kind}:${item?.kind ?? item?.type ?? key ?? 'item'}:${key ?? index}`);
}

function getStacks(state) {
  const inventory = state.inventory;
  let stacks = [];
  if (Array.isArray(inventory)) stacks = inventory.map((item, index) => ({ item, index, kind: 'inventory' }));
  else if (inventory && typeof inventory === 'object') {
    stacks = stacks.concat(Object.entries(inventory).flatMap(([key, value]) => {
      if (Array.isArray(value)) return value.map((item, index) => ({ item, index, kind: `inventory.${key}` }));
      if (value && typeof value === 'object' && Number.isFinite(value.quantity)) return [{ item: value, index: 0, kind: `inventory.${key}` }];
      if (Number.isFinite(value)) return [{ item: inventory, index: 0, kind: 'inventory', key }];
      return [];
    }));
  }
  const storage = state.storage;
  if (Array.isArray(storage)) stacks = stacks.concat(storage.map((item, index) => ({ item, index, kind: 'storage' })));
  else if (storage && Array.isArray(storage.items)) stacks = stacks.concat(storage.items.map((item, index) => ({ item, index, kind: 'storage.items' })));
  else if (storage && typeof storage === 'object') {
    stacks = stacks.concat(Object.entries(storage).flatMap(([key, value]) => {
      if (Number.isFinite(value)) return [{ item: storage, index: 0, kind: 'storage', key }];
      if (value && typeof value === 'object' && Number.isFinite(value.quantity)) return [{ item: value, index: 0, kind: `storage.${key}` }];
      return [];
    }));
  }
  return stacks;
}

function quantityOf(item, key) {
  if (key && Number.isFinite(item?.[key])) return Math.max(0, item[key]);
  const value = item?.quantity ?? item?.count ?? item?.units;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function writeQuantity(item, quantity, key) {
  if (key) item[key] = quantity;
  else if (Number.isFinite(item.quantity)) item.quantity = quantity;
  else if (Number.isFinite(item.count)) item.count = quantity;
  else if (Number.isFinite(item.units)) item.units = quantity;
}

function getPlotDefenses(state, plots) {
  const defenses = state.defenses || {};
  const installed = Array.isArray(defenses.plots) ? defenses.plots : [];
  const nets = installed.filter((d) => installedFlag(d.windNet)).slice(0, 6);
  const drains = installed.filter((d) => installedFlag(d.drainage)).slice(0, 6);
  const byId = (items, plot, field, index) => {
    const entry = items.find((d) => d.plotId === plot.id || d.id === plot.id);
    if (entry) return installedFlag(entry[field]);
    if (installed.some((d) => d.plotId === plot.id || d.id === plot.id)) return false;
    return installedFlag(plot[field]) || (items.length === 0 && installedFlag(defenses[field]) && index < 6);
  };
  return plots.map((plot, index) => ({
    windNet: byId(nets, plot, 'windNet', index),
    drainage: byId(drains, plot, 'drainage', index),
  }));
}

function expectedCropUnits(crop) {
  for (const key of ['expectedUnits', 'units', 'quantity', 'expectedYield']) {
    if (Number.isFinite(crop?.[key])) return Math.max(0, Math.floor(crop[key]));
  }
  return 0;
}

function hasDefense(state, name) {
  const defenses = state.defenses || {};
  return installedFlag(defenses[name]) || installedFlag(state[name]);
}

function calculateAsset(state, name, baseDamage, protectedBy, protectionFactor, pricePerPoint) {
  const tierKey = name === 'boat' ? 'boatTier' : `${name}Level`;
  const durabilityKey = name === 'boat' ? 'boatDurability' : `${name}Durability`;
  const tier = state[tierKey];
  const durability = state[durabilityKey];
  if (!Number.isFinite(durability) || durability <= 0 || tier == null || tier === 0 || tier === 'wreck') {
    return { damage: 0, damagePrevented: 0, durabilityBefore: Number.isFinite(durability) ? durability : null, durabilityAfter: Number.isFinite(durability) ? durability : null, downgraded: false, repairCost: 0 };
  }
  const damage = Math.ceil(baseDamage * (protectedBy ? protectionFactor : 1));
  const damagePrevented = Math.max(0, baseDamage - damage);
  let after = Math.max(0, durability - damage);
  let nextTier = tier;
  let downgraded = false;
  if (after === 0) {
    const numericTier = typeof tier === 'number' ? tier : ({ wooden: 1, wood: 1, iron: 2, speed: 3, speedboat: 3, fast: 3 }[String(tier).toLowerCase()] || 1);
    if (numericTier > 1) {
      nextTier = typeof tier === 'number' ? numericTier - 1 : ({ 2: 'wood', 3: 'iron' }[numericTier]);
      after = 40;
      downgraded = true;
    } else if (name === 'boat') {
      nextTier = 'wreck';
      after = 40;
      downgraded = true;
    } else {
      after = 0;
      state[`${name}Wrecked`] = true;
    }
  }
  const repairTier = nextTier;
  const repairRate = name !== 'boat' ? pricePerPoint
    : repairTier === 3 || repairTier === 'speed' || repairTier === 'speedboat' ? 3
      : repairTier === 2 || repairTier === 'iron' ? 2 : 1;
  const repairCost = Math.ceil((100 - after) * repairRate);
  state[tierKey] = nextTier;
  state[durabilityKey] = after;
  if (after === 0) state[`${name}Wrecked`] = true;
  return { damage, damagePrevented, durabilityBefore: durability, durabilityAfter: after, downgraded, repairCost };
}

function settle(state, storm) {
  const intensity = Math.min(3, Math.max(1, Math.floor(storm.intensity || 1)));
  const severity = DAMAGE[intensity];
  const seed = Number.isFinite(storm.seed) ? storm.seed >>> 0 : hash(storm.id);
  const plots = Array.isArray(state.plots) ? state.plots : [];
  const cover = getPlotDefenses(state, plots);
  const report = {
    id: storm.id,
    intensity,
    settled: true,
    plots: [],
    inventory: [],
    assets: {},
    protectionWear: {},
    totals: { itemsLost: 0, valueLost: 0, repairCost: 0, protectedUnitsExpected: 0, durabilitySaved: 0 },
  };
  const exposureMinutes = Math.min(240, Math.max(0, state.shelter?.exposureMinutes || 0));
  const staminaLost = Math.min(30, Math.ceil(exposureMinutes / 8));
  if (staminaLost) state.stamina = Math.max(0, (state.stamina || 0) - staminaLost);
  report.shelter = { exposureMinutes: Math.round(exposureMinutes), staminaLost,
    protected: exposureMinutes < 1 };

  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i];
    const crop = plot?.crop;
    const beforeUnits = expectedCropUnits(crop);
    if (!crop || !beforeUnits) continue;
    const windProtected = cover[i].windNet;
    const drainageProtected = cover[i].drainage;
    const lossRate = 1 - (1 - severity.wind * (windProtected ? .4 : 1)) * (1 - severity.water * (drainageProtected ? .3 : 1));
    const unprotectedRate = 1 - (1 - severity.wind) * (1 - severity.water);
    const protectedUnitsExpected = Math.max(0, beforeUnits * (unprotectedRate - lossRate));
    const rawLoss = beforeUnits * lossRate;
    const base = Math.floor(rawLoss);
    const lostUnits = Math.min(beforeUnits, base + (roll(seed, `crop:${plot.id ?? i}`) < rawLoss - base ? 1 : 0));
    const afterUnits = beforeUnits - lostUnits;
    if (Number.isFinite(crop.expectedUnits)) crop.expectedUnits = afterUnits;
    else if (Number.isFinite(crop.units)) crop.units = afterUnits;
    else if (Number.isFinite(crop.quantity)) crop.quantity = afterUnits;
    else if (Number.isFinite(crop.expectedYield)) crop.expectedYield = afterUnits;
    const valueLost = lostUnits * (Number(crop.valuePerUnit ?? crop.unitValue ?? state.itemPrices?.[crop.id] ?? UNIT_VALUES[crop.id] ?? 0) || 0);
    report.plots.push({ plotId: plot.id ?? i, itemId: crop.id ?? 'crop', resourceId: crop.id ?? 'crop', beforeUnits, lostUnits, lossRate, protectedUnitsExpected, valueLost, windProtected, drainageProtected });
    report.totals.protectedUnitsExpected += protectedUnitsExpected;
    report.totals.itemsLost += lostUnits;
    report.totals.valueLost += valueLost;
  }

  const stacks = getStacks(state);
  const storage = state.storage && !Array.isArray(state.storage) ? state.storage : {};
  const selectedStorageItems = storage.protectedItemIds ?? state.protectedStorageIds ?? state.storageProtectedIds;
  const explicitlyProtected = new Set(Array.isArray(selectedStorageItems) ? selectedStorageItems.map(String) : []);
  let protectedRemaining = Math.min(40, Math.max(0, Number(storage.protectedCapacity ?? state.storageCapacity ?? (hasDefense(state, 'waterproofCabinet') ? 40 : 0)) || 0));
  if (!hasDefense(state, 'waterproofCabinet')) protectedRemaining = 0;
  const legacyQuantity = stacks.reduce((sum, stack) => sum + (stack.key === 'legacyFish' ? quantityOf(stack.item, stack.key) : 0), 0);
  let legacyValueRemaining = Number.isFinite(state.legacyFishValue) ? Math.max(0, state.legacyFishValue) : 0;
  let legacyQuantityRemaining = legacyQuantity;
  for (const stack of stacks) {
    const { item, index, kind } = stack;
    if (!item || typeof item !== 'object') continue;
    const key = stack.key;
    const before = quantityOf(item, key);
    if (!before) continue;
    const resourceId = String(key ?? item.resourceId ?? item.itemId ?? item.kind ?? item.type ?? '');
    if (NEVER_LOSE.has(resourceId)) continue;
    const id = stableId(item, index, kind, key);
    const inStorage = kind.startsWith('storage');
    const selected = item.protected === true || explicitlyProtected.has(id) || explicitlyProtected.has(resourceId);
    const protectedQty = inStorage && selected && protectedRemaining > 0 ? Math.min(before, protectedRemaining) : 0;
    protectedRemaining -= protectedQty;
    const ordinaryQty = before - protectedQty;
    const rawLoss = ordinaryQty * severity.stock + protectedQty * severity.stock * (hasDefense(state, 'waterproofCabinet') ? .2 : 1);
    const protectedUnitsExpected = Math.max(0, before * severity.stock - rawLoss);
    const base = Math.floor(rawLoss);
    const lost = Math.min(before, base + (roll(seed, `inventory:${id}`) < rawLoss - base ? 1 : 0));
    if (lost) writeQuantity(item, before - lost, key);
    const legacyLostValue = resourceId === 'legacyFish' && legacyQuantityRemaining
      ? lost >= legacyQuantityRemaining ? legacyValueRemaining : Math.floor(legacyValueRemaining * lost / legacyQuantityRemaining)
      : 0;
    legacyValueRemaining -= legacyLostValue;
    legacyQuantityRemaining = Math.max(0, legacyQuantityRemaining - (resourceId === 'legacyFish' ? lost : 0));
    if (resourceId === 'legacyFish') state.legacyFishValue = legacyValueRemaining;
    const unitValue = Number(item.valuePerUnit ?? item.unitValue ?? state.itemPrices?.[resourceId] ?? UNIT_VALUES[resourceId] ?? 0) || 0;
    const valueLost = resourceId === 'legacyFish' ? legacyLostValue : lost * unitValue;
    report.inventory.push({ stackId: id, itemId: resourceId, resourceId, kind: item.kind ?? item.type ?? resourceId, before, lost, lossRate: rawLoss / before, protectedUnitsExpected, protected: protectedQty > 0, valueLost });
    report.totals.protectedUnitsExpected += protectedUnitsExpected;
    report.totals.itemsLost += lost;
    report.totals.valueLost += valueLost;
  }

  const anchored = hasDefense(state, 'anchor') && state.boatMoored !== false && state.boatDocked !== false;
  const assets = {
    boat: calculateAsset(state, 'boat', severity.boat, anchored, .30, state.boatTier === 3 || state.boatTier === 'speed' || state.boatTier === 'speedboat' ? 3 : state.boatTier === 2 || state.boatTier === 'iron' ? 2 : 1),
    dock: calculateAsset(state, 'dock', severity.dock, hasDefense(state, 'waveBarrier'), .40, 1),
    hut: calculateAsset(state, 'hut', severity.hut, hasDefense(state, 'shutters'), .40, 1),
  };
  report.assets = assets;
  report.totals.repairCost = Object.values(assets).reduce((sum, asset) => sum + asset.repairCost, 0);
  report.totals.durabilitySaved = Object.values(assets).reduce((sum, asset) => sum + asset.damagePrevented, 0);

  const defenses = state.defenses || (state.defenses = {});
  for (const [name, target] of [['windNet', defenses], ['drainage', defenses], ['anchor', defenses], ['waterproofCabinet', defenses], ['waveBarrier', defenses], ['shutters', defenses]]) {
    const active = installedFlag(target[name]);
    if (!active) continue;
    const before = typeof target[name] === 'object' ? Number(target[name].durability ?? 100) : Number(target[name] ?? 100);
    setWear(target, name);
    const after = typeof target[name] === 'object' ? Number(target[name].durability ?? 0) : Number(target[name] ?? 100);
    report.protectionWear[name] = { before, after, repairCostPer20: PROTECTION_REPAIR_COST[name] };
  }
  for (const name of ['windNet', 'drainage']) {
    const installedPlots = (Array.isArray(defenses.plots) ? defenses.plots : []).filter((plot) => installedFlag(plot[name])).slice(0, 6);
    if (!installedPlots.length) continue;
    const before = installedPlots.map((plot) => Number(plot[name]) > 1 ? Number(plot[name]) : 100);
    for (const plot of installedPlots) setWear(plot, name);
    const after = installedPlots.map((plot) => Number(plot[name]) || 0);
    report.protectionWear[name] = {
      before: Math.min(...before), after: Math.min(...after),
      repairCostPer20: PROTECTION_REPAIR_COST[name], coverage: installedPlots.length,
    };
  }
  storm.seed = seed;
  storm.settledId = storm.id;
  storm.stage = 'settled';
  storm.result = report;
  return report;
}

/** Advance the stage from saved game time; settlement commits once after all losses are calculated. */
export function updateStorm(state) {
  if (!state || typeof state !== 'object') return { stage: 'calm', changed: false, transition: null, prompt: '', report: null };
  const storm = state.storm;
  const gameMinutes = Number.isFinite(state.gameMinutes) ? state.gameMinutes : 0;
  recordExposure(state, gameMinutes);
  const stage = getStage(storm, gameMinutes);
  const previous = storm?.stage ?? 'calm';
  const changed = stage !== previous;
  if (!storm || typeof storm !== 'object') return { stage, changed, transition: changed ? { from: previous, to: stage } : null, prompt: promptFor(stage, 0), report: null };
  let report = null;
  if (stage === 'settled' && storm.settledId !== storm.id) {
    try {
      const nextState = JSON.parse(JSON.stringify(state));
      nextState.storm.stage = 'settled';
      report = settle(nextState, nextState.storm);
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, nextState);
    } catch {
      return { stage: 'impact', changed: false, transition: null, prompt: promptFor('impact', storm.intensity || 1), report: null };
    }
  } else {
    storm.stage = stage;
  }
  const didChange = changed || Boolean(report);
  return {
    stage,
    changed: didChange,
    transition: didChange ? { from: previous, to: stage } : null,
    prompt: changed ? promptFor(stage, storm.intensity || 1) : report ? promptFor(stage, storm.intensity || 1) : '',
    report,
  };
}

/** Read-only summary suitable for the HUD; all times use the saved game-minute clock. */
export function stormStatus(state) {
  const storm = state?.storm;
  const gameMinutes = Number.isFinite(state?.gameMinutes) ? state.gameMinutes : 0;
  const stage = getStage(storm, gameMinutes);
  if (!storm) return { stage: 'calm', intensity: 0, minutesToImpact: null, prompt: '' };
  return {
    id: storm.id,
    stage,
    intensity: Math.min(3, Math.max(1, Math.floor(storm.intensity || 1))),
    minutesToImpact: Number.isFinite(storm.impactAt) ? Math.max(0, storm.impactAt - gameMinutes) : null,
    prompt: promptFor(stage, storm.intensity || 1),
    settled: storm.settledId === storm.id,
    report: storm.result ?? null,
  };
}

export function summarizeStormReport(report) {
  const plots = Array.isArray(report?.plots) ? report.plots : [];
  const inventory = Array.isArray(report?.inventory) ? report.inventory : [];
  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  return {
    intensity: Math.max(0, Math.floor(Number(report?.intensity) || 0)),
    plots: { count: plots.length, unitsLost: sum(plots, 'lostUnits'), valueLost: sum(plots, 'valueLost'), protectedUnitsExpected: sum(plots, 'protectedUnitsExpected') },
    inventory: { unitsLost: sum(inventory, 'lost'), valueLost: sum(inventory, 'valueLost'), protectedUnitsExpected: sum(inventory, 'protectedUnitsExpected'), rows: inventory.filter((row) => row.lost > 0) },
    assets: Object.fromEntries(['boat', 'dock', 'hut'].map((key) => [key, {
      durabilityBefore: report?.assets?.[key]?.durabilityBefore ?? null,
      durabilityAfter: report?.assets?.[key]?.durabilityAfter ?? null,
      damagePrevented: Number(report?.assets?.[key]?.damagePrevented) || 0,
      repairCost: Number(report?.assets?.[key]?.repairCost) || 0,
    }])),
    protections: Object.entries(report?.protectionWear || {}).filter(([, row]) => Number(row.before) > 0),
    totals: { itemsLost: Number(report?.totals?.itemsLost) || 0, valueLost: Number(report?.totals?.valueLost) || 0, repairCost: Number(report?.totals?.repairCost) || 0, protectedUnitsExpected: Number(report?.totals?.protectedUnitsExpected) || 0, durabilitySaved: Number(report?.totals?.durabilitySaved) || 0 },
  };
}
