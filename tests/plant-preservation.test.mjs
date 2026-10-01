import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function load(path) {
  const data = await readFile(new URL(path, import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}
const [before, after] = await Promise.all([
  load('../artifacts/plants-review/meshes/vegetation-before-plants.glb'),
  load('../assets/generated/tropical-vegetation.glb'),
]);
// Compare actual world-space vertices, UVs, colours, and triangle multiplicity.
// Import/export may reorder vertices, so source index identity is not meaningful.
function samples(root) {
  root.updateWorldMatrix(true, true);
  const points = [], point = new Vector3();
  root.traverse(object => {
    if (!object.isMesh) return;
    const { geometry } = object, { position, uv, color } = geometry.attributes;
    const count = geometry.index?.count ?? position.count;
    for (let i = 0; i < count; i++) {
      const v = geometry.index ? geometry.index.getX(i) : i;
      point.fromBufferAttribute(position, v).applyMatrix4(object.matrixWorld);
      points.push([point.x, point.y, point.z, uv.getX(v), uv.getY(v), color.getX(v), color.getY(v), color.getZ(v)]
        .map(value => Math.round(value * 10000)).join(','));
    }
  });
  return points.sort();
}
let preserved = 0;
for (const source of before.scene.children) {
  if (source.name === 'Palm_Source' || source.name === 'Bush_Source') continue;
  const updated = after.scene.getObjectByName(source.name);
  assert.ok(updated, `preserved source ${source.name}`);
  assert.deepEqual(samples(updated), samples(source), `unchanged geometry/palette ${source.name}`);
  preserved++;
}
assert.ok(preserved >= 19, 'all reef, creature and rock families retained');
console.log(`plant replacement: ${preserved} non-plant sources preserved`);
