import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ISLANDS, landingPoint, navigable } from '../src/voyage.js';
import { createIslandArt, animateIslandArt, islandShoreRadius, islandTerrainHeight, islandWalkPoint } from '../src/voyageArt.js';
import { islandCoastlineShaderRadius } from '../src/coastline.js';
import { createReefFish, safeReefFishPoint, stepReefFish } from '../src/reefFish.js';

const bytes = await readFile(new URL('../assets/generated/tropical-vegetation.glb', import.meta.url));
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const assets = Object.fromEntries(Object.entries({ palm: 'Palm_Source', bush: 'Bush_Source', rock: 'Rock_Source',
  coral: 'Reef_Staghorn_Source', seaGrass: 'Sea_Grass_Source', fish: 'Fish_A_Source' }).map(([key, name]) => [key, asset.scene.getObjectByName(name)]));
let rockMesh; assets.rock.traverse(o => { if (o.isMesh) rockMesh = o; });
const originalVertices = rockMesh.geometry.attributes.position.array.slice();
for (const island of ISLANDS) {
  // Evaluate the generated surf expression independently of the terrain helper.
  const shaderExpression = islandCoastlineShaderRadius('radius', 'angle', 'x', 'z', 'landingAngle')
    .replace(/\b(sin|cos|pow|max)\(/g, 'Math.$1(');
  const shaderRadius = new Function('radius', 'angle', 'x', 'z', 'landingAngle', 'clamp', 'mix', `return ${shaderExpression}`);
  const shores = [];
  for (let j = 0; j < 200; j++) {
    const angle = j / 200 * Math.PI * 2, shore = islandShoreRadius(island, angle);
    shores.push(shore);
    const surf = shaderRadius(island.radius, angle, island.x, island.z, Math.atan2(-island.x, -island.z),
      (v, a, b) => Math.max(a, Math.min(b, v)), (a, b, t) => a * (1 - t) + b * t);
    assert.ok(Math.abs(surf - shore) < 1e-9, 'surf, sand and walking share the irregular coast');
    assert.ok(Math.abs(shore - islandShoreRadius(island, angle + Math.PI * 2)) < 1e-9, 'coast wraps without a seam');
    assert.ok(shore <= island.radius, 'art never expands dry land into a navigable route');
    assert.ok(Math.abs(islandTerrainHeight(island, island.x + Math.sin(angle) * shore, island.z + Math.cos(angle) * shore)) < .0001, 'shore is at sea level');
    const walk = islandWalkPoint(island, { x: island.x + Math.sin(angle) * island.radius * 3, z: island.z + Math.cos(angle) * island.radius * 3 });
    assert.ok(islandTerrainHeight(island, walk.x, walk.z) > .12, 'new bays cannot put the walking destination under high tide');
    const restored = islandWalkPoint(island, walk);
    assert.ok(Math.hypot(restored.x - walk.x, restored.z - walk.z) < 1e-9, 'restored shore positions remain stable');
  }
  assert.ok(Math.max(...shores) - Math.min(...shores) > island.radius * .12, 'islands have visible coves rather than a circular sand ring');
  const edgePoints = Array.from({ length: 24 }, (_, j) => islandWalkPoint(island,
    { x: island.x + Math.sin(j / 24 * Math.PI * 2) * island.radius, z: island.z + Math.cos(j / 24 * Math.PI * 2) * island.radius }));
  for (const from of edgePoints) for (const to of edgePoints) for (let step = 0; step <= 12; step++) {
    const t = step / 12;
    assert.ok(islandTerrainHeight(island, from.x * (1 - t) + to.x * t, from.z * (1 - t) + to.z * t) > .12,
      'straight walks between reachable shore points never cut through a flooded bay');
  }
  const landing = landingPoint(island, true), mooring = landingPoint(island);
  assert.ok(islandTerrainHeight(island, landing.x, landing.z) > .08, 'landing remains dry even at high tide');
  assert.ok(navigable(mooring.x, mooring.z));
  assert.deepEqual(islandWalkPoint(island, landing), landing, 'the original landing position remains usable');
  for (let j = 0; j < 24; j++) {
    const angle = j / 24 * Math.PI * 2;
    assert.ok(Math.abs(islandTerrainHeight(island, island.x + Math.sin(angle) * 1.7, island.z + Math.cos(angle) * 1.4) - .9) < 1e-9,
      'resource clearing stays level and the spring surface stays above the ground');
  }
  if (island.id === 'ruins') for (const x of [-3.25, 0, 3.25]) for (const z of [-4.75, -2.55, -.35]) {
    assert.ok(Math.abs(islandTerrainHeight(island, island.x + x, island.z + z) - .9) < 1e-9, 'temple platform remains grounded across its footprint');
  }
  const art = createIslandArt({ island, assets, label: (_text, parent, x, y, z) => {
    const hint = new THREE.Object3D(); hint.position.set(x, y, z); parent.add(hint); return hint;
  } });
  art.root.updateMatrixWorld(true);
  assert.equal(art.resource.position.length(), 0, 'resource interaction coordinates are preserved');
  const geometry = art.terrain.geometry, positions = geometry.attributes.position, normals = geometry.attributes.normal;
  assert.ok(geometry.index.count / 3 < 4000, 'terrain triangle count is bounded for mobile');
  for (let j = 0; j < positions.count; j++) {
    assert.ok(Number.isFinite(positions.getY(j)));
    assert.ok(Math.abs(positions.getY(j) - islandTerrainHeight(island, island.x + positions.getX(j), island.z + positions.getZ(j))) < .00001, 'feet and rendered terrain share a height');
    assert.ok(normals.getY(j) > 0, 'terrain triangles face upward');
  }
  let calls = 0;
  art.root.traverse(object => {
    if (!object.isMesh) return;
    calls++;
    if (object.isInstancedMesh) assert.ok(object.count <= (object.name.startsWith('VoyageGrass_') ? 32 : 15), 'grass, reef and fish batches are bounded');
  });
  assert.ok(calls < 150, `bounded island draw calls after batching grass: ${calls}`);
  for (const accent of art.accents) {
    const lx = landing.x - island.x, lz = landing.z - island.z;
    const t = Math.max(0, Math.min(1, (accent.x * lx + accent.z * lz) / (lx * lx + lz * lz)));
    assert.ok(Math.hypot(accent.x - lx * t, accent.z - lz * t) > accent.radius + .65, 'main resource approach stays clear of new plants and boulders');
  }
  animateIslandArt(art, 12, .12, { x: island.x, z: island.z });
  assert.ok(art.hints.every(h => h.visible), 'nearby resource labels visible');
  animateIslandArt(art, 15, -.16, { x: 0, z: 0 });
  assert.ok(art.hints.every(h => !h.visible), 'distant labels do not clutter the ocean');
  assert.ok(Number.isFinite(art.buoy.position.y));
  const fishPort = { x: mooring.x - island.x, z: mooring.z - island.z };
  for (let j = 0; j < 12; j++) {
    const fish = createReefFish(island.radius, fishPort, j, 312 + j * 1003);
    const start = { x: fish.x, z: fish.z }, startAngle = Math.atan2(fish.z, fish.x);
    const radii = [], speeds = [], visited = new Set(); let paused = false;
    for (let frame = 0; frame < 6000; frame++) {
      const previous = { x: fish.x, z: fish.z, heading: fish.heading };
      stepReefFish(fish, .1);
      assert.ok(safeReefFishPoint(fish, fish.x, fish.z), 'fish avoid sand, landing pier and mooring');
      assert.ok(Math.hypot(fish.x - previous.x, fish.z - previous.z) < .08, 'movement is continuous, not teleporting');
      const turn = Math.atan2(Math.sin(fish.heading - previous.heading), Math.cos(fish.heading - previous.heading));
      assert.ok(Math.abs(turn) <= .090001, 'heading turns smoothly');
      const angle = Math.atan2(fish.z, fish.x) - startAngle;
      assert.ok(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < .9, 'fish never complete an island orbit');
      if (frame % 30 === 0) { radii.push(Math.hypot(fish.x, fish.z)); speeds.push(fish.speed); visited.add(`${Math.round(fish.x)},${Math.round(fish.z)}`); }
      paused ||= fish.pause > 0;
    }
    assert.ok(Math.max(...radii) - Math.min(...radii) > .8, 'fish do not follow fixed-radius circles');
    assert.ok(visited.size > 8 && paused, 'fish explore their feeding patch and occasionally pause');
    assert.ok(Math.max(...speeds) - Math.min(...speeds) > .2, 'different swimming speeds');
    const before = { x: fish.x, z: fish.z };
    stepReefFish(fish, 3600);
    assert.ok(Math.hypot(fish.x - before.x, fish.z - before.z) < .08, 'resuming cannot jump across the reef');
    assert.ok(Math.hypot(fish.x - start.x, fish.z - start.z) < 5.2);
  }
  for (const school of art.animations.filter(a => a.type === 'fish')) for (let j = 0; j < school.object.count; j++) {
    const matrix = new THREE.Matrix4(); school.object.getMatrixAt(j, matrix);
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    assert.ok(Math.hypot(p.x, p.z) > island.radius + 3, 'decorative schools cannot swim through sand');
  }
}
assert.deepEqual(rockMesh.geometry.attributes.position.array, originalVertices, 'instancing does not alter home island assets');
console.log('voyage art: shoreline, terrain grounding, art budgets, reefs and interaction coordinates passed');
