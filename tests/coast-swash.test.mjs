import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ShaderLib } from 'three';
import { swashCycle, COAST_SWASH_GLSL } from '../src/coastSwash.js';
import { createBeachMaterial } from '../src/beachMaterial.js';
import { ISLANDS } from '../src/voyage.js';
import { createIslandTerrain } from '../src/voyageArt.js';
import { coastlineRadius, islandCoastlineShaderRadius } from '../src/coastline.js';

const start = swashCycle(0), crest = swashCycle(start.period * .32);
assert(start.front < 0 && crest.front > 1.5, 'foam must travel from water onto the beach');
assert(swashCycle(start.period * .55).front < crest.front, 'wave recedes instead of staying as a static ring');
assert(swashCycle(start.period * .9).front < 0, 'water returns seaward before the next wave');
assert(swashCycle(start.period * .25).pulse > .8, 'runup is relatively quick');
assert(swashCycle(start.period * .65).pulse > .5, 'backwash is slower than runup');
assert(swashCycle(0, 0, 1).period < start.period, 'storm surf arrives more often');
assert(swashCycle(0, 0, 1).maxFront > start.maxFront, 'storm surf travels farther inland');
assert(swashCycle(0, 0, 0, 1).maxFront > swashCycle(0, 0, 0, -1).maxFront, 'high tide reaches higher sand');
for (const storm of [0, .5, 1]) for (const tide of [-1, 0, 1]) {
  for (let j = 0; j < 1000; j++) {
    const sample = swashCycle(j * .033, .13, storm, tide);
    assert(Number.isFinite(sample.front));
    assert(sample.front >= -.65 && sample.front <= sample.maxFront + 1e-9);
  }
}
assert(Math.abs(swashCycle(start.period - .00001).front - start.front) < .000001, 'cycle reset cannot pop the front');
assert(Math.abs(swashCycle(13, .3).front - swashCycle(13 + start.period * 5, .3).front) < 1e-9);
// Even narrow home bays retain a dry upper beach. No mesh/physics displacement.
for (let j = 0; j < 100; j++) assert(coastlineRadius(j * Math.PI / 50) - 3.2 > 8.5);

const shared = { uTime: { value: 10 }, uTide: { value: .5 }, uStorm: { value: 0 } };
const compile = material => {
  const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
};
const shader = compile(createBeachMaterial(shared));
assert.equal(shader.uniforms.uSwashTime, shared.uTime, 'sea and sand share visual time, not game minutes');
assert.equal(shader.uniforms.uSwashTide, shared.uTide);
assert.equal(shader.uniforms.uSwashStorm, shared.uStorm);
shared.uTime.value = 21;
assert.equal(shader.uniforms.uSwashTime.value, 21, 'compiled terrain updates without rebuilding materials');
assert(shader.fragmentShader.includes(COAST_SWASH_GLSL));
assert(shader.fragmentShader.includes('roughnessFactor=mix(roughnessFactor,.30,beachSwash.x)'));
assert(shader.fragmentShader.includes('beachSwash.z*.76'), 'retreat leaves damp sand');
assert(shader.fragmentShader.includes('beachSwash.y*.92'), 'foam is drawn on the sloped sand');
assert(shader.fragmentShader.includes('brokenLip'), 'foam lip has gaps instead of a solid white island outline');
assert(!shader.vertexShader.includes('transformed.y+='), 'no change to walking terrain');
for (const island of ISLANDS) {
  const terrain = createIslandTerrain(island, shared);
  const remoteShader = compile(terrain.material);
  assert.equal(remoteShader.uniforms.uSwashTime, shared.uTime);
  assert(remoteShader.fragmentShader.includes(`vec2(${island.x.toFixed(6)},${island.z.toFixed(6)})`), 'shore uses each island local origin');
  assert(remoteShader.fragmentShader.includes('float beachMask=1.-smoothstep('), 'swash cannot flood grass');
  const sample = swashCycle(2, 0, 1, 1, Math.min(3.2, island.radius * .22));
  assert(sample.maxFront < island.radius * .22, 'small island swash is bounded');
  terrain.geometry.dispose(); terrain.material.dispose();
}
assert(!islandCoastlineShaderRadius('7', 'angle', '-4', '-5').includes('--'));
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert(main.includes('${COAST_SWASH_GLSL}'), 'ocean uses the same swash helper');
assert(main.includes('createBeachMaterial(water.material.uniforms)'));
assert(COAST_SWASH_GLSL.includes('worldP.x*.18') && !COAST_SWASH_GLSL.includes('atan('), 'phase has no angle seam');
assert(!/\bfloat\s+(active|input|output|filter)\b/.test(COAST_SWASH_GLSL), 'avoid reserved GLSL names');
console.log('coast swash: shoreward runup, slow backwash, wet sand, storms and shared island clocks passed');
