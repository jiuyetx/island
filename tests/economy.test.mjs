import assert from 'node:assert/strict';
import {
  CROPS, SEAFOOD, advanceGameTime, build, buyItem, buyNet, catchSeafood, eatMeal, fish,
  chopTree, ensureDailyOrders, freshState, gather, harvestCrop, installDefense, moveAllStock, normalizeState, patchAssetWithWood, plantCrop, plantTree, repairAsset, repairQuote, sellFish, tendTree, woodPatchQuote,
  sellItem, submitOrder, tick, tideAt, upgradeRod, usableCropSeed,
} from '../src/economy.js';
import { getInventoryRows, inventoryAction } from '../src/inventoryUi.js';

const nativeAbortController = globalThis.AbortController;
const nativeAbortSignal = globalThis.AbortSignal;
globalThis.AbortController = undefined;
globalThis.AbortSignal = undefined;
await import('../src/polyfills.js?test');

const state = freshState(0);
assert.equal(state.gold, 80);
assert.equal(state.inventory.sweetPotatoSeed, 4);
assert.equal(state.plots.length, 4);
assert.equal(state.built.garden, true);
assert.equal(state.storm.nextDay, 7);
gather(state, 'wood');
assert.equal(build(state, 'garden'), false);
assert.equal(state.people, 1);
tick(state, 24_000);
assert.equal(state.food, 0); // No offline income or destructive wall-clock simulation.

const resources = freshState(0);
const gatheredAt = resources.gameMinutes;
assert.equal(gather(resources, 'shells', 'shell-1').ok, true);
assert.equal(resources.stamina, 98);
assert.equal(gather(resources, 'shells', 'shell-1').reason, 'depleted');
assert.equal(normalizeState(JSON.parse(JSON.stringify(resources))).gatherCooldowns['shell-1'], gatheredAt + 360);
for (let index = 0; index < 70; index++) resources.gatherCooldowns[`marine-crab-${index}`] = gatheredAt + 360;
assert.equal(normalizeState(JSON.parse(JSON.stringify(resources))).gatherCooldowns['marine-crab-69'], gatheredAt + 360);

const boughtDefense = freshState(0);
boughtDefense.inventory.waveBarrier = 1;
boughtDefense.inventory.windNet = 1;
assert.equal(getInventoryRows(boughtDefense, 'bag').find((row) => row.id === 'waveBarrier').summary, '待安装 · 去近岸浅海');
assert.equal(inventoryAction('waveBarrier', 'bag').id, 'inventory-use:waveBarrier');
assert.equal(inventoryAction('windNet', 'bag').label, '前往田地安装防风网');
assert.equal(inventoryAction('waveBarrier', 'storage').id, 'inventory-retrieve:waveBarrier');
assert.equal(inventoryAction('sweetPotatoSeed', 'bag').id, 'inventory-use:sweetPotatoSeed');
assert.equal(inventoryAction('diveSupply', 'bag').id, 'inventory-use:diveSupply');
assert.equal(inventoryAction('shells', 'bag'), null);

const forest = freshState(0);
const treeId = forest.trees[0].id;
assert.equal(chopTree(forest, treeId).wood, 4);
assert.equal(forest.trees[0].stage, 'stump');
assert.equal(plantTree(forest, treeId).reason, 'no-seed');
assert.equal(buyItem(forest, 'palmSeed').ok, true);
assert.equal(plantTree(forest, treeId).ok, true);
assert.equal(forest.trees[0].stage, 'growing');
const ageBeforeCare = forest.trees[0].ageMinutes;
assert.equal(tendTree(forest, treeId).ok, true);
assert.ok(forest.trees[0].ageMinutes >= ageBeforeCare + 360);
assert.equal(tendTree(forest, treeId).reason, 'already-tended');
assert.equal(normalizeState(JSON.parse(JSON.stringify(forest))).trees[0].stage, 'growing');

const logistics = freshState(0);
logistics.gold = 200;
logistics.inventory = { sweetPotatoSeed: 2 };
assert.equal(moveAllStock(logistics, 'inventory', 'storage').ok, true);
assert.deepEqual(logistics.inventory, {});
assert.equal(logistics.storage.sweetPotatoSeed, 2);
assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(logistics))).protectedStorageIds, ['sweetPotatoSeed']);
const fullBag = freshState(0);
fullBag.inventory = { sweetPotatoSeed: 2 };
fullBag.storageCapacity = 1;
assert.equal(moveAllStock(fullBag, 'inventory', 'storage').reason, 'capacity');
assert.deepEqual(fullBag.inventory, { sweetPotatoSeed: 2 }); // Transfer is atomic.
logistics.dockDurability = 75;
assert.equal(repairQuote(logistics, 'dock').cost, 25);
assert.equal(repairAsset(logistics, 'dock').ok, true);
assert.equal(logistics.dockDurability, 100);
logistics.boatTier = 'wreck';
logistics.boatDurability = 40;
assert.equal(repairAsset(logistics, 'boat').ok, true);
assert.equal(logistics.boatTier, 'wood');

