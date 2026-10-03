import * as THREE from 'three';

export function createFishMaterial({ pattern = `
  float band=1.-smoothstep(.48,.80,sin(vFishLocal.x*26.));
  diffuseColor.rgb*=1.-.68*band*body;`, animatedUniforms = [] } = {}) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .47, metalness: 0,
    // Keep the clear-water draw pass, but opaque fragments write depth so the
    // nearer body occludes another instance instead of blending through it.
    transparent: true, opacity: 1, depthWrite: true });
  material.userData.surfaceSchool = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.uCreatureTime = { value: 0 }; animatedUniforms.push(shader.uniforms.uCreatureTime);
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nuniform float uCreatureTime;\nvarying vec3 vFishLocal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFishLocal=position;
        float fishPhase=0.;
        #ifdef USE_INSTANCING
          fishPhase=dot(instanceMatrix[3].xz,vec2(.71,.43));
        #endif
        float tailWeight=1.-smoothstep(-.72,-.16,position.x);
        transformed.z+=sin(uCreatureTime*5.+position.x*3.8+fishPhase)*.055*tailWeight;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFishLocal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=max(vec3(0.),mix(vec3(luminance),diffuseColor.rgb,1.18));
        float body=smoothstep(-.42,-.32,vFishLocal.x)*(1.-smoothstep(.39,.49,vFishLocal.x));
        float eye=1.-smoothstep(.005,.025,length(vec2((vFishLocal.x-.38)*.9,vFishLocal.y-.06)));
        float gill=(1.-smoothstep(.009,.024,abs(vFishLocal.x-.27)))*body;
        ${pattern}
        diffuseColor.rgb*=1.-eye*.92-gill*.38;
        diffuseColor.rgb*=1.-smoothstep(.09,.25,vFishLocal.y)*body*.13;`);
  };
  material.customProgramCacheKey = () => `solid-fish-${pattern}`;
  return material;
}
