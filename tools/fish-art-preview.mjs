// Isolated art fixture: actual fish setup and sea shader, no gameplay or saves.
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';
const main = await readFile('src/main.js', 'utf8');
const start = main.indexOf('new THREE.ShaderMaterial({', main.indexOf('const water = mesh('));
const end = main.indexOf('}), 0, -0.02', start);
const setupStart = main.indexOf('  const fishMaterial = (pattern) =>');
const setupEnd = main.indexOf('  const crabSource =', setupStart);
const schoolStart = main.indexOf('function addSchool('), schoolEnd = main.indexOf('\nasync function loadSceneAssets()', schoolStart);
const jack = main.match(/  addSchool\(reefSource\('Sea_SilverJack'\)[\s\S]*?\);/);
if ([start, end, setupStart, setupEnd, schoolStart, schoolEnd].some(n => n < 0) || !jack) throw new Error('Production fish setup not found');
const palette = main.match(/const C = (\{[\s\S]*?\n\});/)[1];
await build({ entryPoints: ['tools/fish-art-preview.js'], bundle: true, format: 'esm', loader: { '.glb': 'binary' },
  outfile: 'dist/web/fish-art-preview.js', plugins: [{ name: 'production-fish-art', setup(build) {
    build.onResolve({ filter: /^production-(water|fish)$/ }, args => ({ path: args.path, namespace: 'art' }));
    build.onLoad({ filter: /.*/, namespace: 'art' }, args => ({ resolveDir: resolve('src'), contents: args.path === 'production-water' ? `
      import * as THREE from 'three'; import { COAST_SWASH_GLSL } from './coastSwash.js';
      import { coastlineShaderRadius,islandCoastlineShaderRadius } from './coastline.js';
      import { ISLANDS } from './voyage.js'; import { BOAT_MOOR } from './boat.js';
      const C=${palette}; export default ${main.slice(start, end + 2)};` : `
      import * as THREE from 'three'; import { createRoamer } from './seaEcology.js';
      ${main.match(/import .* from '\.\/fishVisual\.js';/)?.[0] || ''}
      export function createMainFish(scene, plants, animatedShaderUniforms) {
        const animated=[], marineTargets=[], interactive=[], fishRoamers=[];
        const marineHitGeometry=new THREE.SphereGeometry(.01,4,3);
        const marineHitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
        const actionRoot=o=>o, reefSource=name=>plants.getObjectByName(name+'_Source');
        ${main.slice(schoolStart, schoolEnd)}
        ${main.slice(setupStart, setupEnd)}
        ${jack[0]}
        return animated;
      }` }));
  } }] });
await writeFile('dist/web/fish-art-preview.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>鱼群画面对照 · 独立预览</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#075c78;color:#fff6da;font:14px system-ui}canvas{display:block;width:100vw;height:100vh}
aside{position:fixed;top:16px;left:16px;padding:14px;background:#063d4de8;border:1px solid #ead6a1;border-radius:12px}
button{font:inherit;margin:4px;padding:8px;color:#fff6da;background:#286b69;border:1px solid #99b9a0;border-radius:6px}
button[aria-pressed=true]{background:#9d7638}output{display:block;margin-top:6px;color:#c5ddd3;font-size:12px}</style>
<canvas></canvas><aside><strong>鱼群材质与间距 · 不读取存档</strong><br>
<button data-view="home">主岛鱼群</button><button data-view="reef">外岛鱼群</button><button data-view="overlap">遮挡检查</button>
<button id="pause">暂停游动</button><output>加载真实鱼模型…</output></aside><script type="module" src="fish-art-preview.js"></script></html>`);
console.log('Independent fixture: /fish-art-preview.html');
