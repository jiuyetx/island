import { BOAT_MOOR } from './boat.js';
import { shoreRadiusAt } from './seaEcology.js';

export const WORLD_RADIUS = 125;
export const ISLANDS = Object.freeze([
  { id: 'spring', name: '泉眼岛', x: 45, z: -29, radius: 8, color: '#8ed5b1', description: '寻找淡水泉，补充远航饮水', resource: 'water' },
  { id: 'grove', name: '椰林岛', x: -43, z: 34, radius: 10, color: '#b7ce76', description: '采集椰果与漂流木，补给食物', resource: 'food' },
  { id: 'ruins', name: '遗迹岛', x: -34, z: -52, radius: 9, color: '#d4b28b', description: '探索石柱遗迹，寻找失落宝箱', resource: 'treasure' },
  { id: 'beacon', name: '灯塔岛', x: 72, z: 43, radius: 7, color: '#e9c874', description: '点亮航标，搜寻珍贵种子', resource: 'seed' },
]);
export const HOME = Object.freeze({ id: 'home', name: '家园码头', x: 0, z: 0, radius: 14, color: '#e9e3b1' });
export const PORTS = [HOME, ...ISLANDS];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const bearing = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function landingPoint(island, onLand = false) {
  if (island.id === 'home') return { ...BOAT_MOOR };
  // All landing beaches face the home island, with a safe gap between hull and sand.
  const length = Math.hypot(island.x, island.z);
  const radius = island.radius + (onLand ? -1.8 : 2.2);
  return { x: island.x - island.x / length * radius, z: island.z - island.z / length * radius };
}

export function islandResourcePoint(island, node = 'main') {
  if (node === 'main') return { x: island.x, z: island.z };
  const shore = landingPoint(island, true);
  const length = Math.hypot(island.x, island.z);
  return { x: shore.x - island.z / length * 2, z: shore.z + island.x / length * 2 };
}

export function navigable(x, z, clearance = .85) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > WORLD_RADIUS) return false;
  if (Math.hypot(x, z) < shoreRadiusAt(x, z) + clearance) return false;
  return ISLANDS.every((island) => Math.hypot(x - island.x, z - island.z) >= island.radius + clearance);
}

export function normalizeVoyage(value) {
  const safe = value && typeof value === 'object' ? value : {};
  let mode = ['sailing', 'ashore'].includes(safe.mode) ? safe.mode : 'home';
  const islandId = ISLANDS.some((i) => i.id === safe.islandId) ? safe.islandId : null;
  const x = finite(safe.x, BOAT_MOOR.x), z = finite(safe.z, BOAT_MOOR.z);
  if (!navigable(x, z) || (mode === 'ashore' && (!islandId || Math.hypot(x - landingPoint(ISLANDS.find(i => i.id === islandId)).x, z - landingPoint(ISLANDS.find(i => i.id === islandId)).z) > 4))) mode = 'home';
  const validIds = new Set(PORTS.map(i => i.id));
  const uniqueIds = (list) => [...new Set(Array.isArray(list) ? list.filter(id => validIds.has(id)) : [])];
  const harvested = {};
  for (const island of ISLANDS) for (const suffix of ['main', 'wood']) {
    const key = `${island.id}-${suffix}`;
    if (Number.isFinite(safe.harvested?.[key]) && safe.harvested[key] >= 0) harvested[key] = safe.harvested[key];
  }
  const onIsland = ISLANDS.find(i => i.id === islandId);
  const point = { x: finite(safe.walkX, onIsland?.x), z: finite(safe.walkZ, onIsland?.z) };
  const walk = onIsland && Math.hypot(point.x - onIsland.x, point.z - onIsland.z) <= onIsland.radius - 1 ? point : onIsland ? landingPoint(onIsland, true) : BOAT_MOOR;
  return { mode, islandId: mode === 'ashore' ? islandId : null,
    x: mode === 'home' ? BOAT_MOOR.x : x, z: mode === 'home' ? BOAT_MOOR.z : z,
    heading: finite(safe.heading), speed: 0, distance: Math.max(0, finite(safe.distance)),
    discovered: [...new Set(['home', ...uniqueIds(safe.discovered)])],
    visited: [...new Set(['home', ...uniqueIds(safe.visited)])], harvested,
    walkX: walk.x, walkZ: walk.z };
}

function seaSegment(a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .45);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!navigable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 1.1)) return false;
  }
  return true;
}

