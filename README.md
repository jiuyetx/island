# 潮汐小岛

一个 Three.js 微信小游戏切片：采集漂流木/贝壳，建设菜园、小屋和码头，建筑会持续产出资源并自动存档。

场景使用 Blender 导出的 geometry-only GLB、烘焙 AO 顶点色和单张纹理图集。图集为各材质加入颗粒、木纹、泥灰、叶脉和水纹细节，优先加载 WebP、失败回退 PNG；棕榈、灌木、岩石和珊瑚使用 `InstancedMesh`。水面是程序化着色器，浪花沿不规则岸线动画。

## 本地预览

```bash
npm install
npm test
npm run build
npm run preview
```

打开 <http://localhost:4173>。单指/鼠标拖动环岛，双指缩放，点击资源和金色圆台交互。

## Cloudflare Pages 部署

- 生产分支：`main`
- 构建命令：`npm run build`
- 输出目录：`dist/web`
- 自定义域名：<https://island.dailysnake.com>

Cloudflare Pages 连接 GitHub 仓库后，推送到 `main` 会自动触发生产部署。

## 微信开发者工具

1. 先运行 `npm run build`。
2. 导入 `dist/wechat`；工程已配置小游戏 AppID `wx721e5443b52c3074`。
3. 选择横屏，编译后测试触摸、存档和前后台切换。
4. 真机至少覆盖一台 iPhone 和一台中低端 Android，再判断是否进入美术资源生产。

## 重新生成美术资产

图集由 `tools/build_atlas.py` 生成（只需 Pillow，不依赖 Blender）：

```bash
python3 tools/build_atlas.py
```

GLB 几何仍由 Blender 导出（需要可用的 Metal/GPU 后端）：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender_generate.py
```

## 验收边界

- 已实现：共用 Three.js 场景、Blender GLB 海岛/建筑、AO 图集、实例化植被、程序化水面、采集建造循环、浏览器与微信构建产物。
- `npm test` / `npm run build` 只证明逻辑和打包，不等于微信运行通过。
- 开发者工具预览、真机帧率/发热/内存、上传和发布必须分别验收。

KTX2 暂未接入微信端：Three.js 的 KTX2 解码器依赖浏览器 Blob Worker，需先做微信 Worker/WASM 适配并完成真机验证。SSR、SSAO、Bloom 和物理系统仍未加入。
