import * as THREE from 'three';

export function createSandTrackMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float trackOpacity; attribute float trackKind;
      varying float vTrackOpacity; varying float vTrackKind; varying vec2 vTrackUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTrackOpacity=trackOpacity; vTrackKind=trackKind; vTrackUv=uv;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying float vTrackOpacity; varying float vTrackKind; varying vec2 vTrackUv;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 trackP=vTrackUv*2.-1.;
        float impression=2.;
        if(vTrackKind<.5){
          vec2 footP=vec2(trackP.x,-trackP.y);
          float toe=length((footP-vec2(.02,.28))/vec2(.62,.55));
          float heel=length((footP-vec2(-.03,-.55))/vec2(.43,.26));
          impression=min(toe,heel);
        }else{
          // Alternating sets of four stance-leg impressions, eight legs total.
          for(int leg=0;leg<8;leg++){
            float row=mod(float(leg),4.);
            float bank=floor(float(leg)/4.);
            float tetrad=mod(mod(row,2.)+bank,2.);
            float selected=vTrackKind<1.5?0.:1.;
            if(abs(tetrad-selected)<.25){
              vec2 toePoint=vec2(-.70+row*.46,bank<.5?-.72:.72);
              impression=min(impression,length((trackP-toePoint)/vec2(.16,.11)));
            }
          }
        }
        float softened=1.-smoothstep(.70,1.12,impression);
        float ridge=smoothstep(.40,1.02,impression);
        diffuseColor.rgb=mix(vec3(.20,.15,.085),vec3(.52,.43,.29),ridge);
        diffuseColor.a*=softened*vTrackOpacity*.62;
        if(diffuseColor.a<.003) discard;`);
  };
  material.customProgramCacheKey = () => 'sand-impressions-shoe-and-crab-v1';
  return material;
}

// One bounded instanced draw, even if all 640 impressions are occupied.
export function createSandTrackVisual(tracks) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(tracks.marks.length), 1);
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(tracks.marks.length), 1);
  opacity.setUsage(THREE.DynamicDrawUsage); kind.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('trackOpacity', opacity); geometry.setAttribute('trackKind', kind);
  const mesh = new THREE.InstancedMesh(geometry, createSandTrackMaterial(), tracks.marks.length);
  mesh.name = 'Sand_Transient_Tracks'; mesh.frustumCulled = false;
  mesh.receiveShadow = true; mesh.renderOrder = 1;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const slope = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3(), drawnMarks = Array(tracks.marks.length);
  let drawnVersion = -1;
  return {
    mesh,
    sync() {
      const changed = tracks.version !== drawnVersion;
      for (let i = 0; i < tracks.marks.length; i++) {
        const mark = tracks.marks[i]; opacity.setX(i, mark?.opacity || 0);
        if (!changed || drawnMarks[i] === mark) continue;
        drawnMarks[i] = mark;
        if (mark) {
          normal.set(mark.normal?.x || 0, mark.normal?.y ?? 1, mark.normal?.z || 0).normalize();
          position.set(mark.x, mark.y, mark.z).addScaledVector(normal, .014);
          rotation.setFromAxisAngle(up, mark.angle);
          slope.setFromUnitVectors(up, normal).multiply(rotation);
          scale.set(mark.kind === 'human' ? .22 : .28, 1, mark.kind === 'human' ? .38 : .64);
          matrix.compose(position, slope, scale);
          kind.setX(i, mark.kind === 'human' ? 0 : mark.side < 0 ? 1 : 2);
        } else matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, matrix);
      }
      opacity.needsUpdate = true;
      if (changed) { mesh.instanceMatrix.needsUpdate = true; kind.needsUpdate = true; drawnVersion = tracks.version; }
    },
  };
}
