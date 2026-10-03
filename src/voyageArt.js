import * as THREE from 'three';
import { landingPoint, islandResourcePoint } from './voyage.js';
import { createReefFish, stepReefFish } from './reefFish.js';
import { createBeachMaterial } from './beachMaterial.js';
import { islandShoreRadius } from './coastline.js';
import { createFishMaterial } from './fishVisual.js';
export { islandShoreRadius } from './coastline.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const noise = (x, z, seed = 0) => (Math.sin(x * 1.73 + seed) * Math.cos(z * 1.21 - seed) + Math.sin(x * .61 - z * .87 + seed)) * .5;

// The visual shore stays inside the conservative circular navigation boundary.
// The same height function grounds both the mesh and the walking character.
export function islandTerrainHeight(island, x, z) {
  const dx = x - island.x, dz = z - island.z;
  const distance = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
  const ratio = distance / islandShoreRadius(island, angle);
  if (ratio > 1) return -1.65 * smooth(1, 1.29, ratio);
  // The resource clearing stays level. Previously the spring was partly buried
  // by terrain bumps, and chest foundations hovered above nearby depressions.
  const seed = island.x * .071 + island.z * .043;
  const grassEdge = .60 + .045 * Math.sin(angle * 2 + seed) + .025 * Math.sin(angle * 5 - seed);
  const flat = smooth(2.15, 3.15, distance);
  const land = .9 * (1 - smooth(grassEdge, 1, ratio));
  const landward = (dx * island.x + dz * island.z) / Math.hypot(island.x, island.z);
  const side = (dx * -island.z + dz * island.x) / Math.hypot(island.x, island.z);
  const ridge = Math.exp(-((landward - island.radius * .40) ** 2 + side * side * .55) / (island.radius * .22) ** 2);
  const rise = island.id === 'beacon' ? .82 : island.id === 'spring' ? .52 : island.id === 'ruins' ? .33 : .24;
  let relief = (rise * ridge + noise(dx * .42, dz * .42, seed) * .13) * flat * (1 - smooth(.60, .94, ratio));
  const temple = island.id === 'ruins' ? (1 - smooth(3.3, 4.0, Math.abs(dx))) * (1 - smooth(2.3, 2.9, Math.abs(dz + 2.55))) : 0;
  const dunes = Math.sin(angle * 7 + distance * 2.1) * .09 * smooth(.58, .72, ratio) * (1 - smooth(.84, 1, ratio));
  return THREE.MathUtils.lerp(land + relief + dunes, .9, temple);
}

export function islandWalkPoint(island, point) {
  const dx = point.x - island.x, dz = point.z - island.z, distance = Math.hypot(dx, dz);
  const limit = Math.min(island.radius - 1.5, islandShoreRadius(island, Math.atan2(dx, dz)) - island.radius * .16);
  const scale = Math.min(1, limit / (distance || 1));
  return { x: island.x + dx * scale, z: island.z + dz * scale };
}

