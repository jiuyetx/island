import { advanceHydration, collectAtDawn, freshWaterSupply, normalizeFreshWater, staminaCeiling } from './freshwater.js';
import { normalizeVoyage } from './voyage.js';
import { DISHES, normalizeCooking, prepareDish } from './cooking.js';

const DAY = 1440;
const whole = (n, fallback = 0) => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const failure = (reason) => ({ ok: false, reason });
const bagSize = (bag) => Object.values(bag).reduce((sum, n) => sum + n, 0);

export const BUILDINGS = {
  garden: { label: '椰香菜园', cost: { wood: 5, shells: 2 } },
  hut: { label: '海风小屋', cost: { wood: 8, shells: 3 } },
  dock: { label: '珊瑚码头', cost: { wood: 10, shells: 5 } },
};

export const CROPS = {
  sweetPotato: { label: '地瓜', seedPrice: 4, minutes: 720, yield: 2, price: 4 },
  tomato: { label: '番茄', seedPrice: 5, minutes: 1440, yield: 2, price: 6 },
  corn: { label: '玉米', seedPrice: 7, minutes: 2160, yield: 3, price: 5 },
  pineapple: { label: '菠萝', seedPrice: 12, minutes: 2880, yield: 2, price: 11 },
  pumpkin: { label: '南瓜', seedPrice: 16, minutes: 4320, yield: 2, price: 16 },
};

export const SEAFOOD = {
  crab: { label: '沙蟹', depth: '0–2 m', price: 6, chance: .85, minutes: 30, stamina: 4, capacity: 20, recovery: 8, tool: 'hand' },
  reefFish: { label: '珊瑚鱼', depth: '2–8 m', price: 18, chance: .65, minutes: 60, stamina: 8, capacity: 12, recovery: 4, tool: 'rod' },
  silverJack: { label: '银鲹', depth: '8–20 m', price: 26, chance: .55, minutes: 60, stamina: 10, capacity: 10, recovery: 3, tool: 'rod', rodLevel: 2, boatTier: 'iron' },
  lobster: { label: '刺龙虾', depth: '12–25 m', price: 36, chance: .70, minutes: 90, stamina: 12, capacity: 6, recovery: 1, tool: 'dive', diveLevel: 1, boatTier: 'iron', oxygen: 45, supply: 1 },
  pearlOyster: { label: '珍珠贝', depth: '20–30 m', price: 50, chance: .60, minutes: 120, stamina: 16, capacity: 4, recovery: 1, tool: 'dive', diveLevel: 2, boatTier: 'speed', oxygen: 65, supply: 2 },
};

export const SHOP = {
  sweetPotatoSeed: 4, tomatoSeed: 5, cornSeed: 7, pineappleSeed: 12, pumpkinSeed: 16, palmSeed: 10,
  diveSupply: 1, windNet: 60, drainage: 80, anchor: 70, waterproofCabinet: 50,
  waveBarrier: 100, windowReinforcement: 60, raisedBed: 20,
  rod2: 40, rod3: 90, shovel2: 60, shovel3: 140, net: 70,
  dive1: 140, dive2: 180, ironBoat: 120, speedBoat: 240, dock2: 120,
  shop2: 80, shop3: 160, backpack: 60, warehouse: 80, hut2: 100,
  lamp: 25, lowPlot: 15, highPlot: 35, solarStill: 80,
};

const STOCK = new Set(['sweetPotatoSeed', 'tomatoSeed', 'cornSeed', 'pineappleSeed', 'pumpkinSeed', 'palmSeed', 'diveSupply', 'windNet', 'drainage', 'anchor', 'waterproofCabinet', 'waveBarrier', 'windowReinforcement', 'raisedBed']);
const BAG_KEYS = new Set([...STOCK, ...Object.keys(CROPS), ...Object.keys(SEAFOOD), ...Object.keys(DISHES), 'legacyFish']);
const BOATS = { wood: 1, iron: 2, speed: 3 };
export const TREE_MATURE_MINUTES = 2880;
export const TREE_SITES = [
  // Keep palm3's mature crown away from the hut door and porch approach.
  // Site coordinates are authoritative; saved growth/health still use its ID.
  [1.3, 9.4, 1.05, .1], [-8, 1.2, .86, 1.4], [11.8, 0, 1.12, 2.1],
  [7.7, -1.8, .92, .7], [5.9, 4.8, .82, 2.8], [-2.2, 7.1, .76, .3],
  [-5.6, 6.8, .68, 2.1], [2.7, -7.8, .7, 1.1],
  [0, -10, .83, .5], [-9.8, 5.8, .78, 1.8], [9.2, -6.5, .85, 2.4],
];
const freshTrees = () => TREE_SITES.map(([x, z, scale, angle], index) => ({
  id: `palm${index + 1}`, x, z, scale, angle,
  stage: index < 8 ? 'mature' : 'empty', ageMinutes: index < 8 ? TREE_MATURE_MINUTES : 0,
  health: index < 8 ? 100 : 0, lastTendedDay: 0,
}));
const emptyPlot = (id, elevation = 'high') => ({ id, elevation, crop: null, raised: false, drainage: false, yieldFactor: 1, pauseUntil: 0 });
const textLimit = (value) => String(value ?? '').slice(0, 80);
const defenseValue = (value) => value === true ? true : Number.isFinite(value) ? clamp(whole(value), 0, 100)
  : value && typeof value === 'object' && value.installed !== false ? clamp(whole(value.durability, 100), 0, 100) : false;
