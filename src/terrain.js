import * as THREE from 'three';

export function groundPlacements(source, placements, terrainMeshes) {
  source.updateMatrixWorld(true);
  terrainMeshes.forEach((mesh) => mesh.updateMatrixWorld(true));
  const sourceBottom = new THREE.Box3().setFromObject(source).min.y;
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3(0, -1, 0);
  return placements.map(([x, y, z, size = 1, angle = 0]) => {
    raycaster.set(new THREE.Vector3(x, 30, z), direction);
    const groundY = raycaster.intersectObjects(terrainMeshes, false)[0]?.point.y ?? y;
    return [x, groundY - sourceBottom * size, z, size, angle];
  });
}