const stormRepair = freshState(0);
stormRepair.gold = 0;
stormRepair.dockDurability = 0;
assert.equal(woodPatchQuote(stormRepair, 'dock').wood, 2);
assert.equal(patchAssetWithWood(stormRepair, 'dock').ok, true);
assert.equal(stormRepair.dockDurability, 20);
assert.equal(stormRepair.wood, 6);
assert.equal(patchAssetWithWood(stormRepair, 'dock').ok, true);
assert.equal(stormRepair.dockDurability, 40);
assert.equal(patchAssetWithWood(stormRepair, 'dock').reason, 'above-patch-limit');
stormRepair.hutDurability = 39;
assert.equal(patchAssetWithWood(stormRepair, 'hut').points, 1);
assert.equal(stormRepair.wood, 3);
stormRepair.boatDurability = 0;
stormRepair.wood = 0;
assert.equal(patchAssetWithWood(stormRepair, 'boat').reason, 'wood');
assert.equal(stormRepair.boatDurability, 0);

const migrated = normalizeState({ gold: 31, fishCount: 2, fishValue: 37, rodLevel: 5, hasNet: true, people: 3, updatedAt: 1 }, 1000);
assert.equal(migrated.gold, 31);
assert.equal(migrated.inventory.legacyFish, 2);
assert.equal(migrated.fishValue, 37);
assert.equal(migrated.rodLevel, 3);
assert.equal(migrated.legacyRodLevel, 5);
assert.equal(migrated.hasNet, true);
assert.equal(migrated.people, 1);
assert.equal(migrated.legacyPeople, 3);
assert.equal(migrated.inventory.sweetPotatoSeed, undefined);
assert.equal(normalizeState(JSON.parse(JSON.stringify(migrated))).fishValue, 37);
assert.equal(sellItem(migrated, 'legacyFish', 1).value, 18);
assert.equal(sellItem(migrated, 'legacyFish', 1).value, 19);
assert.equal(migrated.gold, 68);

const prepared = freshState(0);
assert.equal(buyItem(prepared, 'drainage').cost, 80);
assert.equal(installDefense(prepared, 'drainage', ['plot1', 'plot2', 'plot3', 'plot4']).ok, true);
assert.equal(prepared.inventory.drainage, undefined);
assert.equal(prepared.defenses.plots.every((plot) => plot.drainage), true);
assert.equal(normalizeState(JSON.parse(JSON.stringify(prepared))).defenses.plots[0].drainage, true);
const reportSave = freshState(0);
reportSave.storm.result = { id: 1, intensity: 2, settled: true, plots: [{ plotId: 'plot1', beforeUnits: 3, lostUnits: 1, protectedUnitsExpected: 1.25 }], inventory: [], assets: { boat: { damage: 18, damagePrevented: 42, durabilityAfter: 82 } }, protectionWear: {}, totals: { itemsLost: 1, valueLost: 4, repairCost: 18, protectedUnitsExpected: 1.25, durabilitySaved: 42 } };
const restoredReport = normalizeState(JSON.parse(JSON.stringify(reportSave))).storm.result;
assert.equal(restoredReport.plots[0].protectedUnitsExpected, 1.25);
assert.equal(restoredReport.assets.boat.damagePrevented, 42);
assert.equal(restoredReport.totals.durabilitySaved, 42);

assert.equal(tideAt(0), 'low');
assert.equal(tideAt(6), 'high');
assert.equal(tideAt(14), 'rising');
assert.equal(tideAt(20), 'falling');
const planting = plantCrop(state, 'plot1', 'sweetPotato');
assert.equal(planting.ok, true);
assert.equal(state.inventory.sweetPotatoSeed, 3);
assert.equal(state.stamina, 93);
assert.equal(harvestCrop(state, 'plot1').reason, 'not-grown');
advanceGameTime(state, CROPS.sweetPotato.minutes / 2);
assert.equal(state.plots[0].crop.growthMinutes, 720);
assert.equal(harvestCrop(state, 'plot1', () => 0).quantity, 2);
assert.equal(state.inventory.sweetPotato, 2);
assert.equal(sellItem(state, 'sweetPotato', 2).value, 8);
assert.equal(buyItem(state, 'shovel2').ok, true);
const mixedSeeds = freshState(0);
mixedSeeds.inventory = { cornSeed: 2, palmSeed: 1 };
assert.equal(usableCropSeed(mixedSeeds, 'sweetPotato'), 'corn');
assert.equal(usableCropSeed(mixedSeeds, 'corn'), 'corn');
assert.equal(plantCrop(mixedSeeds, 'plot1', usableCropSeed(mixedSeeds, 'sweetPotato')).ok, true);
assert.equal(mixedSeeds.plots[0].crop.id, 'corn');
mixedSeeds.inventory = { palmSeed: 1 };
assert.equal(usableCropSeed(mixedSeeds, 'sweetPotato'), null);

