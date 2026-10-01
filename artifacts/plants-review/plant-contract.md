# Island vegetation maintenance contract

This package reviews existing reusable Palm_Source and Bush_Source replacements,
not a new room, new gameplay object, or an island layout redesign.

- Surface: Three.js web and WeChat, existing orthographic orbit camera.
- Avatar reserve: preserve the existing hut, door, dock, trading sign, water
  collector, planting beds, shoreline and all navigation clearances.
- Plant function: palms keep chopping, planting, tending and growth interactions;
  hibiscus bushes remain restrained habitat dressing, not collision-heavy heroes.
- No global radial symmetry: the established natural island arrangement stays
  asymmetric. Botanical crown tiers have deliberately uneven lengths and phases.
- Runtime readiness requires the authored GLB, correct materials, wind shader,
  grounding, picking and save compatibility to be checked in the live browser.
- Source origin is at root contact; trunk base does not float. Leaves have real
  thickness and a readable underside. Large crowns must not cover door handles,
  farm labels, dock interaction points or avatar work animations.
- Form target: three crown layers, rounded feather silhouettes, warm collar-ringed
  curved trunks; low flowering bushes with cupped leaves, five petals and stamens.
- Budget: no paid generation or third-party upload. Target <= 6500 triangles per
  palm, <= 5500 per shrub, with shared materials and reusable mesh data in runtime.
- Function/Form was explicitly approved by the user (「可以」) on 2026-10-01.
  Approved models may now be exported and integrated locally. Runtime evidence
  does not imply human runtime acceptance or authorize deployment.
- Architecture, new openings, ceiling projections, environment generation and
  Meshy pricing are outside this maintenance scope. Full-room validator failures
  on these requirements are recorded, not bypassed or reported as passing gates.

The actual geometry and material prototype is authored in
`../../tools/blender_preview_plants.py`. The review Blend and PNG views are
generated from that exact geometry. The approved sources are now exported via
`../../tools/blender_export_plants.py`. Runtime evidence is in `runtime/`;
human runtime acceptance and phone performance verification remain pending.
