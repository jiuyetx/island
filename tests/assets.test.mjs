import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { groundPlacements } from '../src/terrain.js';
import { BOAT_MESH_ORIGIN, BOAT_MOOR, boatFloatOffset } from '../src/boat.js';

async function load(file) {
  const bytes = await readFile(new URL(`../assets/generated/${file}`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

const [island, vegetation, buildings, avatar] = await Promise.all([
  load('tropical-island.glb'), load('tropical-vegetation.glb'), load('tropical-buildings.glb'), load('tropical-avatar.glb'),
]);
const coastline = JSON.parse(await readFile(new URL('../assets/coastline.json', import.meta.url), 'utf8'));

for (const name of ['Island', 'HeroHut', 'Boat']) assert.ok(island.scene.getObjectByName(name), name);
for (const name of ['Palm_Source', 'Coral_Source', 'Bush_Source', 'Rock_Source']) assert.ok(vegetation.scene.getObjectByName(name), name);
for (const name of ['Fish_A_Source', 'Sea_Crab_Source', 'Sea_SilverJack_Source', 'Sea_Lobster_Source', 'Sea_PearlOyster_Source', 'Bird_A_Source']) {
  assert.ok(vegetation.scene.getObjectByName(name), name);
}
for (const name of ['Hut_Source', 'Garden_Source', 'Dock_Source']) assert.ok(buildings.scene.getObjectByName(name), name);
const hutDoor = buildings.scene.getObjectByName('Hut_Source').getObjectByName('Hut_Door');
assert.ok(hutDoor?.isMesh, 'door leaf must stay a separate, hingeable mesh');
assert.ok(hutDoor.parent?.name === 'Hut_Source', 'door leaf must not be merged into hut wall');
for (const name of ['Avatar_Root', 'Avatar_Body', 'Avatar_Arm_L', 'Avatar_Arm_R', 'Avatar_Leg_L', 'Avatar_Leg_R', 'Avatar_ToolGrip']) {
  assert.ok(avatar.scene.getObjectByName(name), `avatar pivot: ${name}`);
}

function triangleCount(root) {
  let total = 0;
  root.traverse((object) => {
    if (object.isMesh) total += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  return total;
}
const palmTriangles = triangleCount(vegetation.scene.getObjectByName('Palm_Source'));
assert.ok(palmTriangles >= 1200 && palmTriangles <= 2500, `palm triangles: ${palmTriangles}`);
for (const name of ['Fish_A_Source', 'Fish_B_Source', 'Sea_SilverJack_Source']) {
  const triangles = triangleCount(vegetation.scene.getObjectByName(name));
  assert.ok(triangles >= 150 && triangles <= 350, `${name} triangles: ${triangles}`);
}
const avatarTriangles = triangleCount(avatar.scene);
assert.ok(avatarTriangles >= 1000 && avatarTriangles <= 5200, `avatar triangles: ${avatarTriangles}`);

for (const scene of [island.scene, vegetation.scene, buildings.scene]) scene.traverse((object) => {
  if (!object.isMesh) return;
  assert.ok(object.geometry.attributes.uv, `${object.name} UV`);
  assert.ok(object.geometry.attributes.color, `${object.name} AO`);
});

island.scene.updateMatrixWorld(true);
const shoreMesh = island.scene.getObjectByName('Island_Sand');
assert.ok(shoreMesh, 'merged island shoreline mesh');
const positions = shoreMesh.geometry.attributes.position;
let shorelineSamples = 0;
let maxShoreError = 0;
for (let i = 0; i < positions.count; i++) {
  const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(shoreMesh.matrixWorld);
  const angle = Math.atan2(-point.z, point.x);
  const expected = coastline.shoreRadius * (1 + coastline.radialHarmonics.reduce((sum, term) =>
    sum + term.amplitude * Math.sin(angle * term.frequency + term.phase), 0));
  const error = Math.abs(Math.hypot(point.x, point.z) - expected);
  if (error < .01) shorelineSamples++;
  maxShoreError = Math.max(maxShoreError, error < .01 ? error : 0);
}
assert.ok(shorelineSamples >= coastline.segments, `shoreline match samples: ${shorelineSamples}`);
assert.ok(maxShoreError < .01, `shoreline error: ${maxShoreError}`);

const boatMesh = island.scene.getObjectByName('Boat');
const boatPositions = boatMesh.geometry.attributes.position;
const boatWorld = new Vector3();
let mooringShoreClearance = Infinity;
let keelY = Infinity;
for (let i = 0; i < boatPositions.count; i++) {
  boatWorld.fromBufferAttribute(boatPositions, i).applyMatrix4(boatMesh.matrixWorld);
  keelY = Math.min(keelY, boatWorld.y);
  const x = boatWorld.x + BOAT_MOOR.x - BOAT_MESH_ORIGIN.x;
  const z = boatWorld.z + BOAT_MOOR.z - BOAT_MESH_ORIGIN.z;
  const angle = Math.atan2(-z, x);
  const shore = coastline.shoreRadius * (1 + coastline.radialHarmonics.reduce((sum, term) =>
    sum + term.amplitude * Math.sin(angle * term.frequency + term.phase), 0));
  mooringShoreClearance = Math.min(mooringShoreClearance, Math.hypot(x, z) - shore);
}
assert.ok(mooringShoreClearance > 0, `boat clips dry beach: ${mooringShoreClearance.toFixed(2)} m`);
for (const waterY of [-.16, .12]) for (const time of [0, 1.12, 3.36]) {
  const draft = keelY + boatFloatOffset(waterY, time) - waterY;
  assert.ok(draft > -.03 && draft < .07, `boat draft ${draft.toFixed(3)} at tide ${waterY}`);
}
const centredBoat = boatMesh.geometry.clone().translate(-BOAT_MESH_ORIGIN.x, -BOAT_MESH_ORIGIN.y, -BOAT_MESH_ORIGIN.z);
centredBoat.computeBoundingBox();
assert.ok(centredBoat.boundingBox.min.x < -1 && centredBoat.boundingBox.max.x > 1, 'boat pivots around its hull');
centredBoat.dispose();

const terrainMeshes = ['Island_Grass', 'Island_Sand', 'Island_Underwater']
  .map((name) => island.scene.getObjectByName(name));
assert.ok(terrainMeshes.every(Boolean), 'terrain shell meshes');
terrainMeshes.forEach((mesh) => { mesh.material.side = DoubleSide; });
const seabed = new Mesh(new CircleGeometry(64, 80), new MeshBasicMaterial({ side: DoubleSide }));
seabed.rotation.x = -Math.PI / 2;
seabed.position.y = -1.7;
seabed.updateMatrixWorld(true);
terrainMeshes.push(seabed);
const down = new Vector3(0, -1, 0);
const raycaster = new Raycaster();
for (const radius of [1, 6, 8.7, 11, 12.4, 14.1, 15.4, 16.8, 18.6]) {
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16 + .037;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    for (const name of ['Palm_Source', 'Bush_Source', 'Rock_Source', 'Coral_Source']) {
      const source = vegetation.scene.getObjectByName(name);
      const [px, py, pz, size] = groundPlacements(source, [[x, 0, z, .8]], terrainMeshes)[0];
      const bottom = new Box3().setFromObject(source).min.y;
      raycaster.set(new Vector3(px, 10, pz), down);
      const [hit] = raycaster.intersectObjects(terrainMeshes, false);
      assert.ok(hit, `terrain surface at ${radius.toFixed(1)} / ${i}`);
      assert.ok(Math.abs(py + bottom * size - hit.point.y) < .005,
        `${name} contact at ${radius.toFixed(1)} / ${i}`);
    }
  }
}

console.log('asset check passed');
