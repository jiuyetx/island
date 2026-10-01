import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEnvironment } from '../src/environmentVisual.js';
import { createBeachMaterial } from '../src/beachMaterial.js';
import { createFoliageMaterial, applyFoliageAtlas } from '../src/foliageMaterial.js';
import { groundPlacements } from '../src/terrain.js';
import { TREE_SITES } from '../src/economy.js';
import ocean from 'production-water';
import islandGlb from '../assets/generated/tropical-island.glb';
import vegetationGlb from '../assets/generated/tropical-vegetation.glb';
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .98;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(); scene.fog = new THREE.FogExp2();
const camera = new THREE.OrthographicCamera();
camera.position.set(Math.cos(-.72) * 24, 24, Math.sin(-.72) * 24); camera.lookAt(0, 0, 0);
function resize() {
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  camera.left = -19 * innerWidth / innerHeight; camera.right = -camera.left;
  camera.top = 19; camera.bottom = -19; camera.near = .1; camera.far = 500; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const water = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), ocean);
water.rotation.x = -Math.PI / 2; water.position.y = -.02; water.renderOrder = 2; scene.add(water);
const seabed = new THREE.Mesh(new THREE.CircleGeometry(220, 96), new THREE.MeshStandardMaterial({ color: 0x188b98 }));
seabed.rotation.x = -Math.PI / 2; seabed.position.y = -1.7; scene.add(seabed);
const loader = new GLTFLoader();
const parse = bytes => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const [island, plants] = await Promise.all([parse(islandGlb), parse(vegetationGlb)]);
const atlas = await new THREE.TextureLoader().loadAsync('assets/generated/tropical-atlas.webp');
atlas.colorSpace = THREE.SRGBColorSpace; atlas.flipY = false;
const solid = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: .88 });
island.scene.traverse(part => { if (part.isMesh) { part.material = solid; part.castShadow = part.receiveShadow = true; } });
const beach = island.scene.getObjectByName('Island_Sand'); beach.material = createBeachMaterial(ocean.uniforms);
scene.add(island.scene); island.scene.updateMatrixWorld(true);
const terrain = ['Island_Grass', 'Island_Sand', 'Island_Underwater'].map(name => island.scene.getObjectByName(name)).concat(seabed);
const wind = [], foliage = createFoliageMaterial(wind), legacyLeaf = createFoliageMaterial(wind, atlas);
applyFoliageAtlas(plants.scene, solid, legacyLeaf, foliage);
const palm = plants.scene.getObjectByName('Palm_Source');
for (const [x, y, z, scale, angle] of groundPlacements(palm, TREE_SITES.map(([x,z,s,a]) => [x,2,z,s,a]), terrain)) {
  const tree = palm.clone(true); tree.position.set(x,y,z); tree.scale.setScalar(scale); tree.rotation.y = angle; scene.add(tree);
}
const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3(0,-1,0);
const environment = createEnvironment(scene, { heightAt: (x,z) => {
  ray.set(origin.set(x,30,z),down); return ray.intersectObjects(terrain,false)[0]?.point.y ?? -1.7;
} });
let hour = 12, phase = 'calm', previous = 0;
document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { hour = Number(button.dataset.hour); }));
document.querySelector('select').addEventListener('change', event => { phase = event.target.value; });
function frame(ms) {
  const time = ms / 1000, dt = previous ? Math.min(.1,(ms - previous)/1000) : 0; previous = ms;
  const light = environment.update(hour,phase,time,dt,undefined,water.position.y);
  const u = ocean.uniforms; u.uTime.value = time; u.uStorm.value = phase === 'impact' ? 1 : phase === 'preparing' ? .53 : 0;
  u.uDaylight.value = light.waterLight; u.uSunlight.value = light.sunlight * (1-light.cloud*.78);
  u.uMoonlight.value = light.moonlight * (1-light.cloud*.94);
  u.uSunDirection.value.copy(environment.sun.position).sub(environment.sun.target.position).normalize();
  u.uMoonDirection.value.copy(environment.moon.position).sub(environment.moon.target.position).normalize();
  wind.forEach(u => { u.time.value = time; u.strength.value = .08 + ocean.uniforms.uStorm.value * 1.72; });
  document.querySelector('output').textContent = `${String(Math.floor(hour)).padStart(2,'0')}:${hour % 1 ? '30' : '00'} · ${phase} · 日光 ${light.sunIntensity.toFixed(2)} · 月光 ${light.moonIntensity.toFixed(2)}`;
  renderer.render(scene,camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
