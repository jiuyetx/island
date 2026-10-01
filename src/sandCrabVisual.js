import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One instanced mesh for the entire species, with eight individually tagged
// walking legs. Claws and eyes are not accidentally treated as walking legs.
export function createSandCrabGeometry() {
  const parts = [];
  function add(geometry, color, leg = 0, pivot = new THREE.Vector3()) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const count = g.attributes.position.count, colors = [], joints = [], legs = [];
    const tint = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      colors.push(tint.r, tint.g, tint.b); joints.push(pivot.x, pivot.y, pivot.z); legs.push(leg);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('crabPivot', new THREE.Float32BufferAttribute(joints, 3));
    g.setAttribute('crabLeg', new THREE.Float32BufferAttribute(legs, 1));
    parts.push(g);
    if (g !== geometry) geometry.dispose();
  }
  const sphere = (x, y, z, sx, sy, sz, color, segments = 8, rings = 5) => {
    add(new THREE.SphereGeometry(1, segments, rings).scale(sx, sy, sz).translate(x, y, z), color);
  };
  function bone(from, to, radius, color, leg = 0, pivot) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a), centre = a.clone().add(b).multiplyScalar(.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    add(new THREE.CylinderGeometry(radius * .68, radius, direction.length(), 5)
      .applyQuaternion(q).translate(centre.x, centre.y, centre.z), color, leg, pivot);
  }
  sphere(0, .155, 0, .235, .095, .31, 0xf0bd85, 12, 8);
  // Eight bent walking legs, four on each side of the broad carapace.
  for (const [sideIndex, side] of [-1, 1].entries()) for (let i = 0; i < 4; i++) {
    const x = -.18 + i * .12, hip = new THREE.Vector3(x, .145, side * .245);
    const knee = [x - .02, .11, side * (.41 + i * .013)];
    const foot = [x - .10, .016, side * (.57 + i * .012)];
    const leg = 1 + sideIndex * 4 + i;
    bone(hip.toArray(), knee, .028, 0xe5a56c, leg, hip);
    bone(knee, foot, .021, 0xd38b57, leg, hip);
  }
  for (const side of [-1, 1]) {
    bone([.17, .20, side * .15], [.20, .31, side * .15], .020, 0xefc48a);
    sphere(.20, .32, side * .15, .035, .031, .031, 0x302c22);
    sphere(.217, .327, side * .151, .009, .009, .012, 0xfff1d1);
    bone([.19, .15, side * .22], [.33, .15, side * .29], .042, 0xe3a367);
    sphere(.36, .162, side * .32, .082, .051, .066, 0xf2be87);
    sphere(.427, .174, side * .294, .050, .025, .023, 0xf7cc98);
    sphere(.426, .151, side * .350, .050, .023, .019, 0xeeb27b);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createSandCrabMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .87 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float crabLeg;
      attribute vec3 crabPivot;
      attribute vec2 crabGait;
      float legPhase() {
        float index = crabLeg - 1.0;
        return crabGait.x + (mod(mod(index, 4.0), 2.0) + floor(index / 4.0)) * 3.14159265359;
      }
      vec3 crabSwing(vec3 v, float angle) {
        float c = cos(angle), s = sin(angle);
        return vec3(c*v.x+s*v.z, v.y, -s*v.x+c*v.z);
      }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (crabLeg > .5) objectNormal = crabSwing(objectNormal, sin(legPhase())*.24*crabGait.y);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (crabLeg > .5) {
          float swing = sin(legPhase());
          vec3 limb = crabSwing(position-crabPivot, swing*.24*crabGait.y);
          float reach = clamp(abs(position.z-crabPivot.z)/.33, 0.0, 1.0);
          // Knees lift less than toes, producing a bent-leg recovery stroke.
          limb.y += max(0.0, swing)*.065*crabGait.y*reach;
          transformed = crabPivot + limb;
        }`);
  };
  material.customProgramCacheKey = () => 'island-sand-crab-eight-leg-gait-v1';
  return material;
}
