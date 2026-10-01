import assert from 'node:assert/strict';
import { animateAvatarFace } from '../src/avatarMotion.js';

const actor = { userData: { face: { head: { rotation: { x: 0, y: 0 } },
  eyes: [{ scale: { x: 1, y: 1, z: 1 } }, { scale: { x: 1, y: 1, z: 1 } }] } } };
animateAvatarFace(actor, .09);
assert.equal(actor.userData.face.eyes[0].scale.y, .07, 'eyelids close at blink midpoint');
animateAvatarFace(actor, 1);
assert.equal(actor.userData.face.eyes[0].scale.y, 1, 'eyes reopen');
assert.equal(actor.userData.face.eyes[0].scale.z, 1, 'blink does not move eyes through face');
animateAvatarFace(actor, 2, true);
assert.equal(actor.userData.face.head.rotation.x, -.035, 'work pose looks toward task');
assert.ok(Math.abs(actor.userData.face.head.rotation.y) < .016, 'work pose keeps face stable');
animateAvatarFace({ userData: {} }, 1);
animateAvatarFace(null, 1);
console.log('avatar expression check passed');
