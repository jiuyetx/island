// Independent rendering fixture; never loads or writes player saves.
// Extract the production ocean material so its night shader is tested too.
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';
const main = await readFile('src/main.js', 'utf8');
const start = main.indexOf('new THREE.ShaderMaterial({', main.indexOf('const water = mesh('));
const end = main.indexOf('}), 0, -0.02', start);
if (start < 0 || end < 0) throw new Error('Production ocean material not found');
const material = main.slice(start, end + 2);
const palette = main.match(/const C = (\{[\s\S]*?\n\});/)[1];
await build({ entryPoints: ['tools/environment-preview.js'], bundle: true, format: 'esm',
  loader: { '.glb': 'binary' }, outfile: 'dist/web/environment-preview.js', plugins: [{
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
await writeFile('dist/web/environment-preview.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
  <title>昼夜与风雨渲染验证 · 无存档</title><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{margin:0;background:#030916;color:#eef6ff;font:14px system-ui}canvas{display:block;width:100vw;height:100vh}
  aside{position:fixed;top:16px;left:16px;padding:16px;background:#041726e6;border:1px solid #97b0c8;border-radius:12px}
  button,select{font:inherit;margin:5px;padding:9px;color:#eef6ff;background:#294255;border:1px solid #94b2bd;border-radius:6px}
  output{display:block;margin-top:10px;color:#c5d7e1}</style>
  <canvas></canvas><aside><strong>独立光照验证 · 不读取或修改存档</strong><br>
  <button data-hour="12">正午 12:00</button><button data-hour="17.5">日落前 17:30</button>
  <button data-hour="19.5">月光 19:30</button><button data-hour="0">午夜 00:00</button><br>
  <label>天气 <select aria-label="天气"><option value="calm">晴朗</option><option value="preparing">台风将至</option><option value="impact">台风暴雨</option></select></label>
  <output>正在加载真实游戏模型…</output></aside><script type="module" src="environment-preview.js"></script></html>`);
console.log('Independent fixture: /environment-preview.html');
