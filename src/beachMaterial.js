import * as THREE from 'three';
import { coastlineShaderRadius, islandCoastlineShaderRadius } from './coastline.js';
import { COAST_SWASH_GLSL } from './coastSwash.js';

export function createBeachMaterial(surfUniforms = {}, { island = null } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: island ? 0xffffff : 0xf3deac, vertexColors: true, roughness: .98 });
  const number = n => Number(n).toFixed(6);
  const shoreExpression = island
    ? islandCoastlineShaderRadius(number(island.radius), 'beachAngle', number(island.x), number(island.z))
    : coastlineShaderRadius('beachAngle');
  const localOrigin = island ? `vec2(${number(island.x)},${number(island.z)})` : 'vec2(0.)';
  const limit = island ? number(Math.min(3.2, island.radius * .22)) : '3.2';
  material.onBeforeCompile = shader => {
    shader.uniforms ??= {};
    shader.uniforms.uSwashTime = surfUniforms.uTime || { value: 0 };
    shader.uniforms.uSwashTide = surfUniforms.uTide || { value: 0 };
    shader.uniforms.uSwashStorm = surfUniforms.uStorm || { value: 0 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBeachWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBeachWorld=(modelMatrix*vec4(transformed,1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vBeachWorld;
      uniform float uSwashTime,uSwashTide,uSwashStorm;
      ${COAST_SWASH_GLSL}
      float beachHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float beachNoise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(beachHash(i),beachHash(i+vec2(1.,0.)),f.x),
          mix(beachHash(i+vec2(0.,1.)),beachHash(i+vec2(1.,1.)),f.x),f.y);
      }
      float beachRelief(vec2 p){
        float warp=beachNoise(p*.7)*5.2;
        float ripple=sin(p.y*15.0+p.x*3.1+warp);
        float broken=smoothstep(.32,.7,beachNoise(p*.9+8.0));
        return ripple*broken*.16+(beachNoise(p*5.0)-.5)*.12;
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 beachP=vBeachWorld-${localOrigin};
        float beachAngle=${island ? 'atan(beachP.x,beachP.y)' : 'atan(-beachP.y,beachP.x)'};
        float beachShore=${shoreExpression};
        float shoreDistance=beachShore-length(beachP);
        // Fade off before the grassy upper terrain on the exploration islands.
        float beachMask=${island ? `1.-smoothstep(${number(island.radius * .24)},${number(island.radius * .36)},shoreDistance)` : '1.'};
        vec4 beachSwash=coastSwash(vBeachWorld,shoreDistance,uSwashTime,uSwashTide,uSwashStorm,${limit})*beachMask;
        float mottling=beachNoise(beachP*.62)+beachNoise(beachP*1.7)*.32;
        float grain=beachNoise(beachP*65.0)-.5;
        float damp=1.0-smoothstep(.25,2.2+(mottling-.6)*1.6,shoreDistance);
        // Warm porous upper sand and cool, irregular tide-washed patches.
        diffuseColor.rgb*=mix(1.,.92+(mottling-.6)*.22+grain*.12,beachMask);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.65,.72,.76),max(damp*.65,beachSwash.z*.76)*beachMask);
        // A shallow transparent-looking film, then an irregular white lip and
        // scattered bubbles. This lives on the actual sloping sand, not a flat
        // sea plane buried under it, so it visibly runs uphill and back down.
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.52,.48),beachSwash.x*.28);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.94,.99,.97),beachSwash.y*.92);
        float wrack=(1.0-smoothstep(.06,.22,abs(shoreDistance-(1.8+(mottling-.6)*.85))))
          *smoothstep(.59,.79,beachNoise(beachP*2.8));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.22,.17,.085),wrack*.4*beachMask*(1.-beachSwash.x));
        float beachRippleMask=(1.0-smoothstep(1.2,3.6,shoreDistance))
          *smoothstep(.42,.75,beachNoise(beachP*.35+20.0));
        beachRippleMask*=beachMask*(1.-beachSwash.x*.75);
        diffuseColor.rgb*=1.0+beachRelief(beachP)*.11*beachRippleMask;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.30,beachSwash.x);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec2 beachSlope=vec2(beachRelief(vBeachWorld+vec2(.035,0.))-beachRelief(vBeachWorld-vec2(.035,0.)),
          beachRelief(vBeachWorld+vec2(0.,.035))-beachRelief(vBeachWorld-vec2(0.,.035)));
        normal=normalize(normal-mat3(viewMatrix)*vec3(beachSlope.x,0.,beachSlope.y)*.48*beachRippleMask);`);
  };
  material.customProgramCacheKey = () => `natural-beach-swash-v2-${island?.id || 'home'}-${shoreExpression}`;
  return material;
}
