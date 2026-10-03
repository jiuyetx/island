import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEnvironment } from '../src/environmentVisual.js';
import { stepRoamer } from '../src/seaEcology.js';
import { createIslandArt, animateIslandArt } from '../src/voyageArt.js';
import { ISLANDS } from '../src/voyage.js';
import { createMainFish } from 'production-fish';
import ocean from 'production-water';
import vegetationGlb from '../assets/generated/tropical-vegetation.glb';
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.98;
const scene=new THREE.Scene(); scene.background=new THREE.Color(); scene.fog=new THREE.FogExp2();
const camera=new THREE.OrthographicCamera();
const water=new THREE.Mesh(new THREE.PlaneGeometry(440,440),ocean); water.rotation.x=-Math.PI/2; water.position.y=-.02; water.renderOrder=2; scene.add(water);
const seabed=new THREE.Mesh(new THREE.PlaneGeometry(440,440),new THREE.MeshStandardMaterial({color:0x188b98}));
seabed.rotation.x=-Math.PI/2; seabed.position.y=-1.7; scene.add(seabed);
const bytes=vegetationGlb, plants=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
const uniforms=[], schools=createMainFish(scene,plants,uniforms);
const assets=Object.fromEntries(Object.entries({fish:'Fish_A_Source',rock:'Rock_Source',coral:'Reef_Staghorn_Source',seaGrass:'Sea_Grass_Source'}).map(([key,name])=>[key,plants.getObjectByName(name)]));
const island=ISLANDS[0], art=createIslandArt({island,assets,label:()=>new THREE.Object3D(),surfUniforms:ocean.uniforms}); scene.add(art.root,art.buoy);
const overlap=new THREE.Group();scene.add(overlap);
const source=plants.getObjectByName('Fish_A_Source');
for(let i=0;i<2;i++){const fish=source.clone(true);fish.traverse(o=>{if(o.isMesh){o.material=schools[i].school.inst.material;}});
  fish.position.set(21+i*.15,-.60-i*.34,.10-i*.35);fish.scale.setScalar(1.8);fish.rotation.y=i*Math.PI/2;overlap.add(fish);}
let view='home', paused=false, previous=0, age=0;
const environment=createEnvironment(scene,{heightAt:()=>-1.7});
function resize(){const size=view==='overlap'?3.7:view==='reef'?7:9;renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));
  camera.left=-size*innerWidth/innerHeight;camera.right=-camera.left;camera.top=size;camera.bottom=-size;camera.near=.1;camera.far=500;camera.updateProjectionMatrix();
  const focus=view==='reef'?{x:island.x+island.radius+5.8,z:island.z}:{x:21,z:0};camera.position.set(focus.x+18,25,focus.z-18);camera.lookAt(focus.x,-.7,focus.z);}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;resize();}));
document.getElementById('pause').addEventListener('click',()=>{paused=!paused;document.getElementById('pause').textContent=paused?'继续游动':'暂停游动';});
addEventListener('resize',resize);resize();
const dummy=new THREE.Object3D();
function frame(ms){const dt=previous?Math.min(.1,(ms-previous)/1000):0;previous=ms;if(!paused)age+=dt;
  const light=environment.update(12,'calm',age,dt,undefined,water.position.y);
  Object.assign(ocean.uniforms.uDaylight,{value:light.waterLight});ocean.uniforms.uSunlight.value=light.sunlight;ocean.uniforms.uMoonlight.value=light.moonlight;
  ocean.uniforms.uTime.value=age;ocean.uniforms.uSunDirection.value.copy(environment.sun.position).sub(environment.sun.target.position).normalize();
  uniforms.forEach(u=>{u.value=age;});
  const peers=schools.flatMap(item=>item.school.data.map(f=>f.roamer));
  for(const {school} of schools){school.inst.visible=view==='home';school.data.forEach((f,i)=>{stepRoamer(f.roamer,paused?0:dt,peers);
    dummy.position.set(f.roamer.x,f.y+Math.sin(age*.85+f.bob)*f.bobble,f.roamer.z);dummy.rotation.set(0,-f.roamer.heading,0);dummy.scale.setScalar(f.size);dummy.updateMatrix();school.inst.setMatrixAt(i,dummy.matrix);});school.inst.instanceMatrix.needsUpdate=true;}
  art.root.visible=art.buoy.visible=view==='reef';if(view==='reef')animateIslandArt(art,age,water.position.y,{x:island.x,z:island.z},paused?0:dt);
  overlap.visible=view==='overlap';renderer.render(scene,camera);
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  document.querySelector('output').textContent=`正午 · ${view==='home'?'真实主岛鱼群':view==='reef'?'真实外岛鱼群':'两鱼交叉遮挡'} · ${paused?'暂停':'游动'}`;requestAnimationFrame(frame);}
requestAnimationFrame(frame);
