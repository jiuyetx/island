import assert from 'node:assert/strict';
import { coastlineBandRadius, coastlineRadius, coastlineShaderRadius } from '../src/coastline.js';
import { createBeachMaterial } from '../src/beachMaterial.js';
import { shoreRadiusAt } from '../src/seaEcology.js';

const widths = [];
for (let i = 0; i < 512; i++) {
  const angle = i * Math.PI * 2 / 512;
  const radius = coastlineRadius(angle);
  assert(radius > 11 && radius < 19, 'coves preserve the dry core and swimming reach');
  assert(Math.abs(radius - coastlineRadius(angle + Math.PI * 2)) < 1e-9, 'no seam at angle wrap');
  assert(Math.abs(radius - shoreRadiusAt(Math.cos(angle), -Math.sin(angle))) < 1e-9);
  widths.push(radius - coastlineBandRadius(angle, 10.5));
  let previous = coastlineBandRadius(angle, 10.5);
  for (const band of [10.85, 11.2, 11.6, 12, 12.4, 12.8, 13.2, 13.55, 13.85, 14.15, 14.4, 14.7]) {
    const next = coastlineBandRadius(angle, band);
    assert(next > previous, 'dunes and coves cannot fold over or invert beach geometry');
    previous = next;
  }
}
assert(Math.min(...widths) > 2, 'even narrow coves retain a walkable sand strip');
assert(Math.max(...widths) - Math.min(...widths) > 2, 'sand width must not be a uniform ring');
const glsl = coastlineShaderRadius('beachAngle');
assert(!glsl.includes('--'), 'negative feature angles must not create GLSL decrement tokens');
assert(glsl.includes('exp(') && glsl.includes('atan(sin('), 'localized bays also drive water/foam');
const shader = { vertexShader: '#include <common>\n#include <begin_vertex>',
  fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>' };
const material = createBeachMaterial(); material.onBeforeCompile(shader);
assert.equal(material.roughness, .98);
assert(shader.fragmentShader.includes(glsl));
assert(shader.fragmentShader.includes('beachSlope') && shader.fragmentShader.includes('wrack'));
assert(shader.vertexShader.includes('modelMatrix*vec4(transformed'));
material.dispose();
console.log('coastline: wrapped coves, shared surf boundary and granular beach shader passed');
