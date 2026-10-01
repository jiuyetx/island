import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { applyFoliageAtlas, createFoliageMaterial } from '../src/foliageMaterial.js';

const uniforms = [], atlas = new Texture();
const plain = new MeshStandardMaterial();
const legacy = createFoliageMaterial(uniforms, atlas);
const authored = createFoliageMaterial(uniforms);
assert.equal(authored.map, null, 'do not double-tint authored palette with atlas');
assert.equal(legacy.map, atlas, 'legacy seagrass/kelp retains its atlas');
const root = new Group();
for (const [name, isAuthored] of [['Palm', true], ['Bush', true], ['Sea_Grass', false], ['Fish_A', false]]) {
  const mesh = new Mesh(new BoxGeometry(), plain);
  mesh.name = name; mesh.userData.authoredPlant = isAuthored; root.add(mesh);
}
applyFoliageAtlas(root, plain, legacy, authored);
assert.equal(root.getObjectByName('Palm').material, authored);
assert.equal(root.getObjectByName('Bush').material, authored);
assert.equal(root.getObjectByName('Sea_Grass').material, legacy);
assert.equal(root.getObjectByName('Fish_A').material, plain);
const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
authored.onBeforeCompile(shader);
assert.equal(uniforms.length, 1);
uniforms[0].strength.value = 1.4;
assert.equal(shader.uniforms.uWindStrength.value, 1.4, 'storm wind remains live');
assert.match(shader.vertexShader, /leafHeight=max\(position.y,0.0\)/);
assert.equal(root.getObjectByName('Palm').clone().material, authored, 'tree stages share material');
console.log('foliage material check passed');
