# 海岛游戏交接摘要（2026-10-01）

## 新对话当前任务

用户要求：在屋内点击床位，可以开始休息、恢复体力。请直接实现并验证，不只给方案。

现有小屋已经有床模型；目前休息主要依赖 HUD 的「在小屋休息」，床尚未接入可靠的场景交互。优先复用床和现有休息流程，不另做独立恢复系统。只有人在屋内才可使用床，人物应走到床边再躺下；显示逐步休息和体力恢复，完成后恢复正常站立/操作。重复点击不能叠加恢复。门未关闭、饱腹不足或其他不允许休息情况，给人物附近明确提示。保留现有食物/淡水限制、昼夜规则和存档，不要回到瞬间跳到 06:00 或免费满体力的行为。

## 工作区与约束

- 仓库：`/Users/lyf/.codex/.chatgpt-projects/g-p-6aafee4b8da88191853aef0a69bf506a/island-three`。
- 父项目的 `sources/` 是只读同步参考，不能编辑、移动或删除。
- 工作树有大量未提交改动和未跟踪文件，都是当前成果，必须保留；不要 reset/clean、覆盖 GLB 或丢弃旧改动。
- 使用 apply_patch 编辑源文件。没有必要创建新 worktree。
- 本次只做本地实现。未经新授权不要 push、部署、修改 GitHub/Cloudflare/Google 配置。
- 之前允许过协作，但当前不要默认启动 subagent。

## 项目现状与对话脉络

这是 Three.js 海岛生存/养成游戏，同时构建浏览器与微信小游戏版本，用户持续要求自然场景与可直接点击的世界交互。

当前代码包括：

- 生存与经营：体力、饱腹、淡水收集/储水/喝水、作物种植浇水收获、伐木种树养护、背包/仓库/装备和物品图标、码头购入卖出、木材抢修、防灾安装与台风结算。
- 航海：可以驾驶小船探索有限群岛海域，登陆、资源点、返航与存档；不是无限世界。
- 钓鱼：抛竿、浮漂、咬钩、提竿和收线力度交互，后续已降低操作难度。
- 烹饪：多种菜谱、菜谱升级、食材消耗、成品与营养恢复。
- 角色与生态：圆润原创居民 GLB、独立四肢/眼睛及工作游泳动作；鱼类纹理与不规则游动；沙蟹横行、八条腿动画和无序运动。
- 自然场景：不规则海岸、颗粒/湿沙材质、上岸浪花与回流；人物和沙蟹在沙滩留下痕迹，反复冲浪后逐渐抹去；稀疏灌木、重做的椰树和植被；码头/小船/人物避让与正确落地。
- 小屋：显式开门、进入、关门避险、开门、出屋；室内屋顶切开。已经修复进屋后不能关门和打开门不能出屋，室内关门后控制面板保留。门口椰树已经挪走，不要移回。
- Google 登录 UI 已存在；历史中用户要求 GitHub 公共仓库与 Cloudflare 域名 `island.dailysnake.com`，本交接未核实当前线上状态，不要把本地改动误报为已发布。

## 最后一轮已完成：昼夜与台风暴雨

- 新模块 `src/environment.js`：连续日照曲线，18:00 后日光归零，夜间弱月光，云层遮光；雨滴在随视角移动的范围内循环，不随运行时间飘出画面。
- `src/environmentVisual.js`：动态太阳/月亮/环境散射光，渐变天色与雾，斜向暴雨和地面/水面雨滴涟漪，小屋内部遮雨；移动端减少雨滴数量。
- `src/main.js` 海水同步变暗并添加冷色月光反射，移除旧的恒定白天环境光和海水 42% 夜间亮度下限；视觉效果不推进游戏时钟。
- `tests/environment.test.mjs` 已接入 npm test；现有全部测试、web/微信构建和 git diff --check 均通过。
- 实际浏览器已检查台风暴雨，没有 JS/WebGL 报错；夜景在独立渲染预览验证，未通过脚本修改玩家存档或强行改变天气/时间。
- 截图及说明：`artifacts/environment/`。预览工具 `tools/environment-preview.mjs` 与 `.js` 复用真实 GLB 和生产海水材质，不读写存档，也不包含在默认发布构建中。

## 床位休息的代码入口

- `tools/blender_generate.py` 已定义 `Hut_BedBase`、`Hut_BedQuilt`、`Hut_BedPillow`、`Hut_BedLeg`（约 470 行），实际建筑模型来自 `Hut_Source`。
- `src/main.js` 的 `buildVisual()` 克隆小屋模型（约 2350 行），这里可查床节点并注册专用点击区域。不要让遮挡的墙/屋顶或交互拾取逻辑吞掉床位点击。
- `src/main.js` 的 `handleHudAction('activity-rest')`（约 3635 行）目前检查 inside/doorOpen、饱腹和 planRest，再调用 `completeArrival({ type:'rest', requestedKind:... })`。
- `completeArrival()` 的 rest 分支（约 2560 行）设置 `restTransition`、busyAction、恢复上限；`updateRestTransition()`（约 2840 行）逐步推进时间/体力，结束消耗营养并保存。
- `src/rest.js` 的 `planRest()`：白天最多 90 游戏分钟小憩，夜间到下一次 06:00，保留台风预警限制；`src/economy.js` 的 restRecoveryCap/consumeRestNutrition 控制食物与淡水约束。
- 注意 `completeArrival()`、角色移动和 pick() 有 busy/storm/inside 分支；床位接入应复用一致的前置检查，禁止被静默阻断或绕过营养门槛。
- `src/hut.js`：hutDoorIntent、hutControls、keepHutControlsOpen、createHutCrossing/stepHutCrossing。床休息不要破坏开关门/出入。
- 人物动作在 `src/main.js` 和 `src/avatarMotion.js`，不必为床交互重新生成全部资产。

## 构建与验收

1. 阅读相关源文件，确认床节点和室内移动/拾取逻辑；实现床点击、床边到位、休息动作与完成清理。
2. 补回归测试：屋外不能使用、门/营养限制、重复点击、逐步恢复、完成后人物归位，以及已有开关门/出屋回归。
3. `npm test && npm run build && git diff --check`。build 会重建 `dist/web` 和 `dist/wechat`。
4. 本地现有 Python 服务 URL：`http://127.0.0.1:42937/`，服务目录 `dist/web`。构建后刷新原游戏页即可，不需新开服务器。
5. 浏览器只通过正常可见 UI 操作测试；不要注入或读写隐藏游戏状态、localStorage 或绕过游戏流程。保留用户页，关闭临时验证页；保存点击床位的截图及验证记录。
6. 需要浏览器验证时按可用的 agent-browser 技能执行；本机 CLI 不可用时已用 CUA 替代。新对话应重新取得浏览器句柄并读取工具说明，旧 REPL 变量不要当作跨对话可用。
7. 最终中文简述实现与验证边界，不把构建通过当成微信真机验收，也不要声称已部署。