// Small visibility graph: navigation avoids land rather than cutting through it.
// Only 80 coast waypoints, independent of ocean size (no giant pathfinding grid).
export function planSeaRoute(start, destination) {
  if (!navigable(start.x, start.z) || !navigable(destination.x, destination.z, 1.1)) return [];
  if (seaSegment(start, destination)) return [{ ...destination }];
  const nodes = [{ x: start.x, z: start.z }, { ...destination }];
  for (const island of PORTS) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const radius = island.id === 'home' ? shoreRadiusAt(Math.sin(angle), Math.cos(angle)) + 3.2 : island.radius + 3.2;
    const p = { x: island.x + Math.sin(angle) * radius, z: island.z + Math.cos(angle) * radius };
    if (navigable(p.x, p.z, 1.1)) nodes.push(p);
  }
  const costs = nodes.map(() => Infinity), parents = nodes.map(() => -1), seen = new Set();
  costs[0] = 0;
  while (seen.size < nodes.length) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++) if (!seen.has(i) && (at < 0 || costs[i] < costs[at])) at = i;
    if (at < 0 || !Number.isFinite(costs[at])) return [];
    if (at === 1) break;
    seen.add(at);
    for (let j = 0; j < nodes.length; j++) {
      if (seen.has(j) || j === at) continue;
      const cost = costs[at] + Math.hypot(nodes[j].x - nodes[at].x, nodes[j].z - nodes[at].z);
      if (cost >= costs[j] || !seaSegment(nodes[at], nodes[j])) continue;
      costs[j] = cost; parents[j] = at;
    }
  }
  const route = [];
  for (let at = 1; at > 0; at = parents[at]) {
    if (parents[at] < 0) return [];
    route.unshift(nodes[at]);
  }
  return route;
}

export function stepHelm(voyage, seconds, { throttle = 0, turn = 0, maxSpeed = 5 } = {}) {
  const dt = clamp(finite(seconds), 0, .1);
  voyage.heading += clamp(turn, -1, 1) * dt * 1.75;
  voyage.heading = angleDelta(voyage.heading, 0);
  const desired = clamp(throttle, 0, 1) * maxSpeed;
  voyage.speed += clamp(desired - voyage.speed, -dt * 5, dt * 2.7);
  const x = voyage.x + Math.sin(voyage.heading) * voyage.speed * dt;
  const z = voyage.z + Math.cos(voyage.heading) * voyage.speed * dt;
  if (!navigable(x, z)) { voyage.speed = 0; return { collision: true, distance: 0 }; }
  const distance = Math.hypot(x - voyage.x, z - voyage.z);
  voyage.x = x; voyage.z = z; voyage.distance += distance;
  return { collision: false, distance };
}

export function autopilotInput(voyage, route, maxSpeed = 5) {
  if (!route.length) return { throttle: 0, turn: 0, arrived: false };
  if (Math.hypot(route[0].x - voyage.x, route[0].z - voyage.z) < 1) route.shift();
  if (!route.length) return { throttle: 0, turn: 0, arrived: true };
  const angle = angleDelta(bearing(voyage, route[0]), voyage.heading);
  const remaining = Math.hypot(route[0].x - voyage.x, route[0].z - voyage.z);
  // Brake BEFORE the last buoy. Merely releasing at the waypoint leaves the
  // hull's stopping distance beyond the route, potentially on the beach.
  const safeSpeed = route.length === 1 ? Math.sqrt(Math.max(.05, remaining - .6) * 6) : maxSpeed;
  return { turn: clamp(angle * 2, -1, 1), throttle: Math.abs(angle) > .9 ? 0 : Math.min(1, safeSpeed / maxSpeed), arrived: false };
}

export function harvestIsland(state, islandId, node = 'main') {
  const voyage = state.voyage, island = ISLANDS.find(i => i.id === islandId);
  if (!island || !['main', 'wood'].includes(node) || voyage.mode !== 'ashore' || voyage.islandId !== islandId) return { ok: false, message: '请先靠岸下船探索' };
  const point = islandResourcePoint(island, node);
  if (Math.hypot(voyage.walkX - point.x, voyage.walkZ - point.z) > 2) return { ok: false, message: '请走到资源附近再采集' };
  const key = `${islandId}-${node}`, previous = voyage.harvested[key];
  if (previous != null && (island.resource === 'treasure' && node === 'main' || state.gameMinutes < previous + 1440)) return { ok: false, message: '已采集 · 普通资源一天后补充，宝箱仅能开启一次' };
  if (state.stamina < 3) return { ok: false, message: '体力不足，先补充食物并返家休息' };
  let message;
  if (node === 'wood') { state.wood += 3; message = '拾得木材 ×3 · 可用于建筑与船只抢修'; }
  else if (island.resource === 'water') {
    const before = state.freshwater.canteen;
    state.freshwater.canteen = state.freshwater.canteenCapacity;
    if (before >= state.freshwater.canteen) return { ok: false, message: '水壶已满，饮水后再来装取泉水' };
    message = '泉水装满水壶 · 在背包中饮水';
  } else if (island.resource === 'food') { state.food += 3; message = '采到椰果 ×3 · 可从背包食用补充饱腹'; }
  else if (island.resource === 'treasure') { state.gold += 65; message = '遗迹宝箱开启 · 获得 65 金币'; }
  else {
    const used = Object.values(state.inventory).reduce((sum, n) => sum + n, 0);
    if (used + 2 > state.backpackCapacity) return { ok: false, message: '背包空间不足，需要留出 2 格' };
    state.inventory.pineappleSeed = (state.inventory.pineappleSeed || 0) + 2;
    message = '找到菠萝种子 ×2 · 带回家园种植';
  }
  state.stamina -= 3; voyage.harvested[key] = state.gameMinutes;
  return { ok: true, message };
}
