import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEnvironment } from '../src/environmentVisual.js';
import { createBeachMaterial } from '../src/beachMaterial.js';
import { createFoliageMaterial, applyFoliageAtlas } from '../src/foliageMaterial.js';
import { createIslandArt, animateIslandArt, islandTerrainHeight } from '../src/voyageArt.js';
import { ISLANDS } from '../src/voyage.js';
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
const water = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), ocean);
water.rotation.x = -Math.PI / 2; water.position.y = -.02; water.renderOrder = 2; scene.add(water);
const seabed = new THREE.Mesh(new THREE.CircleGeometry(220, 96), new THREE.MeshStandardMaterial({ color: 0x188b98 }));
seabed.rotation.x = -Math.PI / 2; seabed.position.y = -1.7; scene.add(seabed);
const loader = new GLTFLoader();
const parse = bytes => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const [home, plants] = await Promise.all([parse(islandGlb), parse(vegetationGlb)]);
const atlas = await new THREE.TextureLoader().loadAsync('assets/generated/tropical-atlas.webp');
atlas.colorSpace = THREE.SRGBColorSpace; atlas.flipY = false;
const solid = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: .88 });
home.scene.traverse(part => { if (part.isMesh) { part.material = solid; part.castShadow = part.receiveShadow = true; } });
home.scene.getObjectByName('Island_Sand').material = createBeachMaterial(ocean.uniforms);
scene.add(home.scene); home.scene.updateMatrixWorld(true);
const ground = ['Island_Grass', 'Island_Sand', 'Island_Underwater'].map(name => home.scene.getObjectByName(name)).concat(seabed);
const wind = [], foliage = createFoliageMaterial(wind), legacyLeaf = createFoliageMaterial(wind, atlas);
applyFoliageAtlas(plants.scene, solid, legacyLeaf, foliage);
const assets = Object.fromEntries(Object.entries({ palm: 'Palm_Source', bush: 'Bush_Source', rock: 'Rock_Source',
  coral: 'Reef_Staghorn_Source', seaGrass: 'Sea_Grass_Source', fish: 'Fish_A_Source' }).map(([key, name]) => [key, plants.scene.getObjectByName(name)]));
for (const [x, y, z, scale, angle] of groundPlacements(assets.palm, TREE_SITES.map(([x,z,s,a]) => [x,2,z,s,a]), ground)) {
  const tree = assets.palm.clone(true); tree.position.set(x,y,z); tree.scale.setScalar(scale); tree.rotation.y = angle; home.scene.add(tree);
}
const label = (text, parent, x, y, z, width) => {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 72;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#124448ee'; ctx.fillRect(0,0,384,72);
  ctx.fillStyle = '#fff2cc'; ctx.font = '700 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text,192,48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.position.set(x,y,z); sprite.scale.set(width,width*.1875,1); parent.add(sprite); return sprite;
};
const arts = ISLANDS.map(island => createIslandArt({ island, assets, label, surfUniforms: ocean.uniforms }));
arts.forEach(art => scene.add(art.root, art.buoy));
let selected = ISLANDS[0], angle = -.72, showLabels = false;
const environment = createEnvironment(scene, { heightAt: (x,z) => selected ? islandTerrainHeight(selected,x,z) : .9 });
function resize() {
  const size = selected ? selected.radius * 1.65 : 20;
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));
  camera.left = -size * innerWidth / innerHeight; camera.right = -camera.left; camera.top = size; camera.bottom = -size;
  camera.near = .1; camera.far = 500; camera.updateProjectionMatrix();
  const focus = selected || { x: 0, z: 0 };
  camera.position.set(focus.x+Math.cos(angle)*24,25,focus.z+Math.sin(angle)*24); camera.lookAt(focus.x,.8,focus.z);
}
document.querySelectorAll('[data-island]').forEach(button => button.addEventListener('click', () => {
  selected = ISLANDS.find(island => island.id === button.dataset.island) || null;
  resize();
}));
document.querySelector('input').addEventListener('input', event => { angle = Number(event.target.value); resize(); });
document.getElementById('labels').addEventListener('click', () => { showLabels = !showLabels; });
addEventListener('resize',resize); resize();
let previous = 0;
function frame(ms) {
  const time = ms/1000, dt = previous ? Math.min(.1,(ms-previous)/1000) : 0; previous = ms;
  const focus = selected || { x:0,z:0 };
  const light = environment.update(12,'calm',time,dt,focus,water.position.y);
  const u = ocean.uniforms; u.uTime.value = time; u.uDaylight.value = light.waterLight; u.uSunlight.value = light.sunlight; u.uMoonlight.value = light.moonlight;
  u.uSunDirection.value.copy(environment.sun.position).sub(environment.sun.target.position).normalize();
  u.uMoonDirection.value.copy(environment.moon.position).sub(environment.moon.target.position).normalize();
  wind.forEach(u => { u.time.value = time; u.strength.value = .08; });
  arts.forEach(art => {
    art.root.visible = art.root.name === `VoyageIsland_${selected?.id}`; art.buoy.visible = art.root.visible;
    if (art.root.visible) { animateIslandArt(art,time,water.position.y,focus,dt); art.hints.forEach(h => { h.visible = showLabels; }); }
  });
  home.scene.visible = !selected;
  document.querySelectorAll('[data-island]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.island === (selected?.id || 'home'))));
  document.getElementById('labels').setAttribute('aria-pressed',String(showLabels));
  renderer.render(scene,camera);
  document.querySelector('output').textContent = `${selected?.name || '主岛参考'} · 正午 · 渲染 ${renderer.info.render.calls} 批 / ${renderer.info.render.triangles.toLocaleString()} 三角形`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
