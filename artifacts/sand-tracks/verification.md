# Sand impressions — local verification

- Distance-spaced alternating shoe prints and alternating crab stance tetrads.
  Crab prints retain shell orientation during sideways movement.
- Eligibility uses an actual terrain hit, sand-strip bounds, raised-foot
  exclusion and dock exclusion. Plane decals align with the sand face normal.
- Cosmetic-only state: no save or economy changes, no collider or terrain edits.
- CPU wave contact matches the ocean/beach phase, runup range and ragged front.
  Each unique covering wave reduces opacity to 45%, then about 20%, then zero;
  a smooth visual fade avoids abrupt disappearance. Wave IDs prevent duplicate
  erosion due to frame rate or fringe jitter. Dry impressions weather slowly.
- Fixed 640 instance slots with a separate human reservation, one instanced
  render draw; only new/replaced instance transforms are rebuilt.

`npm test` passed, including alternating feet, distance/FPS parity, stationary
actors, non-sand sampling, raised actors, teleport/disabled state, crab patterns,
three-wave erasure, same-wave non-duplication and fixed resource bounds.
`npm run build` passed for Web and WeChat. Browser inspection of
`main.js?v=74214527c80b` produced no captured warnings/errors. Actual crab trails
and a walking human's shoe prints were visible on the local beach.

Real-device mobile frame rates and every remote island's walking path were
not tested. Evidence screenshots remain local. No commit/push/deployment.
