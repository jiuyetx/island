// Render the production art in a separate fixture, without accessing game saves.
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';
const main = await readFile('src/main.js', 'utf8');
const start = main.indexOf('new THREE.ShaderMaterial({', main.indexOf('const water = mesh('));
const end = main.indexOf('}), 0, -0.02', start);
if (start < 0 || end < 0) throw new Error('Production ocean material not found');
const material = main.slice(start, end + 2);
const palette = main.match(/const C = (\{[\s\S]*?\n\});/)[1];
await build({ entryPoints: ['tools/island-art-preview.js'], bundle: true, format: 'esm',
  loader: { '.glb': 'binary' }, outfile: 'dist/web/island-art-preview.js', plugins: [{
    name: 'production-water', setup(build) {
      build.onResolve({ filter: /^production-water$/ }, () => ({ path: 'ocean', namespace: 'water' }));
      build.onLoad({ filter: /.*/, namespace: 'water' }, () => ({ resolveDir: resolve('src'), contents: `
        import * as THREE from 'three';
        import { COAST_SWASH_GLSL } from './coastSwash.js';
        import { coastlineShaderRadius,islandCoastlineShaderRadius } from './coastline.js';
        import { ISLANDS } from './voyage.js';
        import { BOAT_MOOR } from './boat.js';
        const C=${palette}; export default ${material};` }));
    },
  }] });
await writeFile('dist/web/island-art-preview.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
  <title>群岛建模对照 · 无存档</title><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{margin:0;background:#075c78;color:#fff6da;font:14px system-ui}canvas{display:block;width:100vw;height:100vh}
  aside{position:fixed;top:16px;left:16px;padding:14px;background:#063d4de8;border:1px solid #ead6a1;border-radius:12px;max-width:calc(100vw - 60px)}
  button,input{font:inherit;margin:4px;padding:8px;color:#fff6da;background:#286b69;border:1px solid #99b9a0;border-radius:6px}
  output{display:block;margin-top:6px;color:#c5ddd3;font-size:12px}button[aria-pressed=true]{background:#9d7638}</style>
  <canvas></canvas><aside><strong>群岛建模对照 · 独立预览，不读取存档</strong><br>
  <button data-island="home">主岛参考</button><button data-island="spring">泉眼岛</button>
  <button data-island="grove">椰林岛</button><button data-island="ruins">遗迹岛</button><button data-island="beacon">灯塔岛</button><br>
  <label>视角 <input type="range" aria-label="视角" min="-3.14" max="3.14" step=".05" value="-.72"></label>
  <button id="labels" aria-pressed="false">显示资源标识</button><output>加载真实游戏模型…</output></aside>
  <script type="module" src="island-art-preview.js"></script></html>`);
console.log('Independent fixture: /island-art-preview.html');
