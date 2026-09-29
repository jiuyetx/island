import assert from 'node:assert/strict';
import { stormStatus, summarizeStormReport, updateStorm } from '../src/storm.js';

const minutes = (day, hour = 0) => (day - 1) * 1440 + hour * 60;

const baseState = (overrides = {}) => ({
  gameMinutes: minutes(5),
  plots: [{ id: 'p1', crop: { expectedUnits: 10, valuePerUnit: 6 }, windNet: true, drainage: true }],
  inventory: [{ id: 'fish-1', kind: 'fish', quantity: 20, valuePerUnit: 10 }],
  storage: { protectedCapacity: 40, protectedItemIds: ['fish-1'] },
  defenses: { anchor: true, waterproofCabinet: true, waveBarrier: true, shutters: true },
  boatTier: 2, boatDurability: 100, boatMoored: true,
  dockLevel: 1, dockDurability: 100, hutLevel: 1, hutDurability: 100,
  storm: { id: 'storm-7', seed: 12345, intensity: 3, impactAt: minutes(7, 12) },
  ...overrides,
});

// Calm -> warning -> preparation -> impact -> one settlement at 16:00.
const phases = baseState();
assert.equal(stormStatus(phases).stage, 'calm');
phases.gameMinutes = minutes(5, 12);
assert.equal(updateStorm(phases).stage, 'warning');
phases.gameMinutes = minutes(7, 6);
assert.equal(updateStorm(phases).stage, 'preparation');
phases.gameMinutes = minutes(7, 12);
assert.equal(updateStorm(phases).stage, 'impact');
assert.equal(phases.storm.settledId, undefined);
phases.gameMinutes = minutes(7, 16);
const settled = updateStorm(phases);
assert.equal(settled.stage, 'settled');
assert.equal(settled.report.id, 'storm-7');
assert.equal(phases.storm.settledId, 'storm-7');
assert.ok(settled.report.plots[0].lossRate < .35);
assert.equal(phases.plots[0].crop.expectedUnits + settled.report.plots[0].lostUnits, 10);
assert.equal(settled.report.assets.boat.damage, 27);
assert.equal(settled.report.assets.dock.damage, 30);
assert.equal(settled.report.assets.hut.damage, 24);
assert.equal(phases.boatDurability, 73);
assert.equal(phases.dockDurability, 70);
assert.equal(phases.hutDurability, 76);
assert.equal(phases.defenses.anchor, 80);
assert.equal(phases.defenses.waterproofCabinet, 80);
const summary = summarizeStormReport(settled.report);
assert.equal(summary.plots.unitsLost, settled.report.plots.reduce((sum, row) => sum + row.lostUnits, 0));
assert.equal(summary.inventory.valueLost, settled.report.inventory.reduce((sum, row) => sum + row.valueLost, 0));
assert.equal(summary.assets.boat.durabilityAfter, 73);
assert.equal(summary.assets.boat.damagePrevented, 63);
assert.equal(summary.totals.durabilitySaved, 144);
assert.ok(summary.totals.protectedUnitsExpected > 0);
assert.equal(summary.protections.length, 4);

// Calling again is idempotent: no repeated inventory/crop loss or durability damage.
const afterFirst = JSON.stringify(phases);
const repeated = updateStorm(phases);
assert.equal(JSON.stringify(phases), afterFirst);
assert.equal(repeated.report, null);
assert.equal(stormStatus(phases).report.id, 'storm-7');

// Missing defense/state sections are safe; deterministic seed and stable stack IDs give same result.
const makeUnprotected = () => ({
  gameMinutes: minutes(7, 16),
  inventory: [{ id: 'a', kind: 'shell', quantity: 7 }, { id: 'b', kind: 'shell', quantity: 7 }],
  plots: [{ id: 'field', crop: { units: 5 } }],
  boatTier: 3, boatDurability: 60, dockLevel: 2, dockDurability: 50, hutLevel: 1, hutDurability: 50,
  storm: { id: 'fixed-id', intensity: 3, impactAt: minutes(7, 12) },
});
const first = makeUnprotected();
const second = makeUnprotected();
const reportA = updateStorm(first).report;
const reportB = updateStorm(second).report;
assert.deepEqual(reportA, reportB);
assert.equal(first.storm.seed, second.storm.seed);
assert.equal(first.boatTier, 2); // At most one tier lost in one event.
assert.equal(first.boatDurability, 40);
assert.equal(first.dockLevel, 1);
assert.equal(first.dockDurability, 40);
assert.equal(first.hutWrecked, true);
assert.equal(first.hutDurability, 0);
assert.equal(reportA.plots[0].beforeUnits, 5);
assert.equal(reportA.plots[0].lostUnits + first.plots[0].crop.units, 5);

