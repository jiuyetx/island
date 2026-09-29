// The source mesh is baked in island coordinates; runtime motion uses a hull
// pivot at this authored centre and one shore-side mooring destination.
export const BOAT_MESH_ORIGIN = Object.freeze({ x: -9.4, y: .35, z: -5.4 });
export const BOAT_MOOR = Object.freeze({ x: 13.7, z: 8.85 });

export function boatFloatOffset(waterY, timeSeconds) {
  // The GLB keel is .27 m above its original origin, so this puts the keel
  // about .02 m above the flat water plane while preserving a shallow draft.
  return waterY - .25 + Math.sin(timeSeconds * 1.4) * .025;
}