const orders = freshState(0);
assert.deepEqual(ensureDailyOrders(orders), []);
orders.shopLevel = 2;
const firstOrders = ensureDailyOrders(orders);
assert.equal(firstOrders.length, 1);
assert.equal(firstOrders[0].requirements.length, 2);
assert.equal(firstOrders[0].requirements.some(({ itemId }) => itemId.endsWith('Seed')), false);
const firstOrder = firstOrders[0];
assert.equal(submitOrder(orders, firstOrder.id).reason, 'insufficient-stock');
const baseOrderValue = firstOrder.requirements.reduce((sum, { itemId, quantity }) => {
  orders.inventory[itemId] = quantity;
  return sum + quantity * (CROPS[itemId]?.price ?? 0);
}, 0);
const fishRequirement = firstOrder.requirements.find(({ itemId }) => !CROPS[itemId]);
assert.ok(fishRequirement);
const expectedOrderBase = baseOrderValue + fishRequirement.quantity * SEAFOOD[fishRequirement.itemId].price;
orders.soldLifetime = 150;
const beforeOrderGold = orders.gold;
assert.deepEqual(submitOrder(orders, firstOrder.id), {
  ok: true, orderId: firstOrder.id, baseValue: expectedOrderBase, bonus: 10, value: expectedOrderBase + 10,
});
assert.equal(orders.gold, beforeOrderGold + expectedOrderBase + 10);
assert.equal(orders.soldLifetime, 150 + expectedOrderBase);
assert.equal(orders.ordersCompleted, 1);
assert.equal(submitOrder(orders, firstOrder.id).reason, 'already-completed');
assert.equal(normalizeState(JSON.parse(JSON.stringify(orders))).orderBoard.offers[0].completed, true);
orders.ordersCompleted = 5;
orders.gold = 1000;
assert.equal(buyItem(orders, 'shop3').ok, true);
assert.equal(ensureDailyOrders(orders).length, 2);
assert.equal(ensureDailyOrders(orders)[0].completed, true);
advanceGameTime(orders, 720); // A new game day refreshes the board at 06:00.
assert.equal(orders.orderBoard.dayId, orders.dayId);
assert.equal(orders.orderBoard.offers.length, 2);
assert.equal(orders.orderBoard.offers.every((order) => !order.completed), true);

const fishing = freshState(0);
assert.equal(fish(fishing, 'net', 1000).reason, 'no-net');
assert.equal(catchSeafood(fishing, 'crab', 'hand', () => 0).caught, 1);
const wreckedFishing = freshState(0);
wreckedFishing.boatTier = 'wreck';
wreckedFishing.rodLevel = 2;
assert.equal(catchSeafood(wreckedFishing, 'silverJack', 'rod', () => 0).reason, 'boat-level');
const result = catchSeafood(fishing, 'reefFish', 'rod', () => 0);
assert.equal(result.caught, 1);
assert.equal(result.value, 18);
assert.equal(result.minutes, 15); // Fishing interaction must not skip an additional in-game hour.
assert.equal(fishing.stamina, 88);
assert.equal(fishing.ecology.reefFish, 11);
assert.equal(sellFish(fishing), 24);
assert.equal(upgradeRod(fishing), true);
assert.equal(fishing.rodLevel, 2);
assert.equal(buyNet(fishing), false); // 64 gold remain after rod upgrade.
fishing.gold += 6;
assert.equal(buyNet(fishing), true);
assert.equal(fish(fishing, 'net', 1000, () => 0).caught, 2);
assert.equal(fishing.netUsesDay, 1);
assert.equal(fishing.fishValue, 36);
assert.equal(sellFish(fishing), 36);
advanceGameTime(fishing, 720);
assert.equal(fishing.dayId, 2);
assert.equal(fishing.stamina, 76); // Dawn no longer restores stamina without food and rest.
assert.equal(fishing.netUsesDay, 0);

const hungry = freshState(0);
hungry.satiety = 10;
hungry.inventory.sweetPotato = 1;
assert.equal(eatMeal(hungry, 'sweetPotato').ok, true);
assert.equal(hungry.satiety, 42);
assert.equal(hungry.inventory.sweetPotato, undefined);

const controller = new AbortController();
let aborted = false;
controller.signal.addEventListener('abort', () => { aborted = true; });
controller.abort();
assert.equal(aborted, true);
globalThis.AbortController = nativeAbortController;
globalThis.AbortSignal = nativeAbortSignal;
console.log('economy check passed');
