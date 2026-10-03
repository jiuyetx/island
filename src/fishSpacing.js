// Clearance uses the full fish body footprint, including tail motion.
export function fishPointClear(fish, x, z, neighbors = []) {
  return neighbors.every(other => other === fish || other.active === false
    || Math.hypot(x - other.x, z - other.z) >= fish.clearanceRadius + other.clearanceRadius);
}

export function fishAvoidanceDirection(fish, dx, dz, neighbors = []) {
  const length = Math.hypot(dx, dz) || 1;
  let x = dx / length, z = dz / length;
  for (const other of neighbors) {
    if (other === fish || other.active === false) continue;
    const ox = fish.x - other.x, oz = fish.z - other.z, distance = Math.hypot(ox, oz);
    const range = (fish.clearanceRadius + other.clearanceRadius) * 1.8;
    if (distance >= range || distance < .0001) continue;
    const strength = (1 - distance / range) * 2.4;
    x += ox / distance * strength; z += oz / distance * strength;
  }
  const magnitude = Math.hypot(x, z) || 1;
  return { x: x / magnitude, z: z / magnitude };
}