export function createIslandTerrain(island, surfUniforms) {
  const positions = [0, .9, 0], colors = [], indices = [], segments = 80, rings = 24;
  const grass = new THREE.Color(island.id === 'ruins' ? 0x929f58 : 0xa3b85f);
  const sand = new THREE.Color(0xe6d3a7), wet = new THREE.Color(0xb2aa80), shelf = new THREE.Color(0x408f8a);
  colors.push(grass.r, grass.g, grass.b);
  for (let ring = 1; ring <= rings; ring++) {
    const ratio = ring / rings * 1.29;
    for (let j = 0; j < segments; j++) {
      const angle = j / segments * TAU, radius = islandShoreRadius(island, angle) * ratio;
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      positions.push(x, islandTerrainHeight(island, island.x + x, island.z + z), z);
      const patch = noise(x * .6, z * .6, island.z);
      const edge = .57 + .045 * Math.sin(angle * 2 + island.x * .071 + island.z * .043) + .025 * Math.sin(angle * 5);
      const color = grass.clone().lerp(sand, smooth(edge + patch * .035, edge + .19, ratio));
      color.lerp(wet, smooth(.86, 1.04, ratio)).lerp(shelf, smooth(1.04, 1.29, ratio));
      color.multiplyScalar(1 + patch * .055); colors.push(color.r, color.g, color.b);
      const b = 1 + (ring - 1) * segments + j, next = 1 + (ring - 1) * segments + (j + 1) % segments;
      if (ring === 1) indices.push(0, b, next);
      else {
        const a = b - segments, an = next - segments;
        indices.push(a, b, next, a, next, an);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = createBeachMaterial(surfUniforms, { island });
  const terrain = new THREE.Mesh(geometry, material); terrain.receiveShadow = true;
  terrain.name = `VoyageTerrain_${island.id}`;
  return terrain;
}

function detailMaterial(color, kind = 'stone') {
  const material = new THREE.MeshStandardMaterial({ color, roughness: kind === 'wood' ? .84 : .94 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetailPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vDetailPosition;
      float detailNoise(vec3 p) { return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = detailNoise(floor(vDetailPosition * ${kind === 'ground' ? '52.0' : '31.0'}));
        ${kind === 'wood' ? 'grain = mix(grain, sin(vDetailPosition.x * 39.0 + sin(vDetailPosition.z * 7.0)*2.0)*.5+.5, .62);' : ''}
        diffuseColor.rgb *= .95 + grain * .10;
        ${kind === 'stone' ? 'float patina=detailNoise(floor(vDetailPosition*2.4)); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.68,.77,.55),smoothstep(.72,.93,patina)*.20);' : ''}`);
  };
  material.customProgramCacheKey = () => `voyage-detail-${kind}`;
  return material;
}

// All decoration is local to one island. Reefs use instancing; paths and landing
// approaches stay clear. None of the art changes resource coordinates or saves.
export function createIslandArt({ island, assets = {}, label, surfUniforms }) {
  const root = new THREE.Group(); root.name = `VoyageIsland_${island.id}`;
  root.position.set(island.x, 0, island.z);
  const terrain = createIslandTerrain(island, surfUniforms); root.add(terrain);
  const resource = new THREE.Group(); resource.name = `VoyageResource_${island.id}`; root.add(resource);
  const animations = [], hints = [], grassPlacements = [], accents = [];
  const wood = detailMaterial(0x967145, 'wood'), darkWood = detailMaterial(0x584c3b, 'wood');
  const stone = detailMaterial(0x9a9c8b), paleStone = detailMaterial(0xc6bfa6);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb49c62, roughness: .45, metalness: .55 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x5c9146, roughness: .9, side: THREE.DoubleSide });
  const mesh = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (p, w, h, d, m, x, y, z) => mesh(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cylinder = (p, top, bottom, h, m, x, y, z, sides = 12) => mesh(p, new THREE.CylinderGeometry(top, bottom, h, sides), m, x, y, z);
  const ball = (p, r, m, x, y, z) => mesh(p, new THREE.IcosahedronGeometry(r, 1), m, x, y, z);
  const height = (x, z) => islandTerrainHeight(island, island.x + x, island.z + z);
  const land = landingPoint(island, true), dock = landingPoint(island);
  const lx = land.x - island.x, lz = land.z - island.z, length = Math.hypot(lx, lz);
  const outward = new THREE.Vector2(lx / length, lz / length), tangent = new THREE.Vector2(-outward.y, outward.x);
  const clearPath = (x, z, margin = 1.6) => {
    const t = THREE.MathUtils.clamp((x * lx + z * lz) / (lx * lx + lz * lz), 0, 1);
    return Math.hypot(x - lx * t, z - lz * t) < margin;
  };
  const inLandmark = (x, z) => island.id === 'ruins'
    ? Math.abs(x) < 3.6 && Math.abs(z + 2.55) < 2.55
    : island.id === 'beacon' && Math.hypot(x, z + 2.9) < 1.6;
  const cloneProp = (source, x, z, scale, rotation = 0, parent = root) => {
    if (!source) return null;
    source.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(source), center = bounds.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group(), prop = source.clone(true);
    prop.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    prop.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    wrapper.add(prop); wrapper.position.set(x, height(x, z), z); wrapper.scale.setScalar(scale); wrapper.rotation.y = rotation;
    parent.add(wrapper); return wrapper;
  };
  function rock(x, z, size, material = stone) {
    const sourceRock = cloneProp(assets.rock, x, z, size * 1.25, x * .23 + z);
    if (sourceRock) {
      sourceRock.position.y -= .04 * size;
      sourceRock.scale.set(size * 1.45, size * 1.25, size * (1.1 + Math.sin(x) * .12));
      accents.push({ x, z, radius: size * .8, kind: 'rock' });
      return sourceRock;
    }
    const m = ball(root, size, material, x, height(x, z) + size * .20, z);
    m.scale.set(1.1, .65, .85); m.rotation.set(x * .23, z, x * .14); return m;
  }
  function palm(x, z, scale = 1) {
    if (clearPath(x, z, 2) || inLandmark(x, z) || Math.hypot(x, z) > islandShoreRadius(island, Math.atan2(x, z)) * .72) return;
    const p = cloneProp(assets.palm, x, z, scale, x * .43 + z * .7);
    if (p) { animations.push({ type: 'palm', object: p, phase: x + z }); accents.push({ x, z, radius: .4, kind: 'palm' }); }
  }
  function grass(x, z, size = .5) {
    grassPlacements.push({ x, z, size });
  }

  // Weathered landing pier sits beside, not through, the avatar landing lane.
  const pier = new THREE.Group(); root.add(pier);
  const px = outward.x * (island.radius - 1.75) + tangent.x * 2.15;
  const pz = outward.y * (island.radius - 1.75) + tangent.y * 2.15;
  pier.position.set(px, height(px, pz), pz); pier.rotation.y = Math.atan2(outward.x, outward.y);
  for (let i = 0; i < 8; i++) box(pier, 1.45, .10, .28, i % 3 === 0 ? darkWood : wood, 0, .22, (i - 3.5) * .31);
  for (const x of [-.64, .64]) for (const z of [-1.05, 1.05]) {
    cylinder(pier, .065, .085, 1.3, darkWood, x, -.12, z, 8);
    cylinder(pier, .10, .10, .15, wood, x, .58, z, 8);
    const rope = mesh(pier, new THREE.TorusGeometry(.09, .025, 4, 12), brass, x, .46, z); rope.rotation.x = Math.PI / 2;
  }
  const sign = new THREE.Group(); sign.position.set(lx + tangent.x * 1.1, height(lx, lz), lz + tangent.y * 1.1); root.add(sign);
  cylinder(sign, .05, .07, 1.4, wood, 0, .7, 0, 8);
  hints.push(label(island.name, sign, 0, 1.5, 0, 2.5));
  const buoy = new THREE.Group(); buoy.position.set(dock.x, .2, dock.z);
  cylinder(buoy, .15, .25, .34, brass, 0, 0, 0);
  cylinder(buoy, .08, .13, .40, paleStone, 0, .34, 0);
  cylinder(buoy, .028, .028, .55, darkWood, 0, .72, 0, 6);
  const flag = box(buoy, .42, .25, .035, new THREE.MeshStandardMaterial({ color: 0xeab854 }), .20, .95, 0);
  animations.push({ type: 'flag', object: flag, phase: island.z });

  if (island.resource === 'water') {
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3bb6b0, roughness: .18, metalness: .15, transparent: true, opacity: .88 });
    const poolGeometry = new THREE.CircleGeometry(1.65, 48);
    const poolPositions = poolGeometry.attributes.position;
    for (let j = 1; j < poolPositions.count; j++) {
      const x = poolPositions.getX(j), y = poolPositions.getY(j), a = Math.atan2(y, x);
      const curve = 1 + .06 * Math.sin(a * 3) + .035 * Math.sin(a * 5 + .8);
      poolPositions.setXY(j, x * curve, y * curve);
    }
    const pool = mesh(resource, poolGeometry, waterMat, 0, .93, 0); pool.rotation.x = -Math.PI / 2; pool.scale.y = .82;
    const basin = cylinder(resource, 1.75, 1.3, .12, paleStone, 0, .84, 0, 24); basin.scale.z = .82;
    for (let j = 0; j < 14; j++) {
      const angle = j / 14 * TAU;
      const x = Math.sin(angle) * 1.73, z = Math.cos(angle) * 1.38;
      const b = cloneProp(assets.rock, x, z, .39 + (j % 3) * .05, angle, resource);
      if (!b) { const fallback = ball(resource, .24 + (j % 3) * .035, j % 2 ? paleStone : stone, x, .95, z); fallback.scale.set(1.35, .7, 1); fallback.rotation.y = angle; }
    }
    for (let j = 0; j < 3; j++) {
      const ring = mesh(resource, new THREE.TorusGeometry(.35 + j * .4, .012, 4, 48),
        new THREE.MeshBasicMaterial({ color: 0xb5f0dc, transparent: true, opacity: .35, depthWrite: false }), 0, .947 + j * .002, 0);
      ring.rotation.x = -Math.PI / 2; ring.scale.y = .82; animations.push({ type: 'ripple', object: ring, phase: j });
    }
    for (let i = 0; i < 4; i++) {
      const x = -.85 + Math.sin(i) * .25, z = -1.1 - i * .10;
      const b = cloneProp(assets.rock, x, z, .72 - i * .07, i * .9, resource);
      if (b) b.position.y = .9 + i * .22;
      else ball(resource, .55 - i * .06, stone, x, 1.1 + i * .30, z).scale.set(1.15, .75, .8);
    }
    const stream = cylinder(resource, .045, .070, .90, waterMat, -.7, 1.44, -.93, 8); stream.rotation.z = -.38;
    animations.push({ type: 'spring', object: stream });
    palm(-3.2, -3.3, .9); palm(3.8, 1.5, .85); palm(-3.9, 2.8, .68);
    for (let j = 0; j < 10; j++) {
      const a = j * 2.399, x = Math.sin(a) * 2.35, z = Math.cos(a) * 2.15;
      if (!clearPath(x, z, 1.25)) grass(x, z, .85 + (j % 3) * .12);
    }
    hints.push(label('淡水泉', resource, 0, 2.4, 0, 2.0));
  } else if (island.resource === 'food') {
    // Basket weave, coconut husks and split fruit make the resource readable.
    cylinder(resource, .65, .50, .43, wood, 0, 1.12, 0, 16);
    for (let i = 0; i < 16; i++) box(resource, .05, .46, .055, darkWood, Math.sin(i / 16 * TAU) * .60, 1.14, Math.cos(i / 16 * TAU) * .60);
    for (const y of [1, 1.15, 1.34]) mesh(resource, new THREE.TorusGeometry(.61, .035, 5, 24), wood, 0, y, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const x = Math.sin(i * 2.4) * .37, z = Math.cos(i * 2.4) * .37;
      const c = ball(resource, .22, darkWood, x, 1.45 + (i % 2) * .1, z); c.scale.set(1, 1.15, 1);
      for (let j = 0; j < 3; j++) ball(resource, .018, wood, x + (j - 1) * .05, 1.69 + (i % 2) * .1, z);
    }
    for (let i = 0; i < 11; i++) palm(Math.sin(i * 2.399) * (4.1 + (i % 3) * .6), Math.cos(i * 2.399) * (4.1 + (i % 3) * .6), .70 + (i % 4) * .10);
    hints.push(label('椰果补给', resource, 0, 2.2, 0, 2.2));
  } else if (island.resource === 'treasure') {
    // Broken temple with a traversable approach, masonry courses and fallen blocks.
    box(root, 6.5, .20, 4.4, paleStone, 0, .91, -2.55);
    for (const x of [-2.5, 2.5]) {
      box(root, 1.16, .25, 1.1, stone, x, 1.14, -2.7);
      for (let j = 0; j < 5; j++) cylinder(root, .34 + j * .008, .37 + j * .008, .48, j % 2 ? stone : paleStone, x, 1.5 + j * .49, -2.7, 10);
      box(root, 1.06, .22, .98, paleStone, x, 3.93, -2.7);
    }
    for (let j = 0; j < 4; j++) box(root, 1.42, .45, .92, j % 2 ? paleStone : stone, (j - 1.5) * 1.48, 4.26, -2.7);
    for (let j = 0; j < 7; j++) {
      const b = box(root, .68, .34, .52, stone, -3.9 + j * .22, height(-3.9 + j * .22, 1.2) + .20, 1.2 + Math.sin(j) * .7);
      b.rotation.set(.10, j * .9, .12);
    }
    box(resource, 1.4, .16, 1.0, paleStone, 0, .98, 0);
    box(resource, 1.2, .52, .78, darkWood, 0, 1.31, 0);
    const lid = cylinder(resource, .39, .39, 1.2, wood, 0, 1.57, 0, 16); lid.rotation.z = Math.PI / 2; lid.scale.z = .85;
    for (const x of [-.43, .43]) {
      box(resource, .075, .52, .80, brass, x, 1.31, 0);
      const band = mesh(resource, new THREE.TorusGeometry(.39, .036, 4, 24), brass, x, 1.57, 0); band.rotation.y = Math.PI / 2; band.scale.x = .85;
    }
    box(resource, .18, .23, .055, brass, 0, 1.44, .43);
    hints.push(label('失落宝箱', resource, 0, 2.4, 0, 2.1));
  } else {
    // Nautical lighthouse: masonry base, bands, windows, balcony and lantern.
    const tower = new THREE.Group(); tower.position.set(0, height(0, -2.9), -2.9); root.add(tower);
    const chalk = detailMaterial(0xede3ca), red = detailMaterial(0xaf6248);
    cylinder(tower, 1.05, 1.3, .4, stone, 0, .2, 0, 20);
    for (let j = 0; j < 4; j++) cylinder(tower, .70 - j * .07, .77 - j * .07, .9, j % 2 ? red : chalk, 0, .83 + j * .9, 0, 20);
    for (const y of [1.2, 2.7]) box(tower, .22, .35, .055, darkWood, 0, y, .70 - y * .07);
    box(tower, .32, .61, .055, darkWood, 0, .68, .79);
    cylinder(tower, 1.0, 1.0, .16, chalk, 0, 4.04, 0, 20);
    for (let j = 0; j < 12; j++) cylinder(tower, .025, .025, .53, darkWood, Math.sin(j / 12 * TAU) * .92, 4.37, Math.cos(j / 12 * TAU) * .92, 5);
    mesh(tower, new THREE.TorusGeometry(.94, .025, 4, 32), darkWood, 0, 4.64, 0).rotation.x = Math.PI / 2;
    const glass = new THREE.MeshStandardMaterial({ color: 0xc2e6da, roughness: .15, transparent: true, opacity: .4, depthWrite: false });
    cylinder(tower, .48, .48, .84, glass, 0, 4.61, 0, 12);
    for (let j = 0; j < 6; j++) cylinder(tower, .025, .025, .9, darkWood, Math.sin(j / 6 * TAU) * .49, 4.64, Math.cos(j / 6 * TAU) * .49, 5);
    const light = ball(tower, .22, new THREE.MeshStandardMaterial({ color: 0xffd581, emissive: 0xffb740, emissiveIntensity: 1.5 }), 0, 4.63, 0);
    animations.push({ type: 'lantern', object: light });
    mesh(tower, new THREE.ConeGeometry(.75, .53, 16), red, 0, 5.27, 0);
    cylinder(tower, .025, .04, .35, brass, 0, 5.67, 0, 8);
    box(resource, 1.1, .62, .8, wood, 0, 1.25, 0);
    for (const x of [-.48, .48]) box(resource, .08, .65, .85, darkWood, x, 1.25, 0);
    for (let j = 0; j < 4; j++) box(resource, 1.05, .035, .04, darkWood, 0, 1.02 + j * .15, .41);
    const packet = box(resource, .32, .03, .42, paleStone, .13, 1.6, .03); packet.rotation.y = .35;
    for (let j = 0; j < 3; j++) ball(resource, .036, brass, -.15 + j * .09, 1.64, .1);
    palm(3.1, 1.9, .7); hints.push(label('种子补给箱', resource, 0, 2.3, 0, 2.3));
    for (let j = 0; j < 4; j++) {
      const a = Math.atan2(island.x, island.z) + (j - 1.5) * .32;
      const x = Math.sin(a) * island.radius * .58, z = Math.cos(a) * island.radius * .58;
      if (!clearPath(x, z, 2.4) && Math.hypot(x, z) > 2.5 && Math.hypot(x, z + 2.9) > 1.8) rock(x, z, .75 + (j % 2) * .35);
    }
  }

  // Sparse land accents leave the main approach and the resource interaction
  // radius untouched; the island does not become another wall of bushes.
  for (let j = 0; j < 18; j++) {
    const angle = j * 2.399 + island.z, radius = island.radius * (.30 + (j % 4) * .075);
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (clearPath(x, z) || inLandmark(x, z) || Math.hypot(x, z) < 2.4) continue;
    if (j % 5 === 0) {
      cloneProp(assets.bush, x, z, .60 + (j % 3) * .08, angle);
      accents.push({ x, z, radius: .65, kind: 'bush' });
    }
    else grass(x, z, .5 + (j % 3) * .2);
  }
  for (let j = 0; j < 6; j++) {
    const a = j * 2.399 + island.x, r = island.radius * (.72 + (j % 2) * .12);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!clearPath(x, z, 2.4)) rock(x, z, .32 + (j % 3) * .16);
  }

  // One curved, tapered blade geometry and one draw call for the whole island.
  // Avoid dozens of flat, rectangular grass planes over the flower assets.
  if (grassPlacements.length) {
    const vertices = [], triangles = [];
    for (let blade = 0; blade < 5; blade++) {
      const a = blade * 2.399, offset = vertices.length / 3;
      for (let row = 0; row < 5; row++) {
        const t = row / 4, width = row === 4 ? .004 : .045 * Math.sin((t + .2) * Math.PI / 1.3);
        for (const side of [-1, 1]) vertices.push(Math.sin(a) * (.07 + t * t * .28) + Math.cos(a) * width * side,
          t * .75 - t ** 4 * .10, Math.cos(a) * (.07 + t * t * .28) - Math.sin(a) * width * side);
        if (row < 4) { const b = offset + row * 2; triangles.push(b, b + 1, b + 3, b, b + 3, b + 2); }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(triangles); geometry.computeVertexNormals();
    const tufts = new THREE.InstancedMesh(geometry, leaf, grassPlacements.length);
    tufts.name = `VoyageGrass_${island.id}`; tufts.receiveShadow = true;
    const dummy = new THREE.Object3D();
    grassPlacements.forEach((p, index) => {
      dummy.position.set(p.x, height(p.x, p.z), p.z); dummy.rotation.y = index * 2.399;
      dummy.scale.setScalar(p.size); dummy.updateMatrix(); tufts.setMatrixAt(index, dummy.matrix);
      tufts.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0xbac78e : index % 3 === 1 ? 0xc9d5a5 : 0xe2daa1));
    });
    tufts.instanceMatrix.needsUpdate = true; root.add(tufts);
  }

  const driftPoint = islandResourcePoint(island, 'wood'), drift = new THREE.Group();
  drift.position.set(driftPoint.x - island.x, height(driftPoint.x - island.x, driftPoint.z - island.z), driftPoint.z - island.z); root.add(drift);
  for (let j = 0; j < 2; j++) {
    const log = cylinder(drift, .10, .14, 1.35 - j * .25, wood, 0, .14 + j * .06, j * .22, 10);
    log.rotation.set(0, 0, Math.PI / 2 + j * .2);
    cylinder(drift, .085, .085, .018, paleStone, .68 - j * .13, .14 + j * .06, j * .22, 10).rotation.z = Math.PI / 2;
  }

  function reefInstances(source, count, seed, material, placements = null) {
    if (!source) return;
    source.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(source), center = bounds.getCenter(new THREE.Vector3());
    const points = (placements || Array.from({ length: count }, (_, j) => {
      const a = j * 2.399 + seed, r = island.radius * (1.12 + .22 * ((j * 7 % 11) / 11));
      return { x: Math.sin(a) * r, z: Math.cos(a) * r, a, size: .35 + (j % 4) * .12 };
    })).filter(p => Math.hypot(p.x - (dock.x - island.x), p.z - (dock.z - island.z)) > 3.3);
    source.traverse(child => {
      if (!child.isMesh || !points.length) return;
      const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld).translate(-center.x, -bounds.min.y, -center.z);
      const inst = new THREE.InstancedMesh(geometry, material || child.material, points.length);
      if (placements) inst.name = `VoyageBeachPebbles_${island.id}`;
      inst.receiveShadow = true;
      const dummy = new THREE.Object3D();
      points.forEach((p, index) => {
        dummy.position.set(p.x, height(p.x, p.z) - .02, p.z); dummy.rotation.y = p.a; dummy.scale.setScalar(p.size); dummy.updateMatrix(); inst.setMatrixAt(index, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true; root.add(inst);
    });
  }
  reefInstances(assets.rock, 15, island.x, stone);
  reefInstances(assets.coral, 12, island.z);
  reefInstances(assets.seaGrass, 15, island.x + 10);
  const pebbles = Array.from({ length: 15 }, (_, j) => {
    const a = j * 2.399 + island.x * .21, r = islandShoreRadius(island, a) * (.84 + (j % 3) * .025);
    return { x: Math.sin(a) * r, z: Math.cos(a) * r, a, size: .13 + (j % 4) * .035 };
  }).filter(p => !clearPath(p.x, p.z, 2.4) && Math.hypot(p.x - (driftPoint.x - island.x), p.z - (driftPoint.z - island.z)) > 1.4);
  reefInstances(assets.rock, 0, 0, null, pebbles);
  // Decorative fish stay offshore. They are not invisible gameplay rewards;
  // existing catchable fish continue to use the original fishing system.
  if (assets.fish) {
    assets.fish.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(assets.fish), center = bounds.getCenter(new THREE.Vector3());
    const fishUniforms = [], fishMaterial = createFishMaterial({ animatedUniforms: fishUniforms });
    assets.fish.traverse(child => {
      if (!child.isMesh) return;
      const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld).translate(-center.x, -center.y, -center.z);
      const inst = new THREE.InstancedMesh(geometry, fishMaterial, 12); inst.renderOrder = 3;
      inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(), island.radius + 11);
      for (let j = 0; j < 12; j++) inst.setColorAt(j, new THREE.Color(j % 2 ? 0x68abc5 : 0xebbf54));
      const fish = [];
      for (let index = 0; index < inst.count; index++) fish.push(createReefFish(island.radius,
        { x: dock.x - island.x, z: dock.z - island.z }, index, Math.abs(island.x * 177 + island.z * 331) + index * 1031, fish));
      root.add(inst); animations.push({ type: 'fish', object: inst, fish, fishUniforms, matrix: new THREE.Object3D() });
    });
  }
  return { root, terrain, resource, drift, buoy, animations, hints, accents };
}

export function animateIslandArt(art, seconds, waterY, focus, deltaSeconds = 0) {
  art.buoy.position.y = waterY + .18 + Math.sin(seconds * 1.8 + art.root.position.x) * .07;
  const nearby = Math.hypot(focus.x - art.root.position.x, focus.z - art.root.position.z) < 24;
  art.hints.forEach(hint => { hint.visible = nearby; });
  // Tiny ambient motion gives each landmark life without moving colliders.
  for (const item of art.animations) {
    if (item.type === 'palm') item.object.rotation.z = Math.sin(seconds * .8 + item.phase) * .013;
    else if (item.type === 'flag') item.object.rotation.y = Math.sin(seconds * 2.8 + item.phase) * .18;
    else if (item.type === 'ripple') { item.object.material.opacity = .18 + Math.sin(seconds * 1.6 - item.phase) * .12; }
    else if (item.type === 'spring') item.object.scale.x = 1 + Math.sin(seconds * 8) * .1;
    else if (item.type === 'lantern') item.object.material.emissiveIntensity = 1.4 + Math.sin(seconds * 1.3) * .2;
    else if (item.type === 'fish') {
      item.fishUniforms.forEach(uniform => { uniform.value = seconds; });
      for (let j = 0; j < item.object.count; j++) {
        const fish = stepReefFish(item.fish[j], deltaSeconds, item.fish);
        item.matrix.position.set(fish.x, -.54 + Math.sin(seconds * 1.3 + j) * .035, fish.z);
        item.matrix.rotation.y = -fish.heading; item.matrix.scale.setScalar(.42 + (j % 3) * .05); item.matrix.updateMatrix();
        item.object.setMatrixAt(j, item.matrix.matrix);
      }
      item.object.instanceMatrix.needsUpdate = true;
    }
  }
}