// Economy's itemId -> integer maps retain IDs, price losses, cabinet selection, and protected currencies/tools.
const mapped = {
  gameMinutes: minutes(7, 16),
  inventory: { crab: 8, tomato: 6, legacyFish: 4, gold: 500, rodLevel: 3, anchor: 1 },
  storage: { pumpkin: 4, gold: 900 },
  storageCapacity: 40,
  storageProtectedIds: ['pumpkin'],
  legacyFishValue: 80,
  defenses: { plots: [], anchor: false, waterproofCabinet: true, waveBarrier: false, shutters: false },
  storm: { id: 9, seed: 9001, intensity: 3, impactAt: minutes(7, 12) },
};
const mappedResult = updateStorm(mapped).report;
assert.equal(mapped.inventory.gold, 500);
assert.equal(mapped.inventory.rodLevel, 3);
assert.equal(mapped.storage.gold, 900);
assert.ok(mappedResult.inventory.some((row) => row.itemId === 'crab' && row.valueLost === row.lost * 6));
assert.ok(mappedResult.inventory.some((row) => row.itemId === 'tomato' && row.valueLost === row.lost * 6));
assert.equal(mapped.legacyFishValue, 80 - mappedResult.inventory.find((row) => row.itemId === 'legacyFish').valueLost);
assert.equal(mappedResult.inventory.find((row) => row.itemId === 'pumpkin').lossRate, .1);
assert.equal(mapped.boatTier, undefined);

// The normalized plot-defense record is authoritative over the crop's legacy drainage flag.
const wornPlotDefense = {
  gameMinutes: minutes(7, 16),
  plots: [{ id: 'p1', drainage: true, crop: { id: 'tomato', expectedUnits: 20 } }],
  defenses: { plots: [{ id: 'p1', windNet: false, drainage: 0 }], anchor: false },
  storm: { id: 11, seed: 11, intensity: 3, impactAt: minutes(7, 12) },
};
const wornReport = updateStorm(wornPlotDefense).report;
assert.equal(wornReport.plots[0].drainageProtected, false);
assert.equal(wornReport.plots[0].lossRate, .78);

const fastBoat = {
  gameMinutes: minutes(7, 16), boatTier: 'speed', boatDurability: 60,
  storm: { id: 10, seed: 10, intensity: 3, impactAt: minutes(7, 12) },
};
updateStorm(fastBoat);
assert.equal(fastBoat.boatTier, 'iron');
assert.equal(fastBoat.boatDurability, 40);
assert.equal(fastBoat.storm.result.assets.boat.repairCost, 120);

const wreckedBoat = {
  gameMinutes: minutes(7, 16), boatTier: 'wood', boatDurability: 10,
  storm: { id: 12, seed: 12, intensity: 3, impactAt: minutes(7, 12) },
};
updateStorm(wreckedBoat);
assert.equal(wreckedBoat.boatTier, 'wreck');
assert.equal(wreckedBoat.boatDurability, 40);

// Closing the door after physically entering is required; open doors and
// outdoor time both count as storm exposure, while a closed shelter does not.
const impactAt = minutes(7, 12);
const sheltered = baseState({ gameMinutes: impactAt, stamina: 100,
  shelter: { inside: false, doorOpen: false, exposureMinutes: 0, lastCheckedMinutes: impactAt } });
updateStorm(sheltered);
sheltered.gameMinutes = impactAt + 80;
updateStorm(sheltered);
assert.equal(sheltered.shelter.exposureMinutes, 80);
sheltered.shelter.inside = true;
sheltered.shelter.doorOpen = true;
sheltered.gameMinutes = impactAt + 120;
updateStorm(sheltered);
assert.equal(sheltered.shelter.exposureMinutes, 120);
sheltered.shelter.doorOpen = false;
sheltered.gameMinutes = impactAt + 240;
const shelterReport = updateStorm(sheltered).report;
assert.equal(shelterReport.shelter.exposureMinutes, 120);
assert.equal(shelterReport.shelter.staminaLost, 15);
assert.equal(sheltered.stamina, 85);

console.log('storm check passed');
