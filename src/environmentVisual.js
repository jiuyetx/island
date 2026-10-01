import * as THREE from 'three';
import { environmentAt, rainDrop, rainSeed, stormWeather, wrap } from './environment.js';

export function createEnvironment(scene, { rainCount = 2400, heightAt = () => 0 } = {}) {
  const ambient = new THREE.HemisphereLight(0xd9e8e8, 0x435443, 0);
  const sun = new THREE.DirectionalLight(0xfff0cf, 0);
  const moon = new THREE.DirectionalLight(0xb8cdf9, 0);
  for (const [light, resolution] of [[sun, 1024], [moon, 512]]) {
    light.castShadow = true; light.shadow.mapSize.set(resolution, resolution);
    Object.assign(light.shadow.camera, { left: -22, right: 22, bottom: -22, top: 22, near: 1, far: 80 });
    light.shadow.bias = -.0008;
    scene.add(light, light.target);
  }
  scene.add(ambient);
  const seeds = Array.from({ length: rainCount }, (_, i) => rainSeed(i));
  const positions = new Float32Array(rainCount * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.LineBasicMaterial({ color: 0xb8ccd7, transparent: true, opacity: 0, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRainWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRainWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRainWorld;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // Keep the cutaway indoor space dry, even when its roof is hidden.
        if(vRainWorld.y<5.8 && abs(vRainWorld.x-1.6)<2.2 && abs(vRainWorld.z+1.4)<1.8) discard;`);
  };
  material.customProgramCacheKey = () => 'storm-rain-shelter-v1';
  const rain = new THREE.LineSegments(geometry, material);
  rain.frustumCulled = false; rain.renderOrder = 3; rain.visible = false; scene.add(rain);

  const splashCount = 160, splashSeeds = Array.from({ length: splashCount }, (_, i) => rainSeed(i));
  const splashGeometry = new THREE.RingGeometry(.65, 1, 12);
  splashGeometry.rotateX(-Math.PI / 2);
  const fades = new THREE.InstancedBufferAttribute(new Float32Array(splashCount), 1);
  splashGeometry.setAttribute('splashFade', fades);
  const splashMaterial = new THREE.MeshBasicMaterial({ color: 0xc9dbe5, transparent: true, depthWrite: false });
  splashMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float splashFade; varying float vSplashFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplashFade=splashFade;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSplashFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=vSplashFade;');
  };
  splashMaterial.customProgramCacheKey = () => 'storm-splash-fade-v1';
  const splashes = new THREE.InstancedMesh(splashGeometry, splashMaterial, splashCount);
  splashes.frustumCulled = false; splashes.visible = false; splashes.renderOrder = 3;
  splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(splashes);
  const splashPoints = [], matrix = new THREE.Matrix4(), point = new THREE.Vector3(), scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(), sky = new THREE.Color(), daySky = new THREE.Color(0x55b4c5);
  const nightSky = new THREE.Color(0x030916), duskSky = new THREE.Color(0xb36669), cloudSky = new THREE.Color(0x27353f);
  const warmSun = new THREE.Color(0xffb06c), whiteSun = new THREE.Color(0xfff0cf);
  let cloud = 0, rainfall = 0, sampledFocus = { x: Infinity, z: Infinity };
  return { sun, moon, ambient, rain, splashes,
    update(hour, phase, time, seconds, focus = { x: 0, z: 0 }, waterY = 0) {
      const weather = stormWeather(phase), blend = 1 - Math.exp(-Math.min(.1, Math.max(0, seconds)) * .65);
      cloud += (weather.cloud - cloud) * blend;
      rainfall += (weather.rain - rainfall) * blend;
      const light = environmentAt(hour, phase, cloud);
      sun.intensity = light.sunIntensity; moon.intensity = light.moonIntensity;
      sun.visible = sun.intensity > .001; moon.visible = moon.intensity > .001;
      ambient.intensity = light.ambientIntensity;
      ambient.color.setHex(light.sunlight > 0 ? 0xd9e8e8 : 0xb8cdf9);
      ambient.groundColor.setHex(light.sunlight > 0 ? 0x435443 : 0x111d35);
      sun.color.copy(warmSun).lerp(whiteSun, Math.min(1, light.sunlight * 1.7));
      for (const [source, offset] of [[sun, light.sunPosition], [moon, light.moonPosition]]) {
        source.position.set(focus.x + offset.x, offset.y, focus.z + offset.z);
        source.target.position.set(focus.x, 0, focus.z); source.target.updateMatrixWorld();
      }
      sky.copy(nightSky).lerp(daySky, light.sunlight).lerp(duskSky, light.twilight * .24 * (1 - cloud));
      // Storm cloud colour is itself dim at night, not a new light source.
      cloudSky.setHex(0x27353f).multiplyScalar(.12 + light.sunlight * .88);
      sky.lerp(cloudSky, cloud * .82);
      scene.background.copy(sky); scene.fog.color.copy(sky); scene.fog.density = light.fogDensity;
      rain.visible = splashes.visible = rainfall > .01;
      const count = Math.floor(rainCount * rainfall);
      geometry.setDrawRange(0, count * 2);
      material.opacity = (.13 + light.sunlight * .35 + light.moonlight * .10 * (1 - cloud)) * rainfall;
      if (rain.visible) {
        for (let i = 0; i < count; i++) {
          const drop = rainDrop(seeds[i], time, rainfall, focus), offset = i * 6;
          positions[offset] = drop.x; positions[offset + 1] = drop.y; positions[offset + 2] = drop.z;
          positions[offset + 3] = drop.x + drop.dx; positions[offset + 4] = drop.y - drop.dy; positions[offset + 5] = drop.z + drop.dz;
        }
        geometry.attributes.position.needsUpdate = true;
        if (Math.hypot(focus.x - sampledFocus.x, focus.z - sampledFocus.z) > 2) {
          sampledFocus = { ...focus };
          for (let i = 0; i < splashCount; i++) {
            const seed = splashSeeds[i], x = focus.x + seed.x * .78, z = focus.z + seed.z * .78;
            splashPoints[i] = { x, z, y: heightAt(x, z), indoor: Math.abs(x - 1.6) < 2.2 && Math.abs(z + 1.4) < 1.8 };
          }
        }
        splashMaterial.opacity = rainfall * (.05 + light.sunlight * .24);
        for (let i = 0; i < splashCount; i++) {
          const spot = splashPoints[i], age = wrap(time * 1.7 + splashSeeds[i].y, 1), radius = .025 + age * .26;
          point.set(spot.x, Math.max(waterY, spot.y) + .024, spot.z); scale.setScalar(radius);
          matrix.compose(point, quaternion, scale); splashes.setMatrixAt(i, matrix);
          fades.setX(i, spot.indoor ? 0 : (1 - age) ** 2);
        }
        splashes.instanceMatrix.needsUpdate = true; fades.needsUpdate = true;
      }
      return light;
    },
  };
}