function yieldRoll(plot) {
  let hash = 2166136261;
  for (const char of `${plot.id}:${plot.crop.plantedAt}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

function stormReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const number = (n) => clamp(whole(n), 0, 1_000_000);
  const decimal = (n) => clamp(Number.isFinite(n) ? n : 0, 0, 1_000_000);
  const safe = {
    id: number(value.id), intensity: clamp(number(value.intensity), 1, 3), settled: value.settled === true,
    plots: [], inventory: [], assets: {}, protectionWear: {}, totals: {},
  };
  if (value.shelter && typeof value.shelter === 'object') safe.shelter = {
    exposureMinutes: number(value.shelter.exposureMinutes), staminaLost: number(value.shelter.staminaLost),
    protected: value.shelter.protected === true,
  };
  if (Array.isArray(value.plots)) safe.plots = value.plots.slice(0, 24).filter((row) => row && typeof row === 'object').map((row) => ({
    plotId: textLimit(row.plotId), itemId: textLimit(row.itemId), beforeUnits: number(row.beforeUnits), lostUnits: number(row.lostUnits), valueLost: number(row.valueLost), protectedUnitsExpected: decimal(row.protectedUnitsExpected),
    lossRate: clamp(Number(row.lossRate) || 0, 0, 1), windProtected: row.windProtected === true, drainageProtected: row.drainageProtected === true,
  }));
  if (Array.isArray(value.inventory)) safe.inventory = value.inventory.slice(0, 100).filter((row) => row && typeof row === 'object').map((row) => ({
    stackId: textLimit(row.stackId), itemId: textLimit(row.itemId), resourceId: textLimit(row.resourceId), kind: textLimit(row.kind), before: number(row.before), lost: number(row.lost), valueLost: number(row.valueLost), protectedUnitsExpected: decimal(row.protectedUnitsExpected),
    lossRate: clamp(Number(row.lossRate) || 0, 0, 1), protected: row.protected === true,
  }));
  for (const key of ['boat', 'dock', 'hut']) {
    const row = value.assets?.[key];
    if (!row || typeof row !== 'object') continue;
    safe.assets[key] = { damage: number(row.damage), damagePrevented: number(row.damagePrevented), durabilityBefore: row.durabilityBefore == null ? null : number(row.durabilityBefore), durabilityAfter: row.durabilityAfter == null ? null : number(row.durabilityAfter), downgraded: row.downgraded === true, repairCost: number(row.repairCost) };
  }
  for (const key of ['windNet', 'drainage', 'anchor', 'waterproofCabinet', 'waveBarrier', 'shutters']) {
    const row = value.protectionWear?.[key];
    if (!row || typeof row !== 'object') continue;
    safe.protectionWear[key] = { before: number(row.before), after: number(row.after), repairCostPer20: number(row.repairCostPer20) };
  }
  for (const key of ['itemsLost', 'valueLost', 'repairCost', 'durabilitySaved']) safe.totals[key] = number(value.totals?.[key]);
  safe.totals.protectedUnitsExpected = decimal(value.totals?.protectedUnitsExpected);
  return safe;
}

function clock(state) {
  state.clockHours = (state.gameMinutes % DAY) / 60;
  state.gameHours = state.gameMinutes / 60;
  state.dayId = Math.floor((state.gameMinutes - 360) / DAY) + 1;
}

function fishTotals(state) {
  state.fishCount = (state.inventory.legacyFish || 0) + Object.keys(SEAFOOD).reduce((n, key) => n + (state.inventory[key] || 0), 0);
  state.fishValue = state.legacyFishValue + Object.entries(SEAFOOD).reduce((n, [key, spec]) => n + (state.inventory[key] || 0) * spec.price, 0);
}

export function freshState(now = Date.now()) {
  return {
    schemaVersion: 2, gameMinutes: 360, clockHours: 6, gameHours: 6, dayId: 1, stamina: 100,
    freshwater: freshWaterSupply(),
    satiety: 70, cooking: normalizeCooking(null),
    gold: 80, inventory: { sweetPotatoSeed: 4 }, storage: {}, legacyFishValue: 0,
    fishCount: 0, fishValue: 0, rodLevel: 1, hasNet: false, shovelLevel: 1, diveLevel: 0,
    oxygen: 0, boatTier: 'wood', boatDurability: 100, dockLevel: 1, dockDurability: 100,
    shopLevel: 1, hutLevel: 1, hutDurability: 100,
    backpackCapacity: 20, storageCapacity: 40, soldLifetime: 0, ordersCompleted: 0,
    orderBoard: null,
    protectedStorageIds: [],
    stormCount: 0, storm: { id: 1, seed: 1, intensity: 1, impactAt: 9360, nextDay: 7, settledId: 0, stage: 'calm', result: null },
    shelter: { inside: false, doorOpen: false, exposureMinutes: 0, lastCheckedMinutes: 360 },
    netUsesDay: 0, hasLamp: false, harvestCount: 0,
    discovered: {}, explored: { reef: false },
    voyage: normalizeVoyage(null),
    trees: freshTrees(),
    plots: Array.from({ length: 4 }, (_, i) => emptyPlot(`plot${i + 1}`)),
    defenses: { plots: Array.from({ length: 4 }, (_, i) => ({ id: `plot${i + 1}`, windNet: false, drainage: false })), anchor: false, waterproofCabinet: false, waveBarrier: false, shutters: false },
    ecology: Object.fromEntries(Object.entries(SEAFOOD).map(([key, spec]) => [key, spec.capacity])),
    built: { garden: true, hut: true, dock: true }, wood: 8, shells: 3, food: 0, people: 1,
    updatedAt: now, lastRodAt: 0, lastNetAt: 0,
    gatherCooldowns: {},
  };
}

function makeDailyOrder(dayId, slot) {
  const seafoodIds = Object.keys(SEAFOOD);
  const cropIds = Object.keys(CROPS);
  const seafoodId = seafoodIds[(dayId * 3 + slot * 2) % seafoodIds.length];
  const cropId = cropIds[(dayId * 2 + slot * 3) % cropIds.length];
  return {
    id: `${dayId}-${slot + 1}`,
    requirements: [
      { itemId: seafoodId, quantity: (dayId + slot) % 3 + 1 },
      { itemId: cropId, quantity: (dayId + slot + 1) % 3 + 1 },
    ],
    bonus: 10,
    completed: false,
  };
}

export function ensureDailyOrders(state) {
  if (state.shopLevel < 2) return [];
  const count = state.shopLevel >= 3 ? 2 : 1;
  if (state.orderBoard?.dayId === state.dayId && Array.isArray(state.orderBoard.offers) && state.orderBoard.offers.length === count) return state.orderBoard.offers;
  const previous = state.orderBoard?.dayId === state.dayId ? state.orderBoard.offers : [];
  const completedIds = new Set((Array.isArray(previous) ? previous : [])
    .filter((order) => order?.completed === true).map((order) => order.id));
  state.orderBoard = {
    dayId: state.dayId,
    offers: Array.from({ length: count }, (_, slot) => {
      const order = makeDailyOrder(state.dayId, slot);
      order.completed = completedIds.has(order.id);
      return order;
    }),
  };
  return state.orderBoard.offers;
}

function cleanBag(input) {
  const bag = {};
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const key of BAG_KEYS) if (whole(input[key])) bag[key] = whole(input[key]);
  }
  return bag;
}

export function normalizeState(value, now = Date.now()) {
  const state = freshState(now);
  if (!value || typeof value !== 'object') return state;
  const current = value.schemaVersion === 2;
  state.voyage = normalizeVoyage(value.voyage);
  state.cooking = normalizeCooking(value.cooking);
  state.gold = whole(value.gold, current ? 80 : 10);
  for (const key of ['wood', 'shells', 'food']) state[key] = whole(value[key], state[key]);
  if (whole(value.legacyPeople || value.people) > 1) state.legacyPeople = whole(value.legacyPeople || value.people);
  if (value.built && typeof value.built === 'object') {
    for (const key of Object.keys(BUILDINGS)) if (value.built[key] === true) state.built[key] = true;
  }
  state.rodLevel = clamp(whole(value.rodLevel, 1), 1, 3);
  if (whole(value.legacyRodLevel || value.rodLevel) > 3) state.legacyRodLevel = whole(value.legacyRodLevel || value.rodLevel);
  state.hasNet = value.hasNet === true;
  state.lastRodAt = whole(value.lastRodAt);
  state.lastNetAt = whole(value.lastNetAt);
  if (value.gatherCooldowns && typeof value.gatherCooldowns === 'object' && !Array.isArray(value.gatherCooldowns)) {
    for (const [id, until] of Object.entries(value.gatherCooldowns).slice(0, 128)) {
      if (/^[a-z0-9_-]{1,32}$/i.test(id) && Number.isFinite(until)) state.gatherCooldowns[id] = Math.max(0, until);
    }
  }
  state.updatedAt = Number.isFinite(value.updatedAt) ? value.updatedAt : now;
  if (!current) {
    state.inventory = {};
    state.legacyFishValue = whole(value.fishValue);
    if (whole(value.fishCount) || state.legacyFishValue) state.inventory.legacyFish = Math.max(1, whole(value.fishCount));
    fishTotals(state);
    return state;
  }
  state.inventory = cleanBag(value.inventory);
  state.storage = cleanBag(value.storage);
  state.freshwater = normalizeFreshWater(value.freshwater);
  if (Array.isArray(value.trees)) {
    for (const tree of state.trees) {
      const saved = value.trees.find((entry) => entry?.id === tree.id);
      if (!saved) continue;
      tree.stage = ['empty', 'stump', 'growing', 'mature'].includes(saved.stage) ? saved.stage : tree.stage;
      tree.ageMinutes = clamp(whole(saved.ageMinutes, tree.ageMinutes), 0, TREE_MATURE_MINUTES);
      tree.health = clamp(whole(saved.health, tree.health), 0, 100);
      tree.lastTendedDay = whole(saved.lastTendedDay);
      if (tree.stage === 'growing' && tree.ageMinutes >= TREE_MATURE_MINUTES) tree.stage = 'mature';
    }
  }
  if (Array.isArray(value.protectedStorageIds)) state.protectedStorageIds = value.protectedStorageIds.filter((id) => BAG_KEYS.has(id)).slice(0, 32);
  state.legacyFishValue = state.inventory.legacyFish ? whole(value.legacyFishValue) : 0;
  for (const key of ['stamina', 'satiety', 'shovelLevel', 'diveLevel', 'oxygen', 'boatDurability', 'dockDurability', 'hutDurability', 'dockLevel', 'shopLevel', 'hutLevel', 'backpackCapacity', 'storageCapacity', 'soldLifetime', 'ordersCompleted', 'stormCount', 'netUsesDay', 'harvestCount']) {
    if (Number.isFinite(value[key])) state[key] = whole(value[key]);
  }
  state.stamina = clamp(state.stamina, 0, 100);
  state.satiety = clamp(state.satiety, 0, 100);
  state.stamina = Math.min(state.stamina, staminaCeiling(state));
  state.shovelLevel = clamp(state.shovelLevel, 1, 3);
  state.diveLevel = clamp(state.diveLevel, 0, 2);
  state.oxygen = clamp(state.oxygen, 0, state.diveLevel === 2 ? 150 : state.diveLevel === 1 ? 100 : 0);
  state.boatDurability = clamp(state.boatDurability, 0, 100);
  state.dockDurability = clamp(state.dockDurability, 0, 100);
  state.hutDurability = clamp(state.hutDurability, 0, 100);
  state.dockLevel = clamp(state.dockLevel, 1, 2);
  state.shopLevel = clamp(state.shopLevel, 1, 3);
  state.hutLevel = clamp(state.hutLevel, 1, 2);
  state.backpackCapacity = state.backpackCapacity >= 30 ? 30 : 20;
  state.storageCapacity = state.storageCapacity >= 80 ? 80 : 40;
  state.boatTier = value.boatTier === 'wreck' ? 'wreck' : BOATS[value.boatTier] ? value.boatTier : 'wood';
  state.hasLamp = value.hasLamp === true;
  if (value.orderBoard && typeof value.orderBoard === 'object') {
    state.orderBoard = {
      dayId: whole(value.orderBoard.dayId),
      offers: Array.isArray(value.orderBoard.offers) ? value.orderBoard.offers.slice(0, 2)
        .map((order) => ({ id: textLimit(order?.id), completed: order?.completed === true })) : [],
    };
  }
  state.gameMinutes = Number.isFinite(value.gameMinutes) ? Math.max(360, value.gameMinutes) : 360;
  if (value.shelter && typeof value.shelter === 'object') {
    state.shelter.inside = value.shelter.inside === true;
    state.shelter.doorOpen = value.shelter.doorOpen === true;
    state.shelter.exposureMinutes = clamp(Number(value.shelter.exposureMinutes) || 0, 0, 240);
    state.shelter.lastCheckedMinutes = clamp(Number(value.shelter.lastCheckedMinutes) || state.gameMinutes, 360, state.gameMinutes);
  } else state.shelter.lastCheckedMinutes = state.gameMinutes;
  clock(state);
  if (Array.isArray(value.plots)) {
    const seen = new Set();
    state.plots = value.plots.slice(0, 24).filter((p) => p && typeof p.id === 'string' && !seen.has(p.id) && seen.add(p.id)).map((p) => ({
      id: p.id, elevation: p.elevation === 'low' ? 'low' : 'high', raised: p.raised === true,
      drainage: p.drainage === true, yieldFactor: clamp(Number.isFinite(p.yieldFactor) ? p.yieldFactor : 1, .5, 1),
      pauseUntil: Number.isFinite(p.pauseUntil) ? p.pauseUntil : 0,
      crop: p.crop && CROPS[p.crop.id] ? {
        id: p.crop.id, plantedAt: Number.isFinite(p.crop.plantedAt) ? p.crop.plantedAt : state.gameMinutes,
        growthMinutes: clamp(Number.isFinite(p.crop.growthMinutes) ? p.crop.growthMinutes : 0, 0, CROPS[p.crop.id].minutes),
        wateredUntil: Number.isFinite(p.crop.wateredUntil) ? p.crop.wateredUntil : state.gameMinutes,
        expectedUnits: clamp(whole(p.crop.expectedUnits, CROPS[p.crop.id].yield), 0, CROPS[p.crop.id].yield),
      } : null,
    }));
  }
  if (value.ecology && typeof value.ecology === 'object') {
    for (const [key, spec] of Object.entries(SEAFOOD)) state.ecology[key] = clamp(whole(value.ecology[key], spec.capacity), 0, spec.capacity);
  }
  if (value.discovered && typeof value.discovered === 'object') {
    for (const key of Object.keys(SEAFOOD)) state.discovered[key] = value.discovered[key] === true;
  }
  if (value.explored && typeof value.explored === 'object') state.explored.reef = value.explored.reef === true;
  state.defenses.plots = state.plots.map((plot) => {
    const old = Array.isArray(value.defenses?.plots) ? value.defenses.plots.find((entry) => entry?.id === plot.id) : null;
    const drainage = old && Object.prototype.hasOwnProperty.call(old, 'drainage') ? defenseValue(old.drainage) : plot.drainage;
    plot.drainage = drainage === true || drainage > 0;
    return { id: plot.id, windNet: defenseValue(old?.windNet), drainage };
  });
  for (const key of ['anchor', 'waterproofCabinet', 'waveBarrier', 'shutters']) state.defenses[key] = defenseValue(value.defenses?.[key]);
  if (value.storm && typeof value.storm === 'object') {
    const old = value.storm;
    state.storm.id = Math.max(1, whole(old.id, whole(old.count, 0) + 1));
    state.storm.intensity = clamp(whole(old.intensity, whole(old.strength, 1)), 1, 3);
    state.storm.impactAt = Math.max(9360, whole(old.impactAt, (Math.max(7, whole(old.nextDay, 7)) - 1) * DAY + 720));
    state.storm.settledId = Math.min(state.storm.id, whole(old.settledId));
    state.storm.seed = Math.max(1, whole(old.seed, 1));
    state.storm.stage = ['calm', 'warning', 'preparation', 'impact', 'settled'].includes(old.stage) ? old.stage : 'calm';
    state.storm.result = stormReport(old.result);
    state.stormCount = Math.max(state.stormCount, state.storm.settledId);
  }
  ensureDailyOrders(state);
  fishTotals(state);
  return state;
}

export function tideAt(gameHour) {
  const h = ((gameHour % 24) + 24) % 24;
  if (h >= 23 || h < 1 || (h >= 11 && h < 13)) return 'low';
  if ((h >= 5 && h < 7) || (h >= 17 && h < 19)) return 'high';
  if ((h >= 1 && h < 5) || (h >= 13 && h < 17)) return 'rising';
  return 'falling';
}

function grow(state, from, to) {
  for (const plot of state.plots) {
    if (!plot.crop) continue;
    const start = Math.max(from, plot.pauseUntil);
    const gain = Math.max(0, Math.min(to, plot.crop.wateredUntil) - start);
    plot.crop.growthMinutes = Math.min(CROPS[plot.crop.id].minutes, plot.crop.growthMinutes + gain);
  }
  for (const tree of state.trees || []) {
    if (tree.stage !== 'growing') continue;
    tree.ageMinutes = Math.min(TREE_MATURE_MINUTES, tree.ageMinutes + Math.max(0, to - from));
    if (tree.ageMinutes >= TREE_MATURE_MINUTES) tree.stage = 'mature';
  }
}

export function chopTree(state, treeId) {
  const tree = state.trees?.find((entry) => entry.id === treeId);
  if (!tree || tree.stage !== 'mature') return failure('not-mature');
  if (state.stamina < 8) return failure('stamina');
  state.stamina -= 8;
  const wood = tree.health >= 50 ? 4 : 2;
  state.wood += wood;
  tree.stage = 'stump'; tree.ageMinutes = 0; tree.health = 0;
  spendActionTime(state, 45);
  return { ok: true, wood };
}

export function plantTree(state, treeId) {
  const tree = state.trees?.find((entry) => entry.id === treeId);
  if (!tree || !['empty', 'stump'].includes(tree.stage)) return failure('occupied');
  if (!(state.inventory.palmSeed > 0)) return failure('no-seed');
  if (state.stamina < 4) return failure('stamina');
  state.inventory.palmSeed--;
  if (!state.inventory.palmSeed) delete state.inventory.palmSeed;
  state.stamina -= 4;
  tree.stage = 'growing'; tree.ageMinutes = 0; tree.health = 65; tree.lastTendedDay = 0;
  spendActionTime(state, 30);
  return { ok: true };
}

export function tendTree(state, treeId) {
  const tree = state.trees?.find((entry) => entry.id === treeId);
  if (!tree || !['growing', 'mature'].includes(tree.stage)) return failure('no-tree');
  if (tree.lastTendedDay === state.dayId) return failure('already-tended');
  if (state.stamina < 2) return failure('stamina');
  state.stamina -= 2;
  tree.health = Math.min(100, tree.health + 20);
  if (tree.stage === 'growing') {
    tree.ageMinutes = Math.min(TREE_MATURE_MINUTES, tree.ageMinutes + 360);
    if (tree.ageMinutes >= TREE_MATURE_MINUTES) tree.stage = 'mature';
  }
  tree.lastTendedDay = state.dayId;
  spendActionTime(state, 20);
  return { ok: true, health: tree.health, stage: tree.stage };
}

function highTide(state, at) {
  const day = Math.floor((at - 360) / DAY) + 1;
  const spring = day % 8 === 4 || day % 8 === 0;
  for (const plot of state.plots) {
    if (!plot.crop || plot.elevation !== 'low' || plot.raised) continue;
    const drain = state.defenses.plots.find((entry) => entry.id === plot.id)?.drainage;
    plot.drainage = drain === true || drain > 0;
    plot.yieldFactor = Math.max(.5, plot.yieldFactor * (plot.drainage ? spring ? .98 : .99 : spring ? .90 : .95));
    plot.pauseUntil = Math.max(plot.pauseUntil, at + (plot.drainage ? spring ? 30 : 15 : spring ? 120 : 60));
    const exact = CROPS[plot.crop.id].yield * plot.yieldFactor;
    const rounded = Math.floor(exact) + (yieldRoll(plot) < exact % 1 ? 1 : 0);
    plot.crop.expectedUnits = Math.min(plot.crop.expectedUnits, rounded);
  }
}

// Caller decides when foreground time runs; no wall-clock or offline accrual occurs here.
export function advanceGameTime(state, elapsedRealSeconds) {
  if (!Number.isFinite(elapsedRealSeconds) || elapsedRealSeconds <= 0) return { minutes: 0, dayChanges: 0, tide: tideAt(state.clockHours) };
  const minutes = elapsedRealSeconds * 2;
  const target = state.gameMinutes + minutes;
  let dayChanges = 0;
  while (state.gameMinutes < target) {
    const nextPeak = (Math.floor((state.gameMinutes - 360) / 720) + 1) * 720 + 360;
    const nextDay = (Math.floor((state.gameMinutes - 360) / DAY) + 1) * DAY + 360;
    const next = Math.min(target, nextPeak, nextDay);
    grow(state, state.gameMinutes, next);
    const elapsedMinutes = next - state.gameMinutes;
    advanceHydration(state, elapsedMinutes);
    state.satiety = clamp(state.satiety - elapsedMinutes * 25 / DAY, 0, 100);
    state.gameMinutes = next;
    if (next === nextDay) {
      dayChanges++;
      const newDay = Math.floor((next - 360) / DAY) + 1;
      collectAtDawn(state, newDay);
      // Dawn only resets daily limits. Stamina is recovered explicitly by eating and resting.
      state.stamina = Math.min(state.stamina, staminaCeiling(state));
      state.netUsesDay = 0;
      for (const [key, spec] of Object.entries(SEAFOOD)) state.ecology[key] = Math.min(spec.capacity, state.ecology[key] + spec.recovery);
    }
    if (next === nextPeak) highTide(state, next);
  }
  clock(state);
  ensureDailyOrders(state);
  return { minutes, dayChanges, tide: tideAt(state.clockHours) };
}

export function spendActionTime(state, gameMinutes) {
  if (!Number.isFinite(gameMinutes) || gameMinutes < 0) return false;
  advanceGameTime(state, gameMinutes / 2);
  return true;
}

export function restRecoveryCap(state) {
  const foodCap = state.satiety < 20 ? state.stamina : state.satiety < 40 ? 75 : 100;
  return Math.min(staminaCeiling(state), foodCap);
}

export function eatMeal(state, preferredItemId = null) {
  if (state.satiety >= 100) return failure('full');
  if (preferredItemId === 'food') {
    if (!(state.food > 0)) return failure('no-food');
    state.food--;
    state.satiety = Math.min(100, state.satiety + 35);
    return { ok: true, itemId: 'food', label: '储备食物', satiety: state.satiety };
  }
  const edible = [...Object.keys(DISHES), ...Object.keys(CROPS), ...Object.keys(SEAFOOD)];
  let itemId = preferredItemId;
  if (itemId != null && (!edible.includes(itemId) || !(state.inventory[itemId] > 0))) return failure('no-food');
  if (itemId == null) {
    itemId = edible.find((id) => state.inventory[id] > 0) || null;
  }
  if (!itemId && state.food > 0) {
    state.food--;
    state.satiety = Math.min(100, state.satiety + 35);
    return { ok: true, itemId: 'food', label: '储备食物', satiety: state.satiety };
  }
  if (!itemId) return failure('no-food');
  state.inventory[itemId]--;
  if (!state.inventory[itemId]) delete state.inventory[itemId];
  state.satiety = Math.min(100, state.satiety + (DISHES[itemId]?.satiety ?? (CROPS[itemId] ? 32 : 42)));
  fishTotals(state);
  return { ok: true, itemId, label: DISHES[itemId] ? `${DISHES[itemId].name} Lv.${DISHES[itemId].level}` : CROPS[itemId]?.label || SEAFOOD[itemId]?.label, satiety: state.satiety };
}

export function cookMeal(state, recipeId) {
  const result = prepareDish(state, recipeId);
  if (result.ok) fishTotals(state);
  return result;
}

export function consumeRestNutrition(state, kind) {
  state.satiety = Math.max(0, state.satiety - (kind === 'overnight' ? 20 : 10));
}

export function inventoryUsed(state, where = 'inventory') { return bagSize(state[where] || {}); }

export function moveStock(state, itemId, quantity, from = 'inventory', to = 'storage') {
  if (!BAG_KEYS.has(itemId) || itemId === 'legacyFish' || !Number.isInteger(quantity) || quantity < 1 || !['inventory', 'storage'].includes(from) || !['inventory', 'storage'].includes(to) || from === to) return failure('invalid-item');
  const source = state[from], destination = state[to];
  if ((source[itemId] || 0) < quantity) return failure('insufficient-stock');
  const capacity = to === 'inventory' ? state.backpackCapacity : state.storageCapacity + (state.hutLevel > 1 ? 20 : 0);
  if (bagSize(destination) + quantity > capacity) return failure('capacity');
  source[itemId] -= quantity;
  if (!source[itemId]) delete source[itemId];
  destination[itemId] = (destination[itemId] || 0) + quantity;
  fishTotals(state);
  return { ok: true };
}

export function moveAllStock(state, from, to) {
  if (!['inventory', 'storage'].includes(from) || !['inventory', 'storage'].includes(to) || from === to) return failure('invalid-destination');
  const next = { ...state, inventory: { ...state.inventory }, storage: { ...state.storage } };
  for (const [itemId, quantity] of Object.entries(next[from])) {
    const result = moveStock(next, itemId, quantity, from, to);
    if (!result.ok) return result;
  }
  state.inventory = next.inventory;
  state.storage = next.storage;
  const stored = new Set(state.protectedStorageIds || []);
  if (to === 'storage') for (const itemId of Object.keys(state.storage)) stored.add(itemId);
  else for (const itemId of Object.keys(state.inventory)) stored.delete(itemId);
  state.protectedStorageIds = [...stored];
  fishTotals(state);
  return { ok: true };
}

export function repairQuote(state, asset, targetDurability = 100) {
  const tier = asset === 'boat' ? state.boatTier : asset === 'dock' ? state.dockLevel : asset === 'hut' ? state.hutLevel : null;
  const key = `${asset}Durability`;
  if (tier == null || !Number.isFinite(state[key]) || !Number.isFinite(targetDurability)) return failure('invalid-asset');
  const points = Math.max(0, Math.min(100, Math.floor(targetDurability)) - state[key]);
  if (!points) return failure('full-durability');
  const rate = asset !== 'boat' ? 1 : tier === 'speed' ? 3 : tier === 'iron' ? 2 : 1;
  const units = Math.ceil(points / 10);
  return { ok: true, asset, points, cost: points * rate, stamina: units, minutes: units * 6 };
}

export function repairAsset(state, asset, targetDurability = 100) {
  const quote = repairQuote(state, asset, targetDurability);
  if (!quote.ok) return quote;
  if (state.gold < quote.cost) return failure('gold');
  if (state.stamina < quote.stamina) return failure('stamina');
  state.gold -= quote.cost;
  state.stamina -= quote.stamina;
  state[`${asset}Durability`] += quote.points;
  if (asset === 'boat' && state.boatTier === 'wreck' && state.boatDurability >= 100) state.boatTier = 'wood';
  spendActionTime(state, quote.minutes);
  return quote;
}

// Driftwood is useful after a storm without replacing paid, full restoration.
export function woodPatchQuote(state, asset) {
  const key = `${asset}Durability`;
  if (!['boat', 'dock', 'hut'].includes(asset) || !Number.isFinite(state[key])) return failure('invalid-asset');
  const points = Math.min(20, Math.max(0, 40 - state[key]));
  if (!points) return failure('above-patch-limit');
  const wood = Math.ceil(points / 10);
  return { ok: true, asset, points, wood, stamina: wood * 4, minutes: wood * 30 };
}

export function patchAssetWithWood(state, asset) {
  const quote = woodPatchQuote(state, asset);
  if (!quote.ok) return quote;
  if (state.wood < quote.wood) return failure('wood');
  if (state.stamina < quote.stamina) return failure('stamina');
  state.wood -= quote.wood;
  state.stamina -= quote.stamina;
  state[`${asset}Durability`] += quote.points;
  spendActionTime(state, quote.minutes);
  return quote;
}

export function catchSeafood(state, speciesId, tool = SEAFOOD[speciesId]?.tool, random = Math.random, options = {}) {
  const spec = SEAFOOD[speciesId];
  if (!spec) return failure('unknown-species');
  if (spec.tool === 'hand' ? tool !== 'hand' : spec.tool === 'dive' ? tool !== 'dive' : !['rod', 'net'].includes(tool)) return failure('wrong-tool');
  if (tool === 'net' && (!state.hasNet || state.netUsesDay >= 3)) return failure(state.hasNet ? 'net-limit' : 'no-net');
  if (spec.rodLevel && state.rodLevel < spec.rodLevel) return failure('rod-level');
  if (spec.diveLevel && state.diveLevel < spec.diveLevel) return failure('dive-level');
  if (spec.boatTier && (BOATS[state.boatTier] || 0) < BOATS[spec.boatTier]) return failure('boat-level');
  if (spec.supply && (state.inventory.diveSupply || 0) < spec.supply) return failure('dive-supply');
  if (spec.oxygen && state.oxygen < spec.oxygen) return failure('oxygen');
  const attempts = tool === 'net' ? 2 : 1;
  // The visible fishing/capture sequence already represents most of the work. Keep the
  // settlement cost bounded so a single catch cannot silently skip several hours.
  const minutes = tool === 'net' ? 30 : spec.tool === 'rod' ? 15 : spec.tool === 'dive' ? 30 : 15;
  const stamina = Math.ceil(spec.stamina * (tool === 'net' ? 1.5 : 1));
  if (state.stamina < stamina) return failure('stamina');
  if (state.ecology[speciesId] <= 0) return failure('depleted');
  if (inventoryUsed(state) + attempts > state.backpackCapacity) return failure('capacity');
  const tide = tideAt(state.clockHours);
  const modifier = speciesId === 'crab' ? tide === 'low' ? .10 : 0
    : speciesId === 'reefFish' || speciesId === 'silverJack' ? tide === 'low' ? -.10 : tide === 'rising' ? .10 : tide === 'high' ? .05 : 0
      : tide === 'low' ? .05 : tide === 'rising' ? -.10 : 0;
  const rodBonus = tool === 'rod' ? clamp(Number(options.rodSkillBonus) || 0, 0, .25) : 0;
  const chance = clamp(spec.chance + modifier + rodBonus, .05, .95) * Math.min(1, 2 * state.ecology[speciesId] / spec.capacity);
  state.stamina -= stamina;
  if (tool === 'net') state.netUsesDay++;
  if (spec.supply) {
    state.inventory.diveSupply -= spec.supply;
    if (!state.inventory.diveSupply) delete state.inventory.diveSupply;
  }
  if (spec.oxygen) state.oxygen -= spec.oxygen;
  let caught = 0;
  for (let i = 0; i < attempts && state.ecology[speciesId] > 0; i++) {
    const p = clamp(spec.chance + modifier + rodBonus, .05, .95) * Math.min(1, 2 * state.ecology[speciesId] / spec.capacity);
    if (random() < p) { caught++; state.ecology[speciesId]--; }
  }
  if (caught) state.inventory[speciesId] = (state.inventory[speciesId] || 0) + caught;
  state.discovered[speciesId] = true;
  spendActionTime(state, minutes);
  fishTotals(state);
  return { ok: true, caught, value: caught * spec.price, chance, minutes, stamina };
}

export function refillOxygen(state) {
  if (!state.diveLevel) return failure('no-suit');
  state.oxygen = state.diveLevel === 2 ? 150 : 100;
  return { ok: true, oxygen: state.oxygen };
}

export function usableCropSeed(state, preferredCropId) {
  if (CROPS[preferredCropId] && state.inventory?.[`${preferredCropId}Seed`] > 0) return preferredCropId;
  return Object.keys(CROPS).find((cropId) => state.inventory?.[`${cropId}Seed`] > 0) || null;
}

export function plantCrop(state, plotId, cropId) {
  const plot = state.plots.find((p) => p.id === plotId);
  if (!plot || !CROPS[cropId]) return failure('invalid-plot-or-crop');
  if (plot.crop) return failure('occupied');
  const seed = `${cropId}Seed`;
  if (!(state.inventory[seed] > 0)) return failure('no-seed');
  const minutes = state.shovelLevel === 3 ? 9 : state.shovelLevel === 2 ? 12 : 15;
  const stamina = state.shovelLevel === 3 ? 1 : state.shovelLevel === 2 ? 2 : 3;
  if (state.stamina < stamina) return failure('stamina');
  state.inventory[seed]--;
  if (!state.inventory[seed]) delete state.inventory[seed];
  state.stamina -= stamina;
  spendActionTime(state, minutes);
  plot.crop = { id: cropId, plantedAt: state.gameMinutes, growthMinutes: 0, wateredUntil: state.gameMinutes + DAY, expectedUnits: CROPS[cropId].yield };
  plot.yieldFactor = 1;
  plot.pauseUntil = 0;
  return { ok: true, minutes, stamina };
}

export function waterCrop(state, plotId) {
  const plot = state.plots.find((p) => p.id === plotId);
  if (!plot?.crop) return failure('no-crop');
  if (plot.crop.growthMinutes >= CROPS[plot.crop.id].minutes) return failure('already-grown');
  if (state.stamina < 1) return failure('stamina');
  if (!(state.freshwater?.canteen > 0)) return failure('water');
  state.freshwater.canteen--;
  state.stamina--;
  spendActionTime(state, 6);
  plot.crop.wateredUntil = state.gameMinutes + DAY;
  return { ok: true, minutes: 6, stamina: 1 };
}

export function harvestCrop(state, plotId, random = Math.random) {
  const plot = state.plots.find((p) => p.id === plotId);
  if (!plot?.crop) return failure('no-crop');
  const cropId = plot.crop.id;
  const spec = CROPS[cropId];
  if (plot.crop.growthMinutes < spec.minutes) return failure('not-grown');
  if (state.stamina < 2) return failure('stamina');
  const exact = spec.yield * plot.yieldFactor;
  const quantity = Number.isInteger(plot.crop.expectedUnits) ? clamp(plot.crop.expectedUnits, 0, spec.yield)
    : Math.floor(exact) + (random() < exact % 1 ? 1 : 0);
  if (inventoryUsed(state) + quantity > state.backpackCapacity) return failure('capacity');
  state.stamina -= 2;
  if (quantity) state.inventory[cropId] = (state.inventory[cropId] || 0) + quantity;
  plot.crop = null;
  plot.yieldFactor = 1;
  plot.pauseUntil = 0;
  spendActionTime(state, 15);
  state.harvestCount++;
  return { ok: true, itemId: cropId, quantity, value: quantity * spec.price, minutes: 15, stamina: 2 };
}

function canUpgrade(state, id) {
  switch (id) {
    case 'rod2': return state.rodLevel === 1 && state.soldLifetime > 0;
    case 'rod3': return state.rodLevel === 2;
    case 'shovel2': return state.shovelLevel === 1 && state.harvestCount > 0;
    case 'shovel3': return state.shovelLevel === 2 && Math.max(state.stormCount, state.storm.settledId) > 0;
    case 'net': return !state.hasNet && Object.values(state.discovered).filter(Boolean).length >= 2;
    case 'dive1': return state.diveLevel === 0 && BOATS[state.boatTier] >= 2 && state.explored.reef;
    case 'dive2': return state.diveLevel === 1 && state.boatTier === 'speed';
    case 'ironBoat': return state.boatTier === 'wood' && state.boatDurability === 100 && state.built.dock;
    case 'speedBoat': return state.boatTier === 'iron' && state.boatDurability === 100 && state.dockLevel === 2 && Math.max(state.stormCount, state.storm.settledId) >= 2;
    case 'dock2': return state.dockLevel === 1 && BOATS[state.boatTier] >= 2 && Math.max(state.stormCount, state.storm.settledId) > 0;
    case 'shop2': return state.shopLevel === 1 && state.soldLifetime >= 150;
    case 'shop3': return state.shopLevel === 2 && state.ordersCompleted >= 5;
    case 'backpack': return state.backpackCapacity === 20;
    case 'warehouse': return state.storageCapacity === 40;
    case 'hut2': return state.hutLevel === 1;
    case 'lamp': return !state.hasLamp;
    case 'solarStill': return state.freshwater.stillLevel === 0;
    case 'lowPlot': return state.plots.length < (state.shovelLevel === 1 ? 4 : state.shovelLevel === 2 ? 8 : 24);
    case 'highPlot': return state.plots.filter((p) => p.elevation === 'high').length < 8 && state.plots.length < (state.shovelLevel === 1 ? 4 : state.shovelLevel === 2 ? 8 : 24);
    default: return false;
  }
}

function upgrade(state, id) {
  if (id === 'rod2' || id === 'rod3') state.rodLevel++;
  else if (id === 'shovel2' || id === 'shovel3') state.shovelLevel++;
  else if (id === 'net') state.hasNet = true;
  else if (id === 'dive1' || id === 'dive2') { state.diveLevel++; refillOxygen(state); }
  else if (id === 'ironBoat') state.boatTier = 'iron';
  else if (id === 'speedBoat') state.boatTier = 'speed';
  else if (id === 'dock2') state.dockLevel = 2;
  else if (id === 'shop2' || id === 'shop3') state.shopLevel++;
  else if (id === 'backpack') state.backpackCapacity = 30;
  else if (id === 'warehouse') state.storageCapacity = 80;
  else if (id === 'hut2') state.hutLevel = 2;
  else if (id === 'lamp') state.hasLamp = true;
  else if (id === 'solarStill') state.freshwater.stillLevel = 1;
  else if (id === 'lowPlot' || id === 'highPlot') {
    const plot = emptyPlot(`plot${state.plots.length + 1}`, id === 'lowPlot' ? 'low' : 'high');
    state.plots.push(plot);
    state.defenses.plots.push({ id: plot.id, windNet: false, drainage: false });
  }
}

export function buyItem(state, itemId, quantity = 1) {
  if (!(itemId in SHOP) || !Number.isInteger(quantity) || quantity < 1) return failure('invalid-item');
  const stock = STOCK.has(itemId);
  if (!stock && quantity !== 1) return failure('one-time');
  if (!stock && !canUpgrade(state, itemId)) return failure('locked');
  const cost = SHOP[itemId] * quantity;
  if (state.gold < cost) return failure('gold');
  if (stock && inventoryUsed(state) + quantity > state.backpackCapacity) return failure('capacity');
  state.gold -= cost;
  if (stock) state.inventory[itemId] = (state.inventory[itemId] || 0) + quantity;
  else upgrade(state, itemId);
  if (itemId === 'shop2' || itemId === 'shop3') ensureDailyOrders(state);
  return { ok: true, cost, itemId, quantity };
}

export function installDefense(state, itemId, targetIds = []) {
  const field = { anchor: 'anchor', waterproofCabinet: 'waterproofCabinet', waveBarrier: 'waveBarrier', windowReinforcement: 'shutters' }[itemId];
  const plots = ['windNet', 'drainage', 'raisedBed'].includes(itemId);
  if (!field && !plots) return failure('invalid-defense');
  if (!(state.inventory[itemId] > 0)) return failure('insufficient-stock');
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  if (plots && (ids.length < 1 || ids.length > (itemId === 'raisedBed' ? 1 : 6) || new Set(ids).size !== ids.length)) return failure('coverage');
  const selected = plots ? ids.map((id) => state.plots.find((plot) => plot.id === id)) : [];
  if (plots && (selected.some((plot) => !plot) || selected.some((plot) => itemId === 'raisedBed' ? plot.raised : state.defenses.plots.find((entry) => entry.id === plot.id)?.[itemId]))) return failure('already-protected');
  if (field && state.defenses[field]) return failure('already-protected');
  const minutes = itemId === 'drainage' || itemId === 'waveBarrier' ? 30 : 15;
  const stamina = itemId === 'drainage' || itemId === 'waveBarrier' ? 4 : 2;
  if (state.stamina < stamina) return failure('stamina');
  state.inventory[itemId]--;
  if (!state.inventory[itemId]) delete state.inventory[itemId];
  state.stamina -= stamina;
  if (plots) {
    for (const plot of selected) {
      if (itemId === 'raisedBed') plot.raised = true;
      else {
        state.defenses.plots.find((entry) => entry.id === plot.id)[itemId] = true;
        if (itemId === 'drainage') plot.drainage = true;
      }
    }
  } else state.defenses[field] = true;
  spendActionTime(state, minutes);
  return { ok: true, itemId, targetIds: ids, minutes, stamina };
}

export function sellItem(state, itemId, quantity = state.inventory[itemId] || 0) {
  if (!Number.isInteger(quantity) || quantity < 1 || (state.inventory[itemId] || 0) < quantity) return failure('insufficient-stock');
  const unitPrice = SEAFOOD[itemId]?.price ?? CROPS[itemId]?.price;
  if (unitPrice === undefined && itemId !== 'legacyFish') return failure('not-sellable');
  const value = itemId === 'legacyFish' ? quantity === state.inventory.legacyFish ? state.legacyFishValue : Math.floor(state.legacyFishValue * quantity / state.inventory.legacyFish) : unitPrice * quantity;
  state.inventory[itemId] -= quantity;
  if (!state.inventory[itemId]) delete state.inventory[itemId];
  if (itemId === 'legacyFish') state.legacyFishValue -= value;
  state.gold += value;
  state.soldLifetime += value;
  fishTotals(state);
  return { ok: true, value, itemId, quantity };
}

export function submitOrder(state, orderId) {
  const order = ensureDailyOrders(state).find((entry) => entry.id === orderId);
  if (!order) return failure(state.shopLevel < 2 ? 'orders-locked' : 'order-not-found');
  if (order.completed) return failure('already-completed');
  if (order.requirements.some(({ itemId, quantity }) => (state.inventory[itemId] || 0) < quantity)) return failure('insufficient-stock');

  let baseValue = 0;
  for (const { itemId, quantity } of order.requirements) {
    state.inventory[itemId] -= quantity;
    baseValue += (SEAFOOD[itemId]?.price ?? CROPS[itemId].price) * quantity;
    if (!state.inventory[itemId]) delete state.inventory[itemId];
  }
  order.completed = true;
  state.gold += baseValue + order.bonus;
  state.soldLifetime += baseValue;
  state.ordersCompleted++;
  fishTotals(state);
  return { ok: true, orderId, baseValue, bonus: order.bonus, value: baseValue + order.bonus };
}

// Old scene entry points stay callable while it adopts the species UI.
export function fish(state, tool, now = Date.now(), random = Math.random) {
  if (tool === 'net' && !state.hasNet) return failure('no-net');
  if (tool !== 'rod' && tool !== 'net') return failure('unknown-tool');
  const last = tool === 'net' ? state.lastNetAt : state.lastRodAt;
  const cooldown = tool === 'net' ? 8000 : 2200;
  if (last > 0 && now - last < cooldown) return { ...failure('cooldown'), waitMs: cooldown - (now - last) };
  const result = catchSeafood(state, 'reefFish', tool, random);
  if (!result.ok) return result;
  if (tool === 'net') state.lastNetAt = now; else state.lastRodAt = now;
  return { ok: true, caught: result.caught, value: result.value };
}

export function sellFish(state) {
  let total = 0;
  for (const id of [...Object.keys(SEAFOOD), 'legacyFish']) if (state.inventory[id]) total += sellItem(state, id).value;
  return total;
}

export function upgradeRod(state) { return buyItem(state, `rod${state.rodLevel + 1}`).ok; }
export function buyNet(state) { return buyItem(state, 'net').ok; }
export function gather(state, resource, nodeId) {
  if (!['wood', 'shells'].includes(resource)) return failure('unknown-resource');
  const minutes = resource === 'wood' ? 30 : 15;
  const stamina = resource === 'wood' ? 4 : 2;
  if (state.stamina < stamina) return failure('stamina');
  if (nodeId && (state.gatherCooldowns[nodeId] || 0) > state.gameMinutes) return failure('depleted');
  state.stamina -= stamina;
  if (resource === 'wood') state.wood += 2;
  else state.shells += 1;
  if (nodeId) state.gatherCooldowns[nodeId] = state.gameMinutes + 360;
  spendActionTime(state, minutes);
  return { ok: true, minutes, stamina };
}
export function build(state, kind) {
  const item = BUILDINGS[kind];
  if (!item || state.built[kind] || state.wood < item.cost.wood || state.shells < item.cost.shells) return false;
  state.wood -= item.cost.wood;
  state.shells -= item.cost.shells;
  state.built[kind] = true;
  return true;
}
export function tick(state, now = Date.now()) {
  state.updatedAt = now;
  return false;
}
