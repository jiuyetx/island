// The built dock runs diagonally out from the western shore. Keep interaction
// on dry sand: the terrain raycast does not include the raised timber deck.
export const DOCK_APPROACH = Object.freeze({ x: 8.0, z: 3.4 });
export const TRADE_SIGN_POSITION = Object.freeze({ x: 7.7, z: 4.3 });
export const DOCK_DECK_OBSTACLE = Object.freeze({
  type: 'oriented-box', x: 10.2, z: 7.0,
  // The extra clearance keeps the whole avatar silhouette (not just its feet)
  // off the raised boards at the gameplay camera angle.
  halfWidth: 3.05, halfDepth: 1.7, angle: -.85,
});
