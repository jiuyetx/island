import { shoreRadiusAt, upperBeachPoint } from './seaEcology.js';

// The breakwater sits in shallow water beside the western dock, clear of the
// moored boat and its seaward departure lane. Build from a dry beach point.
const ANGLE = 0.90;
const OFFSHORE = 2.05;

function seaPoint(angle) {
  const unitX = Math.cos(angle), unitZ = Math.sin(angle);
  const radius = shoreRadiusAt(unitX, unitZ) + OFFSHORE;
  return { x: unitX * radius, z: unitZ * radius };
}

export const WAVE_BARRIER_SITE = Object.freeze(seaPoint(ANGLE));
export const WAVE_BARRIER_APPROACH = Object.freeze(upperBeachPoint(ANGLE, 2.15));
export const WAVE_BARRIER_POSTS = Object.freeze(
  [-.09, -.045, 0, .045, .09].map((offset) => Object.freeze(seaPoint(ANGLE + offset))),
);
