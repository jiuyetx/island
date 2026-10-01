import assert from 'node:assert/strict';
import * as THREE from 'three';
import { environmentAt, rainDrop, rainSeed, stormWeather } from '../src/environment.js';
import { createEnvironment } from '../src/environmentVisual.js';

const noon = environmentAt(12), sunset = environmentAt(18), midnight = environmentAt(0);
assert.ok(noon.sunIntensity > 3.5 && noon.ambientIntensity > 1.5);
assert.equal(midnight.sunIntensity, 0);
assert.equal(sunset.sunIntensity, 0, 'no sun illumination after sunset');
assert.ok(midnight.moonIntensity > .4 && midnight.moonIntensity < .6);
assert.ok(midnight.ambientIntensity < noon.ambientIntensity * .04, 'no constant bright hemisphere at night');
assert.ok(midnight.waterLight < .1, 'night ocean must not retain 42% daylight');
assert.equal(noon.moonIntensity, 0);
assert.deepEqual(environmentAt(24), midnight);
assert.deepEqual(environmentAt(-12), noon);
for (const key of ['sunIntensity', 'moonIntensity', 'ambientIntensity', 'waterLight']) {
  const dusk = [15, 16, 17, 17.5, 18].map(h => environmentAt(h)[key]);
  if (key === 'sunIntensity') assert.ok(dusk.every((value, i) => !i || value <= dusk[i - 1]));
  for (let h = 0; h < 24; h += .01) {
    assert.ok(Math.abs(environmentAt(h)[key] - environmentAt(h + .01)[key]) < .05, `${key} smooth across time`);
  }
}
assert.ok(environmentAt(0, 'impact').moonIntensity < midnight.moonIntensity * .1, 'storm clouds obscure moonlight');
assert.ok(environmentAt(12, 'impact').sunIntensity < noon.sunIntensity * .3);
assert.equal(stormWeather('warning').rain, 0);
assert.ok(stormWeather('preparing').rain < stormWeather('impact').rain);
assert.deepEqual(stormWeather('preparing'), stormWeather('preparation'));
for (const time of [0, 1, 1e4, 1e7]) for (let i = 0; i < 200; i++) {
  const drop = rainDrop(rainSeed(i), time, 1, { x: 110, z: -90 });
  assert.ok(Math.abs(drop.x - 110) <= 32 && Math.abs(drop.z + 90) <= 32, 'rain remains around remote camera after hours');
  assert.ok(drop.y >= -1 && drop.y <= 31);
  assert.ok(drop.dx > 0 && drop.dy > 0 && drop.dz > 0, 'slanted downward drops');
}

const scene = new THREE.Scene(); scene.background = new THREE.Color(); scene.fog = new THREE.FogExp2();
let samples = 0;
const environment = createEnvironment(scene, { rainCount: 120, heightAt: () => { samples++; return 2; } });
for (let i = 0; i < 150; i++) environment.update(0, 'impact', 1e4 + i / 60, .1, { x: 100, z: 150 });
assert.equal(environment.sun.visible, false);
assert.equal(environment.moon.visible, true);
assert.equal(environment.rain.visible, true);
assert.equal(environment.rain.geometry.attributes.position.count, 240);
assert.ok(environment.rain.geometry.drawRange.count > 200);
assert.equal(environment.splashes.count, 160);
assert.equal(samples, 160, 'stationary view does not raycast splash terrain every frame');
environment.update(0, 'impact', 1e4, .1, { x: 110, z: 150 });
assert.equal(samples, 320, 'splash field follows travel');
const rainShader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>' };
environment.rain.material.onBeforeCompile(rainShader);
assert.match(rainShader.fragmentShader, /vRainWorld.y<5.8/);
assert.match(rainShader.fragmentShader, /discard/);
for (let i = 0; i < 150; i++) environment.update(12, 'calm', i / 60, .1);
assert.equal(environment.rain.visible, false);
assert.equal(environment.sun.visible, true);
assert.equal(environment.moon.visible, false);
console.log('environment: gradual dusk, moon-only night, cloud attenuation, bounded rain, remote focus and shelter clipping passed');
