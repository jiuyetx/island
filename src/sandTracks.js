import { swashContact } from './coastSwash.js';

export const SAND_TRACK_CAPACITY = 640;

// Cosmetic transient state, independent of saves, stamina and simulation time.
export function createSandTracks({ sampleSand, capacity = SAND_TRACK_CAPACITY } = {}) {
  if (!Number.isInteger(capacity) || capacity < 8) throw new RangeError('sand track capacity must be at least eight');
  const marks = Array(capacity).fill(null), actors = new Map();
  const humanEnd = Math.max(1, Math.floor(capacity * .4));
  let humanSlot = 0, crabSlot = humanEnd, version = 0;
  function stamp(x, z, angle, kind, side, actorY) {
    const sand = sampleSand(x, z);
    if (!sand || (Number.isFinite(actorY) && Math.abs(actorY - sand.y) > .25)) return;
    const slot = kind === 'human' ? humanSlot : crabSlot;
    if (kind === 'human') humanSlot = (humanSlot + 1) % humanEnd;
    else crabSlot = crabSlot + 1 >= capacity ? humanEnd : crabSlot + 1;
    marks[slot] = { ...sand, x, z, angle, kind, side, opacity: 1, targetOpacity: 1,
      age: 0, washCount: 0, lastWave: null, slot };
    version++;
  }
  return {
    marks,
    get version() { return version; },
    follow(id, position, { kind = 'human', enabled = true, angle = null } = {}) {
      const previous = actors.get(id);
      const point = { x: position.x, z: position.z, carry: 0, steps: previous?.steps || 0 };
      actors.set(id, point);
      if (!enabled || !previous?.enabled) { point.enabled = enabled; return; }
      point.enabled = true;
      const dx = point.x - previous.x, dz = point.z - previous.z, distance = Math.hypot(dx, dz);
      // Teleports, rescue, boarding and respawns must not draw a dotted highway.
      if (distance < 1e-5 || distance > 1.5) { point.carry = distance < 1e-5 ? previous.carry : 0; return; }
      const spacing = kind === 'human' ? .44 : .16;
      const heading = Math.atan2(dx, dz);
      let travelled = spacing - previous.carry;
      while (travelled <= distance + 1e-9) {
        const t = Math.min(1, travelled / distance), side = point.steps++ % 2 ? 1 : -1;
        const footOffset = kind === 'human' ? side * .11 : 0;
        stamp(previous.x + dx * t + Math.cos(heading) * footOffset,
          previous.z + dz * t - Math.sin(heading) * footOffset,
          angle ?? heading, kind, side, position.y);
        travelled += spacing;
      }
      const total = previous.carry + distance;
      point.carry = Math.max(0, total - Math.floor((total + 1e-9) / spacing) * spacing);
    },
    update(seconds, time, tide = 0, storm = 0) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const dt = Math.min(.1, seconds);
      for (let slot = 0; slot < capacity; slot++) {
        const mark = marks[slot];
        if (!mark) continue;
        mark.age += dt;
        const contact = swashContact(mark.x, mark.z, mark.inland, time, tide, storm, mark.runupLimit);
        if (contact.wet && contact.waveId !== mark.lastWave) {
          mark.washCount++;
          mark.lastWave = contact.waveId;
          mark.targetOpacity = mark.washCount >= 3 ? 0 : .45 ** mark.washCount;
        }
        const weathering = Math.max(0, Math.min(1, (600 - mark.age) / 120));
        mark.opacity += (Math.min(mark.targetOpacity, weathering) - mark.opacity) * (1 - Math.exp(-dt * 3));
        if (mark.opacity < .006 || mark.age >= 600) { marks[slot] = null; version++; }
      }
    },
  };
}
