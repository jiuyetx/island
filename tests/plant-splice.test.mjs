import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'island-plant-splice-'));
try {
  const target = join(directory, 'pack.glb');
  await copyFile('artifacts/plants-review/meshes/vegetation-before-plants.glb', target);
  const exportPlants = () => execFileSync(process.execPath, [
    'tools/replace-glb-plants.mjs', target, 'artifacts/plants-review/meshes/approved-plants.glb',
  ]);
  exportPlants();
  const first = await readFile(target);
  exportPlants();
  assert.deepEqual(await readFile(target), first, 'repeated export must be byte-identical with no accumulated geometry');
  const jsonLength = first.readUInt32LE(12);
  const gltf = JSON.parse(first.subarray(20, 20 + jsonLength).toString());
  for (const name of ['Palm_Source', 'Bush_Source']) {
    assert.equal(gltf.nodes.filter(node => node.name === name).length, 1, 'no duplicate source roots');
  }
  console.log('plant splice: idempotent payload and unique source roots');
} finally {
  await rm(directory, { recursive: true });
}
