// Splice the approved plant GLB into the existing pack without Blender
// round-tripping any unrelated geometry, UVs, normals or AO colours.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [assetPath, plantsPath] = process.argv.slice(2);
assert.ok(assetPath && plantsPath, 'pack path and approved plant path required');
function decode(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  const jsonLength = bytes.readUInt32LE(12), binaryStart = 20 + jsonLength;
  return { json: JSON.parse(bytes.subarray(20, binaryStart).toString()),
    binary: bytes.subarray(binaryStart + 8, binaryStart + 8 + bytes.readUInt32LE(binaryStart)) };
}
const original = decode(await readFile(assetPath)), plants = decode(await readFile(plantsPath));
const a = original.json, b = plants.json;
assert.equal(a.buffers.length, 1); assert.equal(b.buffers.length, 1);
assert.ok(!b.materials?.length && !b.images?.length && !b.skins?.length, 'geometry/colour only plants');
const arrays = ['nodes', 'meshes', 'accessors', 'bufferViews'];
const names = ['Palm_Source', 'Bush_Source'];
const previous = a.extras?.islandPlantSplice;
let originalBinary = original.binary;
// Repeated exports replace the previous appended payload, not append forever.
// Refuse to truncate if another tool has subsequently extended the pack.
if (previous) {
  for (const key of arrays) assert.equal(a[key].length, previous.output[key], `pack changed after plant splice: ${key}`);
  assert.equal(a.buffers[0].byteLength, previous.output.byteLength, 'pack buffer changed after plant splice');
  for (const key of arrays) a[key].length = previous.base[key];
  for (const [index, node] of previous.roots) a.nodes[index] = node;
  originalBinary = originalBinary.subarray(0, previous.base.byteLength);
}
const base = Object.fromEntries(arrays.map(key => [key, a[key].length]));
base.byteLength = originalBinary.length;
const roots = names.map(name => {
  const index = a.nodes.findIndex(node => node.name === name);
  assert.ok(index >= 0, `existing source ${name}`);
  return [index, structuredClone(a.nodes[index])];
});
const offset = Math.ceil(originalBinary.length / 4) * 4;
const viewOffset = a.bufferViews.length, accessorOffset = a.accessors.length;
const meshOffset = a.meshes.length, nodeOffset = a.nodes.length;
const nodeMap = new Map();
let appendedNodes = 0;
for (const [index, node] of b.nodes.entries()) {
  const source = names.indexOf(node.name);
  nodeMap.set(index, source >= 0 ? roots[source][0] : nodeOffset + appendedNodes++);
}
for (const view of b.bufferViews) a.bufferViews.push({ ...view, buffer: 0, byteOffset: offset + (view.byteOffset || 0) });
for (const accessor of b.accessors) {
  assert.ok(!accessor.sparse, 'dense authored vertex data required');
  a.accessors.push({ ...accessor, bufferView: accessor.bufferView + viewOffset });
}
for (const mesh of b.meshes) a.meshes.push({ ...mesh, primitives: mesh.primitives.map(primitive => ({
  ...primitive, indices: primitive.indices + accessorOffset,
  attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, index + accessorOffset])),
})) });
for (const [index, node] of b.nodes.entries()) a.nodes[nodeMap.get(index)] = { ...node,
  ...(node.mesh === undefined ? {} : { mesh: node.mesh + meshOffset }),
  ...(node.children ? { children: node.children.map(child => nodeMap.get(child)) } : {}),
};
for (const name of names) {
  const newIndex = b.nodes.findIndex(node => node.name === name);
  assert.ok(newIndex >= 0, `required source ${name}`);
  assert.equal(b.nodes[newIndex].extras.authoredPlant, true);
}
const binary = Buffer.alloc(offset + plants.binary.length);
originalBinary.copy(binary); plants.binary.copy(binary, offset);
a.buffers[0].byteLength = binary.length;
const output = Object.fromEntries(arrays.map(key => [key, a[key].length]));
output.byteLength = binary.length;
a.extras = { ...a.extras, islandPlantSplice: { base, roots, output } };
const json = Buffer.from(JSON.stringify(a));
const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(jsonPadded);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8);
header.writeUInt32LE(jsonPadded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(assetPath, Buffer.concat([header, jsonPadded, binHeader, binary]));
console.log('Replaced two plant sources; existing non-plant buffer ranges preserved byte-for-byte');
