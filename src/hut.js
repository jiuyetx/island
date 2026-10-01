export const HUT_DOOR_OUTSIDE = { x: 1.5, z: -3.55 };
export const HUT_DOOR_INSIDE = { x: 1.5, z: -2.15 };

export function hutDoorIntent(shelter, outsideDistance = 0) {
  // The door leaf toggles indoors. Leaving is a separate, explicit action.
  if (shelter.inside) return shelter.doorOpen ? 'close' : 'open';
  return !shelter.doorOpen || outsideDistance > 1.4 ? 'approach' : 'enter';
}

export function keepHutControlsOpen(actionId, shelter) {
  return shelter.inside && ['hut-door', 'hut-close'].includes(actionId);
}

export function hutControls(shelter) {
  if (shelter.inside) return shelter.doorOpen ? [
    { id: 'hut-close', title: '关门避险', detail: '点击这里或场景中的门关门；人物留在屋内', color: '#94702f' },
    { id: 'hut-exit', title: '走出小屋', detail: '点击这里或屋外地面出屋；不会替你关门', color: '#467b77' },
  ] : [{ id: 'hut-door', title: '打开小屋门', detail: '开门后可选择出屋；点击门再次关闭', color: '#467b77' }];
  return [{ id: 'hut-door', title: shelter.doorOpen ? '进入小屋' : '走到小屋开门',
    detail: shelter.doorOpen ? '点击门进入；进屋后可点门关门'
      : '先开门，再点击门进出；进屋后关门避险', color: '#467b77' },
  ...(shelter.doorOpen ? [{ id: 'hut-close', title: '关闭小屋门',
    detail: '关闭门不会进入房屋', color: '#94702f' }] : [])];
}

export function createHutCrossing(shelter, position, entering, destination = null) {
  if (!shelter.doorOpen || shelter.inside === entering) return null;
  const end = entering ? HUT_DOOR_INSIDE : HUT_DOOR_OUTSIDE;
  return { entering, elapsed: 0, startX: position.x, startZ: position.z,
    endX: end.x, endZ: end.z, destination: entering ? null : destination };
}

export function stepHutCrossing(shelter, crossing, deltaSeconds) {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  crossing.elapsed = Math.min(.85, crossing.elapsed + dt);
  const t = crossing.elapsed / .85, eased = t * t * (3 - 2 * t);
  if (t >= 1) shelter.inside = crossing.entering;
  return { x: crossing.startX + (crossing.endX - crossing.startX) * eased,
    z: crossing.startZ + (crossing.endZ - crossing.startZ) * eased, done: t >= 1 };
}

export function isOutsideHut(point) {
  return point && (point.x < -.68 || point.x > 3.88 || point.z < -3.25 || point.z > .45);
}
