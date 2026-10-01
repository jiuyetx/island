import { DoubleSide, MeshStandardMaterial } from 'three';

// Authored RGB is baked into the approved plant mesh; multiplying it by the
// legacy green atlas would turn bark, flowers and coconuts green as well.
export function createFoliageMaterial(windUniforms, map = null) {
  const material = new MeshStandardMaterial({
    map, vertexColors: true, roughness: .88, metalness: 0, side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    const time = { value: 0 }, strength = { value: .08 };
    shader.uniforms.uWindTime = time;
    shader.uniforms.uWindStrength = strength;
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nuniform float uWindTime; uniform float uWindStrength;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float leafHeight=max(position.y,0.0);
        float leafWave=sin(uWindTime*1.7+position.x*.75+position.z*.55);
        transformed.x+=leafWave*uWindStrength*leafHeight*.045;
        transformed.z+=cos(uWindTime*1.3+position.x*.45)*uWindStrength*leafHeight*.025;`);
    windUniforms.push({ time, strength });
  };
  material.customProgramCacheKey = () => 'island-leaf-wind-v1';
  return material;
}

export function applyFoliageAtlas(root, solidMaterial, leafMaterial, authoredMaterial) {
  const leafNames = new Set(['Palm', 'Bush', 'Sea_Grass', 'Kelp']);
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material = object.userData.authoredPlant
      ? authoredMaterial : leafNames.has(object.name) ? leafMaterial : solidMaterial;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}
