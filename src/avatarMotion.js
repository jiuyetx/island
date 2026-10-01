// Named pivots are shared by the Blender mesh and the lightweight runtime.
// Small facial movement remains independent of work / swim / voyage poses.
export function animateAvatarFace(actor, time, working = false) {
  const face = actor?.userData.face;
  if (!face) return;
  const beat = ((time % 4.8) + 4.8) % 4.8;
  const blink = beat < .18 ? Math.max(.07, Math.abs(beat - .09) / .09) : 1;
  for (const eye of face.eyes) eye.scale.y = blink;
  face.head.rotation.y = Math.sin(time * .65) * (working ? .015 : .045);
  face.head.rotation.x = working ? -.035 : Math.sin(time * .85) * .018;
}
