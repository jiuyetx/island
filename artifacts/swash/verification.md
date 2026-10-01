# Beach swash verification

Local-only update; no deployment or save-schema changes.

- The ocean and sand use the same `coastSwash` GLSL helper and the same mutable
  time/tide/storm uniform objects. The cycle uses visual seconds, never game
  minutes, and does not move mesh vertices or affect terrain collisions.
- Runup takes about 32% of a 5–6.8 second cycle; backwash takes about 62%.
  The front starts seaward and reaches the sloping lower sand, with gaps,
  foam bubbles, damp retreat trails and lower water-film roughness.
- Home and all four exploration island terrain materials share the effect.
  Smaller islands cap the runup distance before their grassy core.
- Existing marine boundaries, tree models, walking surfaces and survival
  mechanics were not changed.

Automated checks: `npm test` passed, including `coast-swash.test.mjs` for
advance/retreat timing, tide/storm response, cycle continuity, bounded reach,
shared uniforms, exploration-island origins and GLSL reserved-name regression.
`npm run build` passed for Web and WeChat.

The existing browser page was reloaded after the build. `shore-phase-a.png`
and `shore-phase-b.png` show different positions of the foam edge and wet sand
at the same camera, notably the lower and left beaches. The latest bundle
(`main.js?v=582d94d39509`) produced no captured console errors or warnings.
An earlier attempt used the reserved GLSL identifier `active`; it was corrected
to `swashActivity` and the browser compile was checked again.

Real-device mobile GPU performance and on-island traversal of every remote
shoreline were not tested. No extra foam meshes or particle draw calls added.
