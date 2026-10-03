import * as THREE from 'three';
import { offscreen } from './platform.js';
import { BOAT_MOOR } from './boat.js';
import { ISLANDS, PORTS, autopilotInput, landingPoint, normalizeVoyage, planSeaRoute, stepHelm, harvestIsland } from './voyage.js';
import { createIslandArt, animateIslandArt, islandWalkPoint, islandTerrainHeight as terrainHeight } from './voyageArt.js';
import { voyageSupplies } from './playerGuidance.js';


// Canvas HUD keeps mouse/touch and the WeChat build on the same interaction model.
export function createVoyageScene({ scene, hudScene, state, interactive, getAvatar, getBoat, flash, save,
  boardFromHome, onHome, closeHud, isBlocked, isHudOpen, useSupply, palmSource, artAssets, getScreen, surfUniforms }) {
  state.voyage = normalizeVoyage(state.voyage);
  const v = state.voyage;
  const remoteGround = [], islandArt = [], nodes = new Map(), keys = new Set();
  let mapOpen = false, selectedId = 'spring', route = [], destinationId = null;
  let pendingStartDestination = null;
  let walkTarget = null, pendingGather = null, pendingDeparture, hold = null, age = 0, paintAt = -1, collisionAt = -10;
  const chartCanvas = offscreen(600, 710), helmCanvas = offscreen(720, 330);
  const chartTexture = new THREE.CanvasTexture(chartCanvas), helmTexture = new THREE.CanvasTexture(helmCanvas);
  chartTexture.colorSpace = THREE.SRGBColorSpace; helmTexture.colorSpace = THREE.SRGBColorSpace;
  const chart = new THREE.Sprite(new THREE.SpriteMaterial({ map: chartTexture, depthTest: false }));
  const helm = new THREE.Sprite(new THREE.SpriteMaterial({ map: helmTexture, depthTest: false }));
  chart.center.set(0, 1); helm.center.set(0, 1); hudScene.add(chart, helm);
  let chartRect, helmRect, chartButtons = [], helmButtons = [];
  const label = (text, parent, x, y, z, width = 2.5) => {
    const c = offscreen(384, 72), ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(18,61,64,.9)'; ctx.fillRect(0, 0, 384, 72); ctx.strokeStyle = '#ead3a3'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 380, 68);
    ctx.fillStyle = '#fff2cc'; ctx.font = '700 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 192, 48);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    sprite.position.set(x, y, z); sprite.scale.set(width, width * .1875, 1); parent.add(sprite); return sprite;
  };
  for (const island of ISLANDS) {
    const art = createIslandArt({ island, assets: { ...artAssets, palm: palmSource }, label, surfUniforms });
    islandArt.push(art); scene.add(art.root, art.buoy); remoteGround.push(art.terrain);
    const { resource, buoy, drift } = art;
    buoy.userData.action = { type: 'voyage-port', islandId: island.id }; interactive.push(buoy);
    resource.userData.action = { type: 'voyage-gather', islandId: island.id, node: 'main' };
    interactive.push(resource); nodes.set(`${island.id}-main`, resource);
    drift.userData.action = { type: 'voyage-gather', islandId: island.id, node: 'wood' }; interactive.push(drift); nodes.set(`${island.id}-wood`, drift);
  }
  function stopWalk() { walkTarget = null; pendingGather = null; pendingDeparture = undefined; }
  function board() {
    if (state.boatDurability <= 0 || state.boatTier === 'wreck') { flash('船只已损坏，先在码头修复'); return false; }
    v.mode = 'sailing'; v.islandId = null; v.speed = 0; state.boatMoored = false;
    if (getAvatar()) getAvatar().visible = true;
    stopWalk(); closeHud(); save(state); paintAt = -1;
    flash('已登船 · WASD 驾驶，或点海面航行；海图可规划航线');
    if (pendingStartDestination) {
      const destination = pendingStartDestination; pendingStartDestination = null;
      setDestination(destination);
    }
    return true;
  }
  function setDestination(id) {
    if (v.mode !== 'sailing') { flash('先在码头登船，再选择航线'); return; }
    const island = PORTS.find(i => i.id === id);
    const planned = planSeaRoute(v, landingPoint(island));
    if (!planned.length) { flash('航路受阻，请手动驶离岸边再试'); return; }
    route = planned; destinationId = id; mapOpen = false; closeHud(); paintAt = -1;
    flash(`航向 ${island.name} · 自动避开陆地，WASD 可接管`);
  }
  function walkBackToBoat(nextDestination = null) {
    walkTarget = landingPoint(ISLANDS.find(i => i.id === v.islandId), true);
    pendingDeparture = nextDestination; pendingGather = null; mapOpen = false; closeHud();
    flash('正在走回登陆点 · 到达后登船');
  }
  function dock() {
    if (v.mode === 'ashore') { walkBackToBoat(); return; }
    if (v.mode !== 'sailing') { boardFromHome(); return; }
    const port = PORTS.find(i => Math.hypot(v.x - landingPoint(i).x, v.z - landingPoint(i).z) < 4.5);
    if (!port) { flash('靠近岛屿黄色浮标（4.5 米内），再靠岸下船'); return; }
    if (v.speed > 1.5) { flash('先松开油门或按 S 减速，再安全靠岸'); return; }
    route = []; destinationId = null; v.speed = 0;
    const position = landingPoint(port); v.x = position.x; v.z = position.z;
    if (port.id === 'home') {
      v.mode = 'home'; v.islandId = null; state.boatMoored = true; stopWalk(); onHome();
      flash('已回到家园码头 · 可交易、补给或休息');
    } else {
      v.mode = 'ashore'; v.islandId = port.id;
      if (!v.visited.includes(port.id)) v.visited.push(port.id);
      const land = landingPoint(port, true); v.walkX = land.x; v.walkZ = land.z;
      getAvatar().position.set(land.x, terrainHeight(port, land.x, land.z) + .02, land.z);
      flash(`抵达${port.name} · 点击资源采集，点地面步行，登船继续探索`);
    }
    save(state); paintAt = -1;
  }
  function command(id) {
    if (isBlocked() && !['map', 'close', 'blank'].includes(id) && !id.startsWith('select:')) { flash('请先完成当前动作；休息时可查看海图'); return; }
    if (id === 'map') { mapOpen = !mapOpen; closeHud(); }
    else if (id === 'close') mapOpen = false;
    else if (id.startsWith('select:')) selectedId = id.slice(7);
    else if (id === 'sail') {
      if (v.mode === 'home') {
        mapOpen = false; pendingStartDestination = selectedId;
        if (!boardFromHome()) pendingStartDestination = null;
      }
      else if (v.mode === 'ashore') walkBackToBoat(selectedId);
      else setDestination(selectedId);
    } else if (id === 'dock') dock();
    else if (id === 'stop') { route = []; destinationId = null; keys.clear(); hold = null; stopWalk(); }
    else if (id === 'home') { if (v.mode === 'ashore') walkBackToBoat('home'); else if (v.mode === 'sailing') setDestination('home'); }
    else if (id === 'drink' || id === 'meal') useSupply(id);
    else if (id === 'rescue') {
      if (v.mode === 'home') return;
      // Explicit recovery only, never triggered by fatigue or ordinary navigation.
      state.gold = Math.max(0, state.gold - 20); v.mode = 'home'; v.islandId = null; v.x = BOAT_MOOR.x; v.z = BOAT_MOOR.z; v.speed = 0;
      route = []; destinationId = null; stopWalk(); state.boatMoored = true; onHome(); save(state);
      flash('救援船已送回家园 · 支付最多 20 金，物品保留，船需维修');
    }
    paintAt = -1; paint();
  }
  function paint() {
    const screen = getScreen(), narrow = screen.width < 600;
    const helmHeight = narrow ? 440 : 330;
    if (helmCanvas.height !== helmHeight) helmCanvas.height = helmHeight;
    const width = Math.min(narrow ? screen.width - 20 : 350, screen.height * .57);
    chartRect = { x: narrow ? (screen.width - width) / 2 : screen.width - width - 16, y: narrow ? 118 : 82, width, height: width * 710 / 600 };
    const helmWidth = Math.min(narrow ? screen.width - 16 : 420, screen.height * .85);
    helmRect = { x: narrow ? (screen.width - helmWidth) / 2 : 16, y: screen.height - helmWidth * helmHeight / 720 - (screen.width < 1000 ? 86 : 18), width: helmWidth, height: helmWidth * helmHeight / 720 };
    chart.scale.set(width, chartRect.height, 1); chart.position.set(chartRect.x, screen.height - chartRect.y, .1); chart.visible = mapOpen;
    helm.scale.set(helmWidth, helmRect.height, 1); helm.position.set(helmRect.x, screen.height - helmRect.y, .1); helm.visible = v.mode !== 'home' && !mapOpen && !isHudOpen();
    const ctx = chartCanvas.getContext('2d'); ctx.clearRect(0, 0, 600, 710); ctx.fillStyle = 'rgba(6,37,46,.97)'; ctx.fillRect(0, 0, 600, 710);
    ctx.strokeStyle = '#ceb37c'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, 594, 704);
    ctx.fillStyle = '#fff1cb'; ctx.font = '700 28px sans-serif'; ctx.fillText('风帆群岛 · 海图', 24, 40);
    ctx.font = '20px sans-serif'; ctx.fillStyle = '#a9cdc7'; ctx.fillText(`已发现 ${v.discovered.length - 1}/4 · 已登陆 ${v.visited.length - 1}/4`, 24, 69);
    const mx = 300, my = 273, scale = 1.62;
    const mapPoint = (p) => ({ x: mx + p.x * scale, y: my + p.z * scale });
    ctx.fillStyle = '#134957'; ctx.fillRect(22, 89, 556, 346);
    ctx.strokeStyle = '#2d6470'; ctx.lineWidth = 1;
    for (let x = 30; x < 578; x += 40) { ctx.beginPath(); ctx.moveTo(x, 89); ctx.lineTo(x, 435); ctx.stroke(); }
    for (let y = 100; y < 435; y += 40) { ctx.beginPath(); ctx.moveTo(22, y); ctx.lineTo(578, y); ctx.stroke(); }
    ctx.fillStyle = '#98b9b7'; ctx.font = '16px sans-serif'; ctx.fillText('N ↑', 535, 112); ctx.fillText('点击岛屿，选择航向', 34, 420);
    chartButtons = [];
    for (const island of PORTS) {
      const p = mapPoint(island), known = v.discovered.includes(island.id);
      ctx.fillStyle = known ? island.color : '#577c7b'; ctx.beginPath(); ctx.ellipse(p.x, p.y, island.radius * scale, island.radius * scale * .85, 0, 0, Math.PI * 2); ctx.fill();
      if (selectedId === island.id) { ctx.strokeStyle = '#ffde89'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#fff0d2'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(known ? island.name : '未知岛屿', p.x, p.y + 35);
      chartButtons.push({ id: `select:${island.id}`, x: p.x - 39, y: p.y - 39, w: 78, h: 82 });
    }
    ctx.textAlign = 'start';
    if (route.length) {
      const current = mapPoint(v); ctx.strokeStyle = '#f8db85'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(current.x, current.y);
      route.forEach(p => { const point = mapPoint(p); ctx.lineTo(point.x, point.y); }); ctx.stroke(); ctx.setLineDash([]);
    }
    const p = mapPoint(v); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI - v.heading);
    ctx.fillStyle = '#fff0bb'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-6, 7); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
    const selected = PORTS.find(i => i.id === selectedId);
    ctx.fillStyle = '#ffe5a6'; ctx.font = '700 25px sans-serif'; ctx.fillText(selected.name, 26, 479);
    ctx.font = '20px sans-serif'; ctx.fillStyle = '#c2d9d1'; ctx.fillText(selected.description || '交易、休息、维修和农田都在家园', 26, 511);
    const port = landingPoint(selected); ctx.fillText(`距离 ${Math.round(Math.hypot(port.x - v.x, port.z - v.z))} 米 · 小木船即可探索`, 26, 541);
    function button(context, list, id, text, x, y, w, h = 56, color = '#287870') {
      context.fillStyle = color; context.fillRect(x, y, w, h); context.fillStyle = '#fff3d3'; context.font = '700 22px sans-serif'; context.textAlign = 'center'; context.fillText(text, x + w / 2, y + h / 2 + 8, w - 8); context.textAlign = 'start'; list.push({ id, x, y, w, h });
    }
    button(ctx, chartButtons, 'close', '×', 526, 16, 48, 48, '#99703c');
    button(ctx, chartButtons, 'sail', v.mode === 'home' ? '前往码头登船' : '沿航线前往', 24, 568, 552, 60, '#a37b3a');
    const supplies = voyageSupplies(state);
    ctx.font = '17px sans-serif'; ctx.fillStyle = '#c2d9d1'; ctx.fillText(supplies.summary, 26, 650, 550);
    ctx.fillStyle = '#9cbbb6'; ctx.fillText(supplies.advice, 26, 681, 550);
    const h = helmCanvas.getContext('2d'); h.clearRect(0, 0, 720, helmHeight); h.fillStyle = 'rgba(6,37,46,.95)'; h.fillRect(0, 0, 720, helmHeight); h.strokeStyle = '#9caa85'; h.strokeRect(2, 2, 716, helmHeight - 4);
    h.fillStyle = '#fff0cf'; h.font = '700 26px sans-serif';
    const island = ISLANDS.find(i => i.id === v.islandId);
    h.fillText(v.mode === 'ashore' ? `${island.name} · 徒步探索` : `${destinationId ? `航向 ${PORTS.find(i => i.id === destinationId).name}` : '自由航行'} · ${v.speed.toFixed(1)} m/s`, 20, 36);
    h.fillStyle = '#bbd5ce'; h.font = '19px sans-serif';
    h.fillText(`船体 ${Math.round(state.boatDurability)}/100 · 水壶 ${state.freshwater.canteen}L · 累计 ${Math.round(v.distance)} 米`, 20, 66);
    h.fillText(v.mode === 'ashore' ? '点地面行走 · 点资源采集 · 登船继续闯荡' : 'W / ↑ 前进 · A D 转向 · S / ↓ 减速 · 点海面航行', 20, 96);
    helmButtons = [];
    const firstY = narrow ? 126 : 118, secondY = narrow ? 228 : 202, thirdY = narrow ? 330 : 276;
    const controlHeight = narrow ? 88 : 64, actionHeight = narrow ? 88 : 56, supplyHeight = narrow ? 80 : 38;
    if (v.mode === 'sailing') {
      button(h, helmButtons, 'left', '↶ 左转', 20, firstY, 155, controlHeight);
      button(h, helmButtons, 'forward', '↑ 前进', 195, firstY, 155, controlHeight);
      button(h, helmButtons, 'right', '右转 ↷', 370, firstY, 155, controlHeight);
      button(h, helmButtons, 'brake', '↓ 减速', 545, firstY, 155, controlHeight, '#695b52');
    } else h.fillText('泉眼岛补水 / 椰林岛补食 / 遗迹寻宝 / 灯塔寻种', 20, 157);
    button(h, helmButtons, 'map', '海图', 20, secondY, 150, actionHeight);
    button(h, helmButtons, 'dock', v.mode === 'ashore' ? '重新登船' : '靠岸下船', 188, secondY, 160, actionHeight, '#a37b3a');
    button(h, helmButtons, 'home', '航向家园', 368, secondY, 160, actionHeight);
    button(h, helmButtons, 'stop', '停航', 548, secondY, 152, actionHeight, '#695b52');
    button(h, helmButtons, 'drink', '喝水', 20, thirdY, 145, supplyHeight, '#2b718b');
    button(h, helmButtons, 'meal', '吃饭', 185, thirdY, 145, supplyHeight, '#596b3e');
    button(h, helmButtons, 'rescue', '救援返港 ≤20金', 468, thirdY, 232, supplyHeight, '#76574a');
    chartTexture.needsUpdate = true; helmTexture.needsUpdate = true;
  }
  const buttonAt = (x, y) => {
    const sprite = mapOpen ? chart : helm, rect = mapOpen ? chartRect : helmRect, buttons = mapOpen ? chartButtons : helmButtons;
    if (!sprite.visible || !rect || x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return null;
    const localX = (x - rect.x) / rect.width * (mapOpen ? 600 : 720), localY = (y - rect.y) / rect.height * (mapOpen ? 710 : helmCanvas.height);
    return buttons.find(b => localX >= b.x && localX <= b.x + b.w && localY >= b.y && localY <= b.y + b.h) || { id: 'blank' };
  };
  return {
    remoteGround,
    resize: paint,
    get engaged() { return v.mode !== 'home'; },
    get sailing() { return v.mode === 'sailing'; },
    get ashore() { return v.mode === 'ashore'; },
    get mapOpen() { return mapOpen; },
    get focus() { return v.mode === 'home' ? null : v.mode === 'sailing' ? v : getAvatar()?.position; },
    open() { mapOpen = !mapOpen; closeHud(); paint(); },
    board,
    dismiss() { mapOpen = false; paintAt = -1; },
    resume() {
      if (v.mode === 'ashore') {
        const island = ISLANDS.find(i => i.id === v.islandId);
        const point = islandWalkPoint(island, { x: v.walkX, z: v.walkZ });
        v.walkX = point.x; v.walkZ = point.z;
        getAvatar().position.set(v.walkX, terrainHeight(island, v.walkX, v.walkZ) + .02, v.walkZ);
      }
      state.boatMoored = v.mode === 'home'; paint();
    },
    beginHold(x, y) {
      const b = buttonAt(x, y);
      if (!['forward', 'left', 'right', 'brake'].includes(b?.id)) return false;
      hold = b.id; route = []; destinationId = null; paintAt = -1; return true;
    },
    releaseControls() { hold = null; keys.clear(); },
    endHold() { const held = !!hold; hold = null; return held; },
    tap(x, y) { const b = buttonAt(x, y); if (!b) return false; if (!['forward', 'left', 'right', 'brake', 'blank'].includes(b.id)) command(b.id); return true; },
    key(event, down) {
      if (v.mode !== 'sailing' || !['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key.toLowerCase().startsWith('arrow') ? event.key : event.key.toLowerCase())) return false;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (down) { keys.add(key); route = []; destinationId = null; } else keys.delete(key);
      event.preventDefault(); return true;
    },
    pick(action, point) {
      if (action?.type === 'voyage-port') { if (v.mode === 'sailing') { const port = PORTS.find(i => i.id === action.islandId); selectedId = port.id; setDestination(port.id); } else flash('请先登船'); return true; }
      if (action?.type === 'voyage-gather') {
        if (v.mode !== 'ashore' || action.islandId !== v.islandId) { flash('先靠近浮标，减速后下船探索'); return true; }
        const object = nodes.get(`${action.islandId}-${action.node}`), target = object.getWorldPosition(new THREE.Vector3());
        walkTarget = target; pendingGather = action; pendingDeparture = undefined; return true;
      }
      if (v.mode === 'sailing') {
        if (point) { const next = planSeaRoute(v, point); if (next.length) { route = next; destinationId = null; flash('航向所选海面 · WASD 可接管'); } else flash('这里只能步行，船不能驶上沙滩'); }
        return true;
      }
      if (v.mode === 'ashore') {
        if (point) {
          const island = ISLANDS.find(i => i.id === v.islandId);
          walkTarget = islandWalkPoint(island, point); pendingGather = null; pendingDeparture = undefined;
        }
        return true;
      }
      return false;
    },
    update(seconds, waterY) {
      age += seconds;
      const boat = getBoat(), avatar = getAvatar(); if (!boat || !avatar) return;
      if (v.mode === 'sailing') {
        const left = keys.has('a') || keys.has('ArrowLeft') || hold === 'left', right = keys.has('d') || keys.has('ArrowRight') || hold === 'right';
        let turn = Number(left) - Number(right), throttle = keys.has('w') || keys.has('ArrowUp') || hold === 'forward' ? 1 : 0;
        if (keys.has('s') || keys.has('ArrowDown') || hold === 'brake') throttle = 0;
        const maxSpeed = state.boatDurability <= 0 ? .65 : ({ wood: 5, iron: 6.5, speed: 9 })[state.boatTier] || 3;
        if (route.length) {
          const input = autopilotInput(v, route, maxSpeed);
          turn = input.turn; throttle = input.throttle;
          if (input.arrived && destinationId) flash('已到达浮标 · 减速后点击「靠岸下船」');
        }
        const result = stepHelm(v, seconds, { throttle, turn, maxSpeed });
        if (result.collision) {
          route = []; destinationId = null;
          if (age - collisionAt > 2) { state.boatDurability = Math.max(0, state.boatDurability - 2); flash('船触到浅滩或海域边界 · 转向驶离，船体 -2'); collisionAt = age; }
        }
        state.stamina = Math.max(0, state.stamina - result.distance * .008);
        // Sitting at the helm: feet stay inside the hull, no walking/swimming pose.
        boat.position.set(v.x, waterY + .10 + Math.sin(age * 1.5) * .025, v.z);
        boat.rotation.set(Math.sin(age * 1.8) * .025, v.heading - Math.PI / 2, -turn * v.speed * .014);
        const offset = new THREE.Vector3(.28, .66, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y);
        avatar.position.copy(boat.position).add(offset); avatar.rotation.set(0, v.heading, 0);
        avatar.userData.limbs.leftArm.rotation.x = -.65; avatar.userData.limbs.rightArm.rotation.x = -.65;
        avatar.userData.limbs.leftLeg.rotation.x = -.4; avatar.userData.limbs.rightLeg.rotation.x = -.4;
        avatar.userData.tools.dive.visible = false; avatar.userData.fins.forEach(fin => { fin.visible = false; });
        for (const island of ISLANDS) if (!v.discovered.includes(island.id) && Math.hypot(v.x - island.x, v.z - island.z) < island.radius + 17) {
          v.discovered.push(island.id); save(state); flash(`发现${island.name} · ${island.description}`);
        }
      } else if (v.mode === 'ashore') {
        boat.position.set(v.x, waterY + .1 + Math.sin(age * 1.5) * .025, v.z);
        boat.rotation.set(0, v.heading - Math.PI / 2, 0);
        const island = ISLANDS.find(i => i.id === v.islandId);
        if (walkTarget && !isBlocked()) {
          const dx = walkTarget.x - avatar.position.x, dz = walkTarget.z - avatar.position.z, distance = Math.hypot(dx, dz), step = Math.min(distance, seconds * 3);
          if (distance > (pendingGather ? 1.85 : .08)) {
            avatar.position.x += dx / distance * step; avatar.position.z += dz / distance * step; avatar.rotation.y = Math.atan2(dx, dz);
            avatar.userData.limbs.leftLeg.rotation.x = Math.sin(age * 9) * .32; avatar.userData.limbs.rightLeg.rotation.x = -avatar.userData.limbs.leftLeg.rotation.x;
          } else {
            walkTarget = null;
            if (pendingGather) { const result = harvestIsland(state, pendingGather.islandId, pendingGather.node); flash(result.message); save(state); pendingGather = null; }
            if (pendingDeparture !== undefined) {
              const nextDestination = pendingDeparture;
              if (board() && nextDestination) setDestination(nextDestination);
            }
          }
        } else { avatar.userData.limbs.leftLeg.rotation.x = 0; avatar.userData.limbs.rightLeg.rotation.x = 0; }
        avatar.rotation.x = 0; avatar.position.y = terrainHeight(island, avatar.position.x, avatar.position.z) + .02;
        avatar.userData.limbs.leftArm.rotation.x = -avatar.userData.limbs.leftLeg.rotation.x * .65;
        avatar.userData.limbs.rightArm.rotation.x = -avatar.userData.limbs.rightLeg.rotation.x * .65;
        v.walkX = avatar.position.x; v.walkZ = avatar.position.z;
      }
      islandArt.forEach(art => animateIslandArt(art, age, waterY, v.mode === 'ashore' ? avatar.position : v.mode === 'sailing' ? v : { x: 0, z: 0 }, seconds));
      if (age - paintAt > .18) { paint(); paintAt = age; }
    },
    get wake() { return v.mode === 'sailing' ? Math.min(1, v.speed / 3) : 0; },
    get heading() { return v.heading; },
  };
}
