import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ISLANDS, landingPoint, navigable } from '../src/voyage.js';
import { createIslandArt, animateIslandArt, islandShoreRadius, islandTerrainHeight } from '../src/voyageArt.js';
import { createReefFish, safeReefFishPoint, stepReefFish } from '../src/reefFish.js';

const bytes = await readFile(new URL('../assets/generated/tropical-vegetation.glb', import.meta.url));
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const assets = Object.fromEntries(Object.entries({ palm: 'Palm_Source', bush: 'Bush_Source', rock: 'Rock_Source',
  coral: 'Reef_Staghorn_Source', seaGrass: 'Sea_Grass_Source', fish: 'Fish_A_Source' }).map(([key, name]) => [key, asset.scene.getObjectByName(name)]));
let rockMesh; assets.rock.traverse(o => { if (o.isMesh) rockMesh = o; });
const originalVertices = rockMesh.geometry.attributes.position.array.slice();
for (const island of ISLANDS) {
  for (let j = 0; j < 200; j++) {
    const angle = j / 200 * Math.PI * 2, shore = islandShoreRadius(island, angle);
    assert.ok(shore <= island.radius, 'art never expands dry land into a navigable route');
    assert.ok(Math.abs(islandTerrainHeight(island, island.x + Math.sin(angle) * shore, island.z + Math.cos(angle) * shore)) < .0001, 'shore is at sea level');
  }
  const landing = landingPoint(island, true), mooring = landingPoint(island);
  assert.ok(islandTerrainHeight(island, landing.x, landing.z) > .08, 'landing remains dry even at high tide');
  assert.ok(navigable(mooring.x, mooring.z));
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
    if (object.isInstancedMesh) assert.ok(object.count <= 15, 'reef/fish batch is bounded');
  });
  assert.ok(calls < 230, `bounded island draw calls: ${calls}`);
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
