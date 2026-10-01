import assert from 'node:assert/strict';
import { ShaderLib, Matrix4, Vector3 } from 'three';
import { createSandTracks, SAND_TRACK_CAPACITY } from '../src/sandTracks.js';
import { swashContact } from '../src/coastSwash.js';
import { createSandTrackMaterial, createSandTrackVisual } from '../src/sandTrackVisual.js';

const sand = inland => (x, z) => x >= 0 && x <= 20
  ? { y: 0, normal: { x: 0, y: 1, z: 0 }, inland, runupLimit: 3.2 } : null;
const occupied = tracks => tracks.marks.filter(Boolean);
const tracks = createSandTracks({ sampleSand: sand(.55) });
tracks.follow('human', { x: 0, y: .02, z: 0 });
tracks.follow('human', { x: 1, y: .02, z: 0 });
assert.equal(occupied(tracks).length, 2, 'discrete steps, not a continuous painted line');
const marks = occupied(tracks);
assert.deepEqual(marks.map(m => m.side), [-1, 1], 'left/right steps alternate');
assert(marks[0].z > 0 && marks[1].z < 0, 'feet sit on opposite sides of the path');
assert(Math.abs(marks[0].angle - Math.PI / 2) < 1e-9, 'toes follow travel direction');
for (let frame = 0; frame < 200; frame++) tracks.follow('human', { x: 1, y: .02, z: 0 });
assert.equal(occupied(tracks).length, 2, 'standing/pivoting does not make new impressions');
tracks.follow('human', { x: 15, y: .02, z: 0 });
assert.equal(occupied(tracks).length, 2, 'teleports never connect trails');
tracks.follow('human', { x: 15.9, y: .02, z: 0 }, { enabled: false });
tracks.follow('human', { x: 16.5, y: .02, z: 0 });
assert.equal(occupied(tracks).length, 2, 'boarding, swimming, indoors and respawn are disabled');
tracks.follow('high', { x: 0, y: 2, z: 0 });
tracks.follow('high', { x: 1, y: 2, z: 0 });
assert.equal(occupied(tracks).length, 2, 'raised wood/boat feet cannot stamp the sand below');
tracks.follow('no-sand', { x: -2, y: .02, z: 0 });
tracks.follow('no-sand', { x: -1, y: .02, z: 0 });
assert.equal(occupied(tracks).length, 2, 'only the sampled sand material is eligible');

function walking(step, kind = 'human') {
  const result = createSandTracks({ sampleSand: sand(4) });
  for (let x = 0; x < 10 - 1e-9; x += step) result.follow(kind, { x, y: .02, z: 0 }, { kind, angle: kind === 'crab' ? -.6 : null });
  result.follow(kind, { x: 10, y: .02, z: 0 }, { kind, angle: kind === 'crab' ? -.6 : null });
  return result;
}
const slowFrames = walking(.01), fastFrames = walking(.11);
assert.equal(occupied(slowFrames).length, Math.floor(10 / .44));
assert.equal(occupied(slowFrames).length, occupied(fastFrames).length, 'density is distance-based, independent of FPS');
const crabs = walking(.05, 'crab');
assert.equal(occupied(crabs).length, Math.floor(10 / .16));
assert(occupied(crabs).every(mark => mark.kind === 'crab' && mark.angle === -.6), 'sideways crab keeps shell-oriented multi-leg impressions');

// Tide swash visits, not frames: first pass weakens, second weakens again,
// third pass removes all impressions after a short smooth fade.
const washed = createSandTracks({ sampleSand: sand(.55) });
washed.follow('a', { x: 0, y: .02, z: 0 });
washed.follow('a', { x: 1, y: .02, z: 0 });
let firstOpacity, secondOpacity, firstWave;
for (let tick = 1; tick <= 1200; tick++) {
  const time = tick / 60;
  washed.update(1 / 60, time);
  const mark = occupied(washed)[0];
  if (!mark) break;
  if (mark.washCount === 1) { firstOpacity = mark.opacity; firstWave ??= mark.lastWave; }
  if (mark.washCount === 2) secondOpacity = mark.opacity;
  assert(mark.washCount <= 3);
}
assert(firstOpacity < .5 && secondOpacity < firstOpacity, 'each later wave leaves a visibly weaker print');
assert.equal(occupied(washed).length, 0, 'third covering wave erases footprints');
const stable = createSandTracks({ sampleSand: sand(.4) });
stable.follow('s', { x: 0, y: .02, z: 0 }); stable.follow('s', { x: .5, y: .02, z: 0 });
const stableMark = occupied(stable)[0];
const wetTime = Array.from({ length: 100 }, (_, i) => i / 20).find(t => swashContact(stableMark.x, stableMark.z, .4, t).wet);
for (let j = 0; j < 200; j++) stable.update(.01, wetTime);
assert.equal(stableMark.washCount, 1, 'many wet frames count as one wave only');
const dry = walking(.1);
for (let j = 1; j <= 3000; j++) dry.update(.01, j * .01);
assert(occupied(dry).every(mark => mark.washCount === 0 && mark.opacity === 1), 'waves do not erase upper beach tracks beyond their actual reach');
const frozenAge = occupied(dry)[0].age; dry.update(0, 999);
assert.equal(occupied(dry)[0].age, frozenAge, 'background pause does not age cosmetic tracks');

const bounded = createSandTracks({ sampleSand: sand(4), capacity: 16 });
for (let j = 0; j <= 1000; j++) bounded.follow('b', { x: (j % 21) * .5, y: .02, z: 0 });
assert.equal(bounded.marks.length, 16, 'fixed memory/draw budget');
assert(occupied(bounded).length <= 16);
assert.equal(SAND_TRACK_CAPACITY, 640);
const visual = createSandTrackVisual(tracks); visual.sync();
assert(visual.mesh.isInstancedMesh && visual.mesh.count === SAND_TRACK_CAPACITY);
assert.equal(visual.mesh.material.depthWrite, false, 'no blocking the foam or other translucent objects');
assert.equal(visual.mesh.geometry.attributes.trackOpacity.getX(marks[0].slot), 1);
const matrix = new Matrix4(); visual.mesh.getMatrixAt(marks[0].slot, matrix);
assert(Math.abs(new Vector3().setFromMatrixPosition(matrix).y - .014) < 1e-6, 'impressions are offset just above terrain');
const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
createSandTrackMaterial().onBeforeCompile(shader);
assert(shader.vertexShader.includes('vTrackOpacity=trackOpacity'));
assert(shader.fragmentShader.includes('leg<8') && shader.fragmentShader.includes('tetrad'));
assert(shader.fragmentShader.includes('diffuseColor.a*=softened*vTrackOpacity'));
visual.mesh.geometry.dispose(); visual.mesh.material.dispose();
console.log('sand tracks: alternating feet, crab legs, sand-only placement, per-wave erosion, teleports, FPS independence and bounded draw passed');
