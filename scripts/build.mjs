import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/web', { recursive: true });
await mkdir('dist/wechat', { recursive: true });

const shared = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  target: 'es2018',
  legalComments: 'none',
  loader: { '.glb': 'binary' },
};

await build({ ...shared, sourcemap: true, outfile: 'dist/web/main.js', format: 'iife', platform: 'browser' });
await build({ ...shared, sourcemap: false, outfile: 'dist/wechat/game.js', format: 'iife', platform: 'browser' });
const webBundle = await readFile('dist/web/main.js');
const bundleHash = createHash('sha256').update(webBundle).digest('hex').slice(0, 12);
const webHtml = await readFile('web/index.html', 'utf8');
await writeFile('dist/web/index.html', webHtml.replace('src="main.js"', `src="main.js?v=${bundleHash}"`));
for (const directory of ['dist/web/assets/generated', 'dist/wechat/assets/generated']) {
  await mkdir(directory, { recursive: true });
  await cp('assets/generated/tropical-atlas.webp', `${directory}/tropical-atlas.webp`);
  await cp('assets/generated/tropical-atlas.png', `${directory}/tropical-atlas.png`);
}
await cp('wechat/game.json', 'dist/wechat/game.json');
await cp('wechat/project.config.json', 'dist/wechat/project.config.json');
console.log('built dist/web and dist/wechat');
