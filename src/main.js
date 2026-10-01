import './polyfills.js';
import * as THREE from 'three';
import { coastlineRadius, coastlineBandRadius, coastlineShaderRadius, islandCoastlineShaderRadius } from './coastline.js';
import { createBeachMaterial } from './beachMaterial.js';
import { COAST_SWASH_GLSL } from './coastSwash.js';
import { groundPlacements } from './terrain.js';
import { createRoamer, offshorePlacements, shoreRadiusAt, stepRoamer, upperBeachPoint } from './seaEcology.js';
import { sparseBushPlacements } from './bushLayout.js';
import { createFoliageMaterial, applyFoliageAtlas } from './foliageMaterial.js';
import { planWalkRoute } from './navigation.js';
import { DOCK_APPROACH, DOCK_DECK_OBSTACLE, TRADE_SIGN_POSITION } from './dockNavigation.js';
import { bedRestPlan, restProgress, restPreview, restNutritionCost } from './rest.js';
import { nextPlayerAction } from './playerGuidance.js';
import { advanceFishingSession, createFishingSession, fishingCue, fishingForceGuide, FISHING_FORCE_LABELS, hookFish, setFishingForce, setFishingAssistance } from './fishing.js';
import { BOAT_MESH_ORIGIN, BOAT_MOOR, boatFloatOffset } from './boat.js';
import { ISLANDS } from './voyage.js';
import { createVoyageScene } from './voyageScene.js';
import { plotGuidance } from './playerGuidance.js';
import { animateAvatarFace } from './avatarMotion.js';
import { createSandCrab, stepSandCrab } from './sandCrab.js';
import { createSandCrabGeometry, createSandCrabMaterial } from './sandCrabVisual.js';
import { createSandTracks } from './sandTracks.js';
import { createSandTrackVisual } from './sandTrackVisual.js';
import { createEnvironment } from './environmentVisual.js';
import { WAVE_BARRIER_APPROACH, WAVE_BARRIER_POSTS, WAVE_BARRIER_SITE } from './waveBarrier.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BUILDINGS, CROPS, SEAFOOD, SHOP, TREE_MATURE_MINUTES, build, buyItem, catchSeafood, chopTree, consumeRestNutrition, eatMeal, ensureDailyOrders, gather, harvestCrop, installDefense, inventoryUsed, moveAllStock, moveStock, normalizeState, patchAssetWithWood, plantCrop, plantTree, refillOxygen, repairAsset, repairQuote, restRecoveryCap, sellItem, submitOrder, tendTree, advanceGameTime, spendActionTime, tideAt, usableCropSeed, waterCrop, woodPatchQuote } from './economy.js';
import { stormStatus, summarizeStormReport, updateStorm } from './storm.js';
import { INSTALLABLE_STOCK, drawIcon, drawInventoryPanel, getInventoryRows } from './inventoryUi.js';
import { FRESHWATER_SITE, dailyWaterYield, drinkWater, rainForDay, refillCanteen, staminaCeiling } from './freshwater.js';
import { initGoogleAuth } from './googleAuth.js';
import { DISHES, RECIPES, edibleDishCount, learnRecipe, recipeQuote, upgradeRecipe } from './cooking.js';
import { cookMeal } from './economy.js';
import { COOKING_MOBILE_HEIGHT, drawCookingPanel } from './cookingUi.js';
import { HUT_DOOR_INSIDE, HUT_DOOR_OUTSIDE, createHutCrossing, hutControls, hutDoorIntent, isOutsideHut, keepHutControlsOpen, stepHutCrossing } from './hut.js';

import { canvas, loadImage, loadState, nextFrame, offscreen, onForegroundChange, onResize, onTouches, saveState, viewport } from './platform.js';
import islandGlb from '../assets/generated/tropical-island.glb';
import vegetationGlb from '../assets/generated/tropical-vegetation.glb';
import buildingsGlb from '../assets/generated/tropical-buildings.glb';
import avatarGlb from '../assets/generated/tropical-avatar.glb';

const C = {
  lagoon: 0x389f9e, shallow: 0x167d8b, deep: 0x034b70, foam: 0xecfbf6,
  sand: 0xdcc88f, wood: 0x8a6238,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.deep);
scene.fog = new THREE.FogExp2(0x1c8fa6, 0.005);
const camera = new THREE.OrthographicCamera();
const hudScene = new THREE.Scene();
const hudCamera = new THREE.OrthographicCamera();
const raycaster = new THREE.Raycaster();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const interactive = [];
const animated = [];
const animatedShaderUniforms = [];
const windShaderUniforms = [];
const hutRoofs = [];
let heroBoat = null;
const forceCutaway = typeof location !== 'undefined' && /cutaway/.test(location.search);
const state = normalizeState(loadState());
initGoogleAuth();
let screen = viewport();
let viewSize = 38;
let azimuth = -0.72;
let messageUntil = 0;
let hudPage = 'activity';
let inventoryMode = 'bag';
let inventoryPage = 0;
let selectedInventoryId = null;
let selectedRecipeId = 'bakedPotato';
let kitchenPage = 0;
let cookingJob = null;
let shopPage = 0;
let sellPage = 0;
let tradeMode = 'buy';
let stormReportOpen = false;
let selectedSeed = 'sweetPotato';
let selectedPlotId = null;
let selectedSeafood = 'crab';
let selectedTreeId = state.trees[0]?.id;
const treeVisuals = new Map();
const marineTargets = [];
let activeMarineTarget = null;
let marineTargetMarker = null;
let fishingSession = null;
let fishingResult = null;
let fishingVisual = null;
let fishingLine = null;
let lastFishingUiMs = 0;
let avatar = null;
let avatarTemplate = null;
let avatarTarget = null;
let avatarRoute = [];
let arrivalAction = null;
let busyAction = false;
let restTransition = null;
let bedApproach = null;
let hutBed = null;
let hutDoorPivot = null;
let hutDoorLabel = null;
let walkDestinationMarker = null;
let walkDestinationUntil = 0;
let hutCrossing = null;
let sceneElapsed = 0;
let boatTrip = null;
let voyage = null;
let voyagePalmSource = null;
let voyageArtAssets = {};
let marineMode = 'land';
let diveBlend = 0;
let diveSecondsLeft = 0;
let diveSecondsMax = 0;
let diveMarker = null;
let swimWake = null;
const catchEffects = [];
let walkGroundMeshes = [];
let sandTracks = null;
let sandTrackVisual = null;
const groundRaycaster = new THREE.Raycaster();
const groundSample = { x: NaN, z: NaN, y: 2.03 };
const MAX_SURFACE_DISTANCE = 6.5;
const MAX_ROUTE_RADIUS = 31;
let foreground = true;
let previousFrameMs = 0;
let lastHudDrawMs = 0;
const PASSIVE_TIME_SCALE = .125; // advanceGameTime converts each input second into two game minutes.
let lastSaveMs = 0;
const cropObjects = [];
const walkObstacles = [];
const visualProps = {};
const storm = { nextDay: 7, strength: 1, phase: 'calm', settled: 0, lastShown: 0 };

const mat = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
const materials = {
  wood: mat(C.wood), pink: mat(0xff8fbd), white: mat(0xfff4df), gold: mat(0xf8c857),
  shell: new THREE.MeshStandardMaterial({ color: 0xfff1dd, roughness: .38, metalness: .03, vertexColors: true }),
  pinkShell: new THREE.MeshStandardMaterial({ color: 0xffb1c2, roughness: .4, metalness: .02, vertexColors: true }),
  driftwood: new THREE.MeshStandardMaterial({ roughness: .94, vertexColors: true }),
};

const leafShape = new THREE.Shape();
leafShape.moveTo(0, 0);
leafShape.quadraticCurveTo(-.14, .28, 0, .62);
leafShape.quadraticCurveTo(.14, .28, 0, 0);
const leafGeometry = new THREE.ShapeGeometry(leafShape);

function curvedRod(length, radius, material) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, length * .48, -.025), new THREE.Vector3(.045, length, -.12),
  ]), 8, radius, 7, false), material, 0, 0, 0, false);
}

function driftwoodGeometry(length, radius) {
  const geometry = new THREE.CylinderGeometry(radius * .58, radius, length, 12, 4);
  const pos = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const angle = Math.atan2(z, x);
    const grain = Math.sin(y * 28 + Math.sin(angle * 3) * 1.4) * .08;
    const knot = Math.max(0, Math.cos(angle * 5 + y * 2)) * .1;
    const shade = .78 + grain + knot;
    colors.push(.50 * shade, .32 * shade, .17 * shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  for (let i = 0; i < pos.count; i++) {
    const angle = Math.atan2(pos.getZ(i), pos.getX(i));
    const y = pos.getY(i) / length + .5;
    const wobble = 1 + .035 * Math.sin(angle * 3 + y * 7) + .018 * Math.sin(angle * 7 - y * 11);
    pos.setX(i, pos.getX(i) * wobble);
    pos.setZ(i, pos.getZ(i) * wobble);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shellGeometry(radius, ribs) {
  const geometry = new THREE.SphereGeometry(radius, 24, 14);
  const pos = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const radial = Math.hypot(x, z) / radius;
    const ridge = Math.cos(angle * ribs);
    const pleat = 1 + ridge * .075 * radial;
    pos.setX(i, x * pleat);
    pos.setZ(i, z * pleat);
    pos.setY(i, y * .48);
    const shade = .82 + .11 * (ridge * .5 + .5) + .07 * (y / radius + 1) * .5;
    colors.push(shade, shade * .93, shade * .82);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const driftwoodLong = driftwoodGeometry(1.45, .19);
const driftwoodBranch = driftwoodGeometry(.82, .115);
const shellGeometries = [shellGeometry(.22, 8), shellGeometry(.27, 11)];

function mesh(geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = shadow;
  object.receiveShadow = shadow;
  return object;
}

function createAvatar() {
  const actor = new THREE.Group();
  const skin = mat(0xc9825f, .92);
  const shirt = mat(0x2f7467, .88);
  const shorts = mat(0x314b54, .9);
  const fabric = mat(0xdec89a, .95);
  const torso = mesh(new THREE.SphereGeometry(.28, 16, 10), shirt, 0, .815, 0);
  torso.scale.z = .73;
  const head = mesh(new THREE.SphereGeometry(.35, 20, 12), skin, 0, 1.44, .025);
  const hair = mesh(new THREE.SphereGeometry(.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * .40), mat(0x503a2c), 0, 1.44, -.02);
  const hatBrim = mesh(new THREE.CylinderGeometry(.443, .455, .043, 24), fabric, 0, 1.768, .02);
  const hatCrown = mesh(new THREE.CylinderGeometry(.259, .277, .146, 20), fabric, 0, 1.849, .02);
  const pack = mesh(new THREE.CapsuleGeometry(.14, .16, 3, 7), fabric, 0, .815, -.25);
  const leftLeg = new THREE.Group(); leftLeg.position.set(-.145, .53, 0);
  const rightLeg = new THREE.Group(); rightLeg.position.set(.145, .53, 0);
  const leftArm = new THREE.Group(); leftArm.position.set(-.305, 1.018, .015);
  const rightArm = new THREE.Group(); rightArm.position.set(.305, 1.018, .015);
  for (const leg of [leftLeg, rightLeg]) {
    leg.add(mesh(new THREE.CapsuleGeometry(.12, .10, 3, 8), shorts, 0, -.11, 0));
    leg.add(mesh(new THREE.CylinderGeometry(.085, .085, .2, 10), skin, 0, -.31, 0));
  }
  for (const arm of [leftArm, rightArm]) {
    arm.add(mesh(new THREE.CapsuleGeometry(.10, .11, 3, 8), shirt, 0, -.105, 0));
    arm.add(mesh(new THREE.CapsuleGeometry(.075, .08, 3, 8), skin, 0, -.29, 0));
    arm.add(mesh(new THREE.SphereGeometry(.088, 12, 8), skin, 0, -.427, .02, false));
  }
  const boots = mat(0x463b31, .92);
  for (const leg of [leftLeg, rightLeg]) {
    const boot = mesh(new THREE.SphereGeometry(.13, 12, 8), boots, 0, -.448, .07, false);
    boot.scale.set(1, .63, 1.42);
    leg.add(boot);
  }
  leftArm.rotation.z = -.22;
  rightArm.rotation.z = .22;
  const toolRoot = new THREE.Group();
  toolRoot.position.set(.39, .72, .04);
  const rod = new THREE.Group();
  const rodShaft = curvedRod(.94, .018, mat(0x6e4529));
  const rodGrip = mesh(new THREE.CylinderGeometry(.03, .038, .22, 8), mat(0x493329), 0, .1, 0, false);
  const rodLine = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(.04, .84, -.1), new THREE.Vector3(.08, .56, -.2), new THREE.Vector3(.16, .22, -.32),
  ]), 8, .005, 5, false), mat(0xd6e8e2, .75), 0, 0, 0, false);
  const float = mesh(new THREE.SphereGeometry(.034, 8, 6), mat(0xf2a642, .62), .16, .18, -.32, false);
  rod.add(rodShaft, rodGrip, rodLine, float);
  const rodGuides = [];
  for (const [i, y] of [.34, .58, .8].entries()) {
    const guide = mesh(new THREE.TorusGeometry(.028 - i * .004, .006, 5, 8), mat(0x708986, .42), .01, y, -.035, false);
    guide.rotation.x = Math.PI / 2;
    rod.add(guide); rodGuides.push(guide);
  }
  const rodWrap = mesh(new THREE.TorusGeometry(.04, .012, 5, 8), mat(0xcf9b48, .66), 0, .29, 0, false);
  rodWrap.rotation.x = Math.PI / 2; rod.add(rodWrap);
  const rodReel = new THREE.Group();
  rodReel.add(mesh(new THREE.CylinderGeometry(.052, .052, .09, 10), mat(0x73898a, .4), 0, 0, 0, false));
  rodReel.add(mesh(new THREE.TorusGeometry(.047, .009, 5, 10), mat(0xc7a35d, .48), 0, .048, 0, false));
  rodReel.position.set(-.055, .28, .025); rod.add(rodReel); rodReel.visible = false;
  rod.rotation.z = -.72;
  const shovel = new THREE.Group();
  const handle = curvedRod(.62, .027, mat(0x85512d));
  handle.rotation.z = -.48;
  const spade = mesh(new THREE.SphereGeometry(.11, 10, 7), mat(0x6f7d79, .46), -.27, -.37, 0, false);
  spade.scale.set(.72, 1.22, .22);
  const shovelCollar = mesh(new THREE.CylinderGeometry(.046, .052, .09, 8), mat(0x64757a, .4), -.17, -.27, 0, false);
  const shovelGrip = mesh(new THREE.TorusGeometry(.065, .015, 5, 9), mat(0x3f3429), .12, .47, 0, false);
  shovelGrip.rotation.x = Math.PI / 2;
  shovel.add(handle, spade, shovelCollar, shovelGrip);
  const axe = new THREE.Group();
  const axeHandle = curvedRod(.62, .026, mat(0x865a38));
  axeHandle.rotation.z = -.45;
  const axeHead = mesh(new THREE.SphereGeometry(.14, 12, 8), mat(0x86999b, .42), -.24, .37, 0, false);
  axeHead.scale.set(1.5, .64, .28);
  axe.add(axeHandle, axeHead);
  const net = new THREE.Group();
  const netHandle = curvedRod(.54, .018, mat(0x79482a));
  netHandle.rotation.z = -.44;
  const hoop = mesh(new THREE.TorusGeometry(.16, .014, 5, 12), mat(0xb8dfd3, .65), -.22, .39, -.02, false);
  hoop.rotation.x = Math.PI / 2;
  const netting = mesh(new THREE.CircleGeometry(.145, 12), new THREE.MeshStandardMaterial({ color: 0x91c9be, transparent: true, opacity: .38, side: THREE.DoubleSide, roughness: .78 }), -.22, .39, -.018, false);
  netting.rotation.x = -Math.PI / 2;
  const netGrid = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.CircleGeometry(.145, 12)), new THREE.LineBasicMaterial({ color: 0xd1eee1, transparent: true, opacity: .72 }));
  netGrid.position.set(-.22, .39, -.016); netGrid.rotation.x = -Math.PI / 2;
  net.add(netHandle, hoop, netting, netGrid);
  for (const angle of [0, Math.PI * .67, Math.PI * 1.33]) net.add(mesh(new THREE.SphereGeometry(.022, 7, 5), mat(0xe7bd58, .62), -.22 + Math.cos(angle) * .145, .39, -.02 + Math.sin(angle) * .145, false));
  const wateringCan = new THREE.Group();
  const canBody = mesh(new THREE.SphereGeometry(.13, 12, 8), mat(0x6f9c8b, .6), 0, .08, 0, false);
  canBody.scale.set(1.2, .86, .9);
  const canHandle = mesh(new THREE.TorusGeometry(.095, .014, 5, 10, Math.PI), mat(0x536f64, .62), -.02, .17, 0, false);
  const canSpout = curvedRod(.28, .016, mat(0x6f9c8b, .6));
  canSpout.position.set(.12, .12, .01); canSpout.rotation.z = -.95;
  const canRose = mesh(new THREE.CylinderGeometry(.04, .026, .035, 10), mat(0x536f64, .62), .29, .25, .01, false);
  canRose.rotation.z = -.55;
  const waterDrops = new THREE.Group();
  const dropMaterial = new THREE.MeshBasicMaterial({ color: 0x9be9ed, transparent: true, opacity: .76, depthWrite: false });
  for (let index = 0; index < 6; index++) {
    const drop = mesh(new THREE.SphereGeometry(.018 + index % 2 * .006, 7, 5), dropMaterial, .27, -.03 - index * .085, .02 + (index % 3 - 1) * .024, false);
    waterDrops.add(drop);
  }
  waterDrops.visible = false;
  wateringCan.add(canBody, canHandle, canSpout, canRose, waterDrops);
  const dive = new THREE.Group();
  const suit = mesh(new THREE.SphereGeometry(.30, 16, 10), mat(0x285d67, .62), 0, .815, 0, false);
  suit.scale.set(1, .92, .72);
  const maskRim = mesh(new THREE.TorusGeometry(.16, .018, 6, 16), mat(0x506e73, .42), 0, 1.47, .337, false);
  maskRim.scale.set(1.55, .77, 1);
  const maskGlass = mesh(new THREE.CircleGeometry(.148, 16), new THREE.MeshStandardMaterial({ color: 0xa8e1e4, transparent: true, opacity: .5, roughness: .22, side: THREE.DoubleSide }), 0, 1.47, .339, false);
  maskGlass.scale.set(1.55, .77, 1);
  const snorkel = curvedRod(.28, .012, mat(0x4b7d7c));
  snorkel.position.set(.30, 1.49, .19); snorkel.rotation.z = -.25;
  dive.add(suit, maskRim, maskGlass, snorkel);
  const fins = [];
  for (const [index, x] of [-.13, .13].entries()) {
    const tank = mesh(new THREE.CylinderGeometry(.065, .075, .35, 8), mat(0x79969b, .46), x, .82, -.32, false);
    tank.rotation.z = x * .08;
    const fin = mesh(new THREE.ConeGeometry(.12, .42, 5), mat(0x315f68, .72), 0, -.48, .20, false);
    fin.rotation.x = Math.PI / 2;
    fin.visible = false;
    [leftLeg, rightLeg][index].add(fin);
    fins.push(fin);
    dive.add(tank);
  }
  rod.visible = false;
  shovel.visible = false;
  axe.visible = false;
  net.visible = false;
  wateringCan.visible = false;
  dive.visible = false;
  toolRoot.add(rod, shovel, axe, net, wateringCan);
  // The older capsules remain as a no-asset fallback, but the shipped hero is
  // a Blender-authored, named-pivot model.  Its body silhouette and the
  // animation pivots stay separate, so a chop or casting pose bends limbs
  // instead of swinging a single block character.
  const visual = avatarTemplate?.clone(true);
  const importedLimbs = visual && {
    leftLeg: visual.getObjectByName('Avatar_Leg_L'), rightLeg: visual.getObjectByName('Avatar_Leg_R'),
    leftArm: visual.getObjectByName('Avatar_Arm_L'), rightArm: visual.getObjectByName('Avatar_Arm_R'),
  };
  const importedGrip = visual?.getObjectByName('Avatar_ToolGrip');
  if (importedLimbs && Object.values(importedLimbs).every(Boolean)) {
    actor.add(visual);
    actor.userData.limbs = importedLimbs;
    const faceHead = visual.getObjectByName('Avatar_HeadPivot');
    const eyes = ['Avatar_Eye_L', 'Avatar_Eye_R'].map((name) => visual.getObjectByName(name));
    if (faceHead && eyes.every(Boolean)) actor.userData.face = { head: faceHead, eyes };
    fins.forEach((fin, index) => (index ? importedLimbs.rightLeg : importedLimbs.leftLeg).add(fin));
    if (importedGrip) {
      importedGrip.add(toolRoot);
      toolRoot.position.set(0, 0, 0);
      toolRoot.rotation.set(0, 0, 0);
    } else actor.add(toolRoot);
  } else {
    actor.add(torso, head, hair, hatBrim, hatCrown, pack, leftLeg, rightLeg, leftArm, rightArm, toolRoot);
    actor.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm };
    for (const x of [-.126, .126]) {
      const white = mesh(new THREE.SphereGeometry(1, 12, 8), mat(0xf8f3de), x, 1.472, .314, false);
      white.scale.set(.073, .095, .024);
      const pupil = mesh(new THREE.SphereGeometry(1, 10, 6), mat(0x32241b), x, 1.468, .338, false);
      pupil.scale.set(.039, .062, .012);
      actor.add(white, pupil);
    }
    rightArm.add(toolRoot);
    toolRoot.position.set(0, -.425, .06);
  }
  actor.add(dive);
  actor.position.set(state.shelter.inside ? HUT_DOOR_INSIDE.x : -2.0, 2.03, state.shelter.inside ? HUT_DOOR_INSIDE.z : -3.9);
  actor.userData.fins = fins;
  actor.userData.tools = { rod, shovel, axe, net, wateringCan, dive };
  actor.userData.effects = { waterDrops, rodLine, float };
  actor.userData.upgrades = { rod, rodGuides, rodWrap, rodReel, spade, shovelCollar, shovelGrip };
  actor.userData.toolRoot = toolRoot;
  actor.userData.actionUntil = 0;
  actor.userData.startY = actor.position.y;
  scene.add(actor);
  avatar = actor;
  diveMarker = new THREE.Group();
  const bubbleMaterial = new THREE.MeshStandardMaterial({ color: 0xc6f6e9, emissive: 0x459b9e, emissiveIntensity: .28, roughness: .2, transparent: true, opacity: .82 });
  for (const [x, y, z, radius] of [[0, .02, 0, .075], [.19, .1, -.11, .045], [-.16, .16, .07, .036]]) {
    diveMarker.add(mesh(new THREE.SphereGeometry(radius, 8, 6), bubbleMaterial, x, y, z, false));
  }
  diveMarker.visible = false;
  scene.add(diveMarker);
  swimWake = new THREE.Mesh(new THREE.RingGeometry(.36, .45, 32),
    new THREE.MeshBasicMaterial({ color: 0xdafbf2, transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide }));
  swimWake.rotation.x = -Math.PI / 2;
  swimWake.renderOrder = 4;
  swimWake.visible = false;
  scene.add(swimWake);
}

function playAvatarAction(kind) {
  if (!avatar) return;
  const tools = avatar.userData.tools;
  for (const [name, object] of Object.entries(tools)) object.visible = name === kind;
  avatar.userData.actionKind = kind;
  avatar.userData.actionStarted = sceneElapsed;
  avatar.userData.actionDuration = ({ rod: 1.45, net: 1.22, hand: .74, diveCatch: 1.05, axe: 1.06, shovel: .88, wateringCan: 1.12 })[kind] || .7;
  avatar.userData.actionUntil = sceneElapsed + avatar.userData.actionDuration;
}

function spawnCatchEffects(target, count) {
  if (!target?.source || !avatar) return;
  for (let i = 0; i < Math.min(count, 2); i++) {
    const visual = target.source.clone(true);
    visual.traverse((part) => {
      if (!part.isMesh) return;
      part.castShadow = false;
      part.receiveShadow = false;
      part.material = part.material.clone();
      part.material.transparent = true;
    });
    const start = new THREE.Vector3(target.x + i * .16, Math.max(water.position.y + .18, target.y + .25), target.z);
    const end = new THREE.Vector3(avatar.position.x, avatar.position.y + (marineMode === 'dive' ? .7 : 1.0), avatar.position.z + .12);
    const scale = Math.max(.52, target.member.size * .72);
    visual.scale.setScalar(scale);
    visual.position.copy(start);
    visual.renderOrder = 5;
    scene.add(visual);
    catchEffects.push({ visual, start, end, age: -i * .12, duration: 1.15, scale });
  }
}

function updateCatchEffects(deltaSeconds) {
  for (let i = catchEffects.length - 1; i >= 0; i--) {
    const effect = catchEffects[i];
    effect.age += deltaSeconds;
    const t = THREE.MathUtils.clamp(effect.age / effect.duration, 0, 1);
    effect.visual.position.lerpVectors(effect.start, effect.end, t);
    effect.visual.position.y += Math.sin(t * Math.PI) * .75;
    effect.visual.rotation.y += deltaSeconds * 7;
    effect.visual.rotation.z = Math.sin(t * Math.PI) * .25;
    effect.visual.scale.setScalar(effect.scale * (1 - t * .45));
    effect.visual.traverse((part) => { if (part.isMesh) part.material.opacity = Math.min(1, (1 - t) * 3); });
    if (t < 1) continue;
    scene.remove(effect.visual);
    effect.visual.traverse((part) => { if (part.isMesh) part.material.dispose(); });
    catchEffects.splice(i, 1);
  }
}

function refreshEquipmentVisuals() {
  if (!avatar) return;
  const { rod, rodGuides, rodWrap, rodReel, spade, shovelCollar, shovelGrip } = avatar.userData.upgrades;
  rod.scale.y = 1 + (state.rodLevel - 1) * .08;
  for (const guide of rodGuides) guide.visible = state.rodLevel >= 2;
  rodWrap.visible = state.rodLevel >= 3;
  rodReel.visible = state.rodLevel >= 2;
  spade.scale.set(.72 + (state.shovelLevel - 1) * .11, 1.22 + (state.shovelLevel - 1) * .12, .22 + (state.shovelLevel - 1) * .035);
  spade.material.color.setHex(state.shovelLevel >= 3 ? 0xc1ccca : 0x6f7d79);
  shovelCollar.visible = state.shovelLevel >= 2;
  shovelGrip.visible = state.shovelLevel >= 3;
}

function waterDepthMetres(x, z) {
  return Math.max(0, water.position.y - groundHeightAt(x, z));
}

function diveDepthLimit() { return state.diveLevel === 2 ? 30 : state.diveLevel === 1 ? 25 : 3; }

function coastTarget(x, z) {
  const distance = Math.hypot(x, z);
  if (!distance) return { x, z };
  const shore = shoreRadiusAt(x, z);
  const maxDistance = shore + (marineMode === 'dive' && !state.diveLevel ? 4.5 : MAX_SURFACE_DISTANCE);
  let targetDistance = Math.min(distance, maxDistance);
  if (marineMode === 'dive' && waterDepthMetres(x * targetDistance / distance, z * targetDistance / distance) > diveDepthLimit()) {
    let safe = shore, unsafe = targetDistance;
    for (let i = 0; i < 12; i++) {
      const middle = (safe + unsafe) / 2;
      if (waterDepthMetres(x * middle / distance, z * middle / distance) <= diveDepthLimit()) safe = middle;
      else unsafe = middle;
    }
    targetDistance = safe;
  }
  return { x: x * targetDistance / distance, z: z * targetDistance / distance };
}

function groundHeightAt(x, z) {
  if (Math.hypot(x - groundSample.x, z - groundSample.z) < .015) return groundSample.y;
  groundRaycaster.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
  groundSample.x = x;
  groundSample.z = z;
  groundSample.y = groundRaycaster.intersectObjects(walkGroundMeshes, false)[0]?.point.y ?? 2.03;
  return groundSample.y;
}

const trackRaycaster = new THREE.Raycaster();
const trackOrigin = new THREE.Vector3(), trackDown = new THREE.Vector3(0, -1, 0);
function sampleTrackSand(x, z) {
  trackRaycaster.set(trackOrigin.set(x, 30, z), trackDown);
  const hit = trackRaycaster.intersectObjects(walkGroundMeshes, false)[0];
  if (!hit) return null;
  let inland, runupLimit = 3.2;
  if (hit.object.name === 'Island_Sand') {
    const angle = Math.atan2(-z, x), radius = Math.hypot(x, z);
    inland = coastlineRadius(angle) - radius;
    if (inland < .10 || radius < coastlineBandRadius(angle, 10.5) + .16) return null;
    const deck = DOCK_DECK_OBSTACLE, dx = x - deck.x, dz = z - deck.z;
    const localX = dx * Math.cos(deck.angle) + dz * Math.sin(deck.angle);
    const localZ = -dx * Math.sin(deck.angle) + dz * Math.cos(deck.angle);
    if (Math.abs(localX) < deck.halfWidth && Math.abs(localZ) < deck.halfDepth) return null;
  } else if (hit.object.name.startsWith('VoyageTerrain_')) {
    const island = ISLANDS.find(i => hit.object.name === `VoyageTerrain_${i.id}`);
    if (!island) return null;
    const dx = x - island.x, dz = z - island.z, angle = Math.atan2(dx, dz);
    const shore = island.radius * (.955 + .025 * Math.sin(angle * 3 + island.x) + .015 * Math.sin(angle * 5 + island.z));
    const radius = Math.hypot(dx, dz);
    if (radius < shore * .80 || radius > shore - .10) return null;
    inland = shore - radius; runupLimit = Math.min(3.2, island.radius * .22);
  } else return null;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  return { y: hit.point.y, normal: { x: normal.x, y: normal.y, z: normal.z }, inland, runupLimit };
}

function surfaceDive(text) {
  marineMode = 'swim';
  diveSecondsLeft = 0;
  avatarRoute = [];
  avatarTarget = null;
  arrivalAction = null;
  if (text) flash(text);
}

function toggleDive() {
  if (marineMode === 'dive') { surfaceDive('已经浮出水面'); return; }
  if (marineMode !== 'swim') { flash('先走到海边，再点击海面进入水中'); return; }
  if (waterDepthMetres(avatar.position.x, avatar.position.z) < 1) {
    flash('这里水深不足 1 米，请先游到稍深的浅海'); return;
  }
  if (waterDepthMetres(avatar.position.x, avatar.position.z) > diveDepthLimit()) {
    flash(`当前水深超出 ${diveDepthLimit()} 米下潜上限，请游回近岸`); return;
  }
  if (state.diveLevel) {
    if (state.oxygen < 12 && (state.inventory.diveSupply || 0) > 0) {
      state.inventory.diveSupply--;
      if (!state.inventory.diveSupply) delete state.inventory.diveSupply;
      refillOxygen(state);
    }
    if (state.oxygen < 12) { flash('氧气瓶不足，请购买潜水耗材包'); return; }
    diveSecondsMax = Math.min(state.diveLevel === 2 ? 75 : 50, state.oxygen / 2);
  } else diveSecondsMax = 12;
  diveSecondsLeft = diveSecondsMax;
  marineMode = 'dive';
  flash(state.diveLevel ? `开始潜水 · ${Math.ceil(diveSecondsMax)} 秒氧气 · 限深 ${diveDepthLimit()} 米`
    : '徒手闭气潜水 · 最多 12 秒、3 米；氧气耗尽自动上浮');
}

function updateCoastalAvatar(deltaSeconds) {
  if (!avatar) return;
  if (restTransition || bedApproach) return;
  if (boatTrip || voyage?.engaged) {
    if (swimWake) swimWake.visible = false;
    if (diveMarker) diveMarker.visible = false;
    return;
  }
  const depth = waterDepthMetres(avatar.position.x, avatar.position.z);
  if (depth < .25) {
    marineMode = 'land';
    diveBlend = 0;
    diveSecondsLeft = 0;
    avatar.position.y = groundHeightAt(avatar.position.x, avatar.position.z) + .02;
    avatar.rotation.x = THREE.MathUtils.damp(avatar.rotation.x, 0, 8, deltaSeconds);
    avatar.userData.tools.dive.visible = false;
    avatar.userData.fins.forEach((fin) => { fin.visible = false; });
    if (avatar.userData.actionUntil <= sceneElapsed) {
      avatar.userData.limbs.leftArm.rotation.z = THREE.MathUtils.damp(avatar.userData.limbs.leftArm.rotation.z, -.22, 7, deltaSeconds);
      avatar.userData.limbs.rightArm.rotation.z = THREE.MathUtils.damp(avatar.userData.limbs.rightArm.rotation.z, .22, 7, deltaSeconds);
    }
    if (diveMarker) diveMarker.visible = false;
    if (swimWake) swimWake.visible = false;
    return;
  }
  if (marineMode === 'land') { marineMode = 'swim'; flash('已进入海水 · 活动页可下潜，点击沙滩返回'); }
  if (marineMode === 'dive') {
    diveSecondsLeft -= deltaSeconds;
    if (state.diveLevel) state.oxygen = Math.max(0, state.oxygen - deltaSeconds * 2);
    if (diveSecondsLeft <= 0 || (state.diveLevel && state.oxygen <= 0)) {
      surfaceDive('氧气耗尽，已自动上浮');
    } else if (depth > diveDepthLimit() + .1) {
      surfaceDive(`超过 ${diveDepthLimit()} 米安全深度，已自动上浮`);
    }
  }
  diveBlend = THREE.MathUtils.damp(diveBlend, marineMode === 'dive' ? 1 : 0, 5, deltaSeconds);
  const groundY = groundHeightAt(avatar.position.x, avatar.position.z);
  const surfaceY = Math.max(water.position.y - .55, groundY + .03);
  const diveY = Math.max(water.position.y - 1.0, groundY + .12);
  avatar.position.y = THREE.MathUtils.lerp(surfaceY, diveY, diveBlend)
    + Math.sin(sceneElapsed * (avatarTarget ? 7 : 3)) * (marineMode === 'dive' ? .025 : .04);
  avatar.rotation.x = THREE.MathUtils.damp(avatar.rotation.x, .12 + diveBlend * 1.03, 5, deltaSeconds);
  const limbs = avatar.userData.limbs;
  const moving = Boolean(avatarTarget || avatarRoute.length);
  const catching = avatar.userData.actionUntil > sceneElapsed
    && ['rod', 'net', 'hand', 'diveCatch'].includes(avatar.userData.actionKind);
  const phase = sceneElapsed * (moving ? 8 : 3.5);
  limbs.leftLeg.rotation.x = Math.sin(phase) * (marineMode === 'dive' ? .52 : moving ? .35 : .12);
  limbs.rightLeg.rotation.x = -limbs.leftLeg.rotation.x;
  if (!catching) {
    if (marineMode === 'dive') {
      limbs.leftArm.rotation.x = -1.05 + Math.sin(phase) * .24;
      limbs.rightArm.rotation.x = -1.05 - Math.sin(phase) * .24;
      limbs.leftArm.rotation.z = -.08;
      limbs.rightArm.rotation.z = .08;
    } else {
      limbs.leftArm.rotation.x = Math.sin(phase) * (moving ? .62 : .28);
      limbs.rightArm.rotation.x = -limbs.leftArm.rotation.x;
      limbs.leftArm.rotation.z = -.45 - Math.cos(phase) * .18;
      limbs.rightArm.rotation.z = .45 + Math.cos(phase) * .18;
    }
  }
  avatar.userData.tools.dive.visible = marineMode === 'dive' && state.diveLevel > 0;
  avatar.userData.fins.forEach((fin) => { fin.visible = marineMode === 'dive' && state.diveLevel > 0; });
  if (diveMarker) {
    diveMarker.visible = marineMode === 'dive' || diveBlend > .15;
    diveMarker.position.set(avatar.position.x, water.position.y + .09, avatar.position.z);
    diveMarker.children.forEach((bubble, index) => {
      bubble.position.y = .03 + ((sceneElapsed * .45 + index * .33) % .8);
      bubble.position.x = Math.sin(sceneElapsed * 2 + index * 2.1) * (.07 + index * .04);
    });
  }
  if (swimWake) {
    swimWake.visible = marineMode === 'swim' && moving;
    swimWake.position.set(avatar.position.x, water.position.y + .035, avatar.position.z);
    const ripple = 1 + .18 * Math.sin(sceneElapsed * 8);
    swimWake.scale.setScalar(ripple);
    swimWake.material.opacity = moving ? .28 + .1 * Math.sin(sceneElapsed * 8) : 0;
  }
}

function walkTo(x, z, action = null, stopDistance = .72) {
  if (voyage?.engaged) { flash('正在远航，请先返航靠岸后操作家园设施'); return false; }
  const shelterAction = ['hut-door-open', 'hut-door-close'].includes(action?.type);
  if ((storm.phase === 'impact' && !shelterAction) || busyAction || state.shelter.inside) return false;
  if (activeMarineTarget && !['capture', 'sea-capture', 'trip-start'].includes(action?.type)) releaseMarineTarget();
  ({ x, z } = coastTarget(x, z));
  const obstacles = [...walkObstacles, ...state.trees.filter((tree) => tree.stage === 'mature' || tree.stage === 'growing')
    .map((tree) => ({ x: tree.x, z: tree.z, r: .32 + tree.scale * .2 }))];
  if (state.built.hut) obstacles.push(
    { type: 'box', x0: -.68, x1: 3.88, z0: -3.25, z1: .45 },
    { type: 'box', x0: -.3, x1: 1.55, z0: -4.95, z1: -3.77 },
    { x: 2.55, z: -4.26, r: .62 },
    { x: .25, z: -4.72, r: .24 },
    { x: 2.95, z: -4.72, r: .24 },
  );
  if (state.built.dock) obstacles.push(DOCK_DECK_OBSTACLE);
  const route = planWalkRoute(avatar.position, { x, z }, obstacles, MAX_ROUTE_RADIUS);
  if (!route.length) { flash('这里被建筑或植被挡住，暂时无法到达'); return false; }
  avatarRoute = route.slice(1).map((point) => new THREE.Vector3(point.x, avatar.position.y, point.z));
  avatarTarget = new THREE.Vector3(route[0].x, avatar.position.y, route[0].z);
  // A blocked destination is projected to the nearest reachable edge.
  const projected = Math.hypot(route.at(-1).x - x, route.at(-1).z - z) > .3;
  arrivalAction = action ? { ...action, stopDistance: projected ? .12 : stopDistance } : null;
  showWalkDestination(route.at(-1));
  if (Math.hypot(x - avatar.position.x, z - avatar.position.z) > stopDistance) {
    const worldAction = action?.root?.userData.action;
    const notice = action?.type === 'hut-door-open' ? '已选小屋门 · 正前往开门'
      : action?.type === 'hut-door-close' ? '已选小屋门 · 正前往关门'
        : action?.type === 'water-station' ? '已选淡水收集场 · 到达后查看储水'
          : action?.type === 'voyage-board' ? '已选小船 · 正前往码头登船'
            : worldAction?.type === 'gather' ? `已选${worldAction.kind === 'wood' ? '木材' : '贝壳'} · 到达后采集` : null;
    if (notice) flash(notice);
  }
  if (!avatarRoute.length && Math.hypot(avatarTarget.x - avatar.position.x, avatarTarget.z - avatar.position.z) <= (arrivalAction?.stopDistance ?? .12)) {
    avatarTarget = null;
    const next = arrivalAction;
    arrivalAction = null;
    if (next) completeArrival(next);
  }
  return true;
}

function showWalkDestination(point) {
  if (!walkDestinationMarker) {
    walkDestinationMarker = new THREE.Mesh(new THREE.RingGeometry(.34, .48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true, opacity: .9,
        depthWrite: false, side: THREE.DoubleSide }));
    walkDestinationMarker.rotation.x = -Math.PI / 2;
    scene.add(walkDestinationMarker);
  }
  walkDestinationMarker.position.set(point.x, Math.max(groundHeightAt(point.x, point.z), water.position.y) + .08, point.z);
  walkDestinationMarker.visible = true;
  walkDestinationUntil = Date.now() + 2400;
}

function updateWalkDestination() {
  if (!walkDestinationMarker) return;
  const remaining = walkDestinationUntil - Date.now();
  walkDestinationMarker.visible = remaining > 0 && !state.shelter.inside && !voyage?.engaged;
  if (!walkDestinationMarker.visible) return;
  walkDestinationMarker.scale.setScalar(1 + Math.sin(remaining / 150) * .12);
  walkDestinationMarker.material.opacity = Math.min(.9, remaining / 600);
}

function updateAvatar(deltaSeconds) {
  if (restTransition || bedApproach) return;
  if (voyage?.engaged) return;
  if (!avatar || hutCrossing || (storm.phase === 'impact' && !['hut-door-open', 'hut-door-close'].includes(arrivalAction?.type))) return;
  sceneElapsed += deltaSeconds;
  const limbs = avatar.userData.limbs;
  const acting = avatar.userData.actionUntil > sceneElapsed;
  const effects = avatar.userData.effects;
  if (effects?.waterDrops) effects.waterDrops.visible = false;
  if (effects?.rodLine) effects.rodLine.visible = false;
  if (cookingJob) {
    limbs.leftArm.rotation.x = -.85;
    limbs.rightArm.rotation.x = -.9 + Math.sin(sceneElapsed * 7) * .12;
    limbs.leftArm.rotation.z = -.16;
    limbs.rightArm.rotation.z = .25 + Math.cos(sceneElapsed * 7) * .12;
    avatar.userData.toolRoot.rotation.set(0, 0, 0);
  } else if (acting) {
    const progress = THREE.MathUtils.clamp((sceneElapsed - avatar.userData.actionStarted) / avatar.userData.actionDuration, 0, 1);
    const beat = Math.sin(sceneElapsed * 15);
    const cast = Math.sin(progress * Math.PI);
    const action = avatar.userData.actionKind;
    if (action === 'rod') {
      // Step back, cast, then lean into a short reel: visibly distinct from a net sweep.
      limbs.leftArm.rotation.x = -.32 - cast * .66;
      limbs.rightArm.rotation.x = -.58 - cast * .92;
      limbs.leftArm.rotation.z = -.34 - cast * .18;
      limbs.rightArm.rotation.z = .24 + cast * .42;
      avatar.userData.toolRoot.rotation.x = -.16 - cast * .78;
      avatar.userData.toolRoot.rotation.z = -.48 + cast * .76;
      if (effects?.rodLine) {
        effects.rodLine.visible = true;
        effects.rodLine.scale.y = 1 + cast * .68;
        effects.float.position.y = .18 - cast * .16;
      }
    } else if (action === 'net') {
      limbs.leftArm.rotation.x = -.5 - cast * .9;
      limbs.rightArm.rotation.x = -.36 - cast * 1.02;
      limbs.leftArm.rotation.z = -.4 + cast * .2;
      limbs.rightArm.rotation.z = .43 + cast * .22;
      avatar.userData.toolRoot.rotation.x = -.32 - cast * .46;
      avatar.userData.toolRoot.rotation.z = -.88 + cast * 1.58;
    } else if (action === 'hand' || action === 'diveCatch') {
      const reach = action === 'diveCatch' ? 1.22 : .9;
      limbs.leftArm.rotation.x = -reach - cast * .35;
      limbs.rightArm.rotation.x = -reach - cast * .45;
      limbs.leftArm.rotation.z = -.12 - cast * .28;
      limbs.rightArm.rotation.z = .12 + cast * .28;
      avatar.userData.toolRoot.rotation.set(0, 0, 0);
    } else if (action === 'axe') {
      const windup = progress < .42 ? progress / .42 : 1 - (progress - .42) / .58;
      const impact = Math.exp(-Math.pow((progress - .64) / .10, 2));
      limbs.leftArm.rotation.x = -.28 - windup * .85 + impact * .34;
      limbs.rightArm.rotation.x = -.4 - windup * 1.12 + impact * .54;
      limbs.leftArm.rotation.z = -.32 - windup * .52;
      limbs.rightArm.rotation.z = .30 + windup * .66;
      limbs.leftLeg.rotation.x = .18; limbs.rightLeg.rotation.x = -.14;
      avatar.userData.toolRoot.rotation.x = .42 - windup * 1.56 + impact * .72;
      avatar.userData.toolRoot.rotation.z = -.12 + windup * .68 - impact * .25;
    } else if (action === 'shovel') {
      const scoop = Math.sin(progress * Math.PI);
      limbs.leftArm.rotation.x = -.38 - scoop * .68;
      limbs.rightArm.rotation.x = -.22 - scoop * .84;
      limbs.leftArm.rotation.z = -.42 + scoop * .12;
      limbs.rightArm.rotation.z = .34 + scoop * .2;
      limbs.leftLeg.rotation.x = .12; limbs.rightLeg.rotation.x = -.1;
      avatar.userData.toolRoot.rotation.x = .25 - scoop * .88;
      avatar.userData.toolRoot.rotation.z = -.28 + scoop * .38;
    } else if (action === 'wateringCan') {
      const pour = Math.sin(progress * Math.PI);
      limbs.leftArm.rotation.x = -.35 - pour * .58;
      limbs.rightArm.rotation.x = -.2 - pour * .74;
      limbs.leftArm.rotation.z = -.42 - pour * .16;
      limbs.rightArm.rotation.z = .33 + pour * .31;
      limbs.leftLeg.rotation.x = .07; limbs.rightLeg.rotation.x = -.07;
      avatar.userData.toolRoot.rotation.x = -.12 - pour * .34;
      avatar.userData.toolRoot.rotation.z = -.1 - pour * .72;
      if (effects?.waterDrops) {
        effects.waterDrops.visible = progress > .18 && progress < .84;
        effects.waterDrops.children.forEach((drop, index) => {
          const phase = (sceneElapsed * 4.5 + index * .21) % 1;
          drop.position.set(.27 + phase * .14, -.04 - phase * .54, (index % 3 - 1) * .026);
          drop.scale.setScalar(.72 + phase * .35);
        });
      }
    }
  } else if (fishingSession) {
    const reeling = fishingSession.phase === 'reeling';
    const pull = reeling ? Math.sin(sceneElapsed * 9) * .15 : Math.sin(sceneElapsed * 2) * .035;
    limbs.leftArm.rotation.x = -.42 - pull;
    limbs.rightArm.rotation.x = -.62 + pull;
    limbs.leftArm.rotation.z = -.28;
    limbs.rightArm.rotation.z = .38;
    avatar.userData.toolRoot.rotation.x = -.2 + pull;
    avatar.userData.toolRoot.rotation.z = -.2;
  } else {
    avatar.userData.toolRoot.rotation.x = 0;
    avatar.userData.toolRoot.rotation.z = 0;
  }
  if (!avatarTarget) {
    if (!acting && !fishingSession && !cookingJob) {
      limbs.leftLeg.rotation.x = 0;
      limbs.rightLeg.rotation.x = 0;
      limbs.leftArm.rotation.x = 0;
      limbs.rightArm.rotation.x = 0;
    }
    return;
  }
  const dx = avatarTarget.x - avatar.position.x;
  const dz = avatarTarget.z - avatar.position.z;
  const distance = Math.hypot(dx, dz);
  const stop = avatarRoute.length ? .09 : arrivalAction?.stopDistance ?? .12;
  if (distance <= stop + .025) {
    if (avatarRoute.length) {
      avatarTarget = avatarRoute.shift();
      return;
    }
    avatarTarget = null;
    const next = arrivalAction;
    arrivalAction = null;
    if (!acting && !fishingSession) {
      limbs.leftLeg.rotation.x = 0;
      limbs.rightLeg.rotation.x = 0;
      limbs.leftArm.rotation.x = 0;
      limbs.rightArm.rotation.x = 0;
    }
    if (next) completeArrival(next);
    return;
  }
  // Move through the threshold instead of asymptotically parking exactly on
  // it (float rounding could otherwise stall a waypoint forever).
  const stride = Math.min(distance, deltaSeconds * (marineMode === 'dive' ? 1.2 : marineMode === 'swim' ? 1.65 : 3.3));
  avatar.position.x += dx / distance * stride;
  avatar.position.z += dz / distance * stride;
  avatar.rotation.y = Math.atan2(dx, dz);
  const stridePhase = sceneElapsed * 9;
  limbs.leftLeg.rotation.x = Math.sin(stridePhase) * .32;
  limbs.rightLeg.rotation.x = -limbs.leftLeg.rotation.x;
  limbs.leftArm.rotation.x = -limbs.leftLeg.rotation.x * .65;
  limbs.rightArm.rotation.x = -limbs.rightLeg.rotation.x * .65;
}

const rainGroundRay = new THREE.Raycaster(), rainGroundOrigin = new THREE.Vector3();
const rainGroundDown = new THREE.Vector3(0, -1, 0);
const environment = createEnvironment(scene, { rainCount: screen.width < 600 ? 1200 : 2400,
  heightAt: (x, z) => {
    rainGroundRay.set(rainGroundOrigin.set(x, 30, z), rainGroundDown);
    return rainGroundRay.intersectObjects(walkGroundMeshes, false)[0]?.point.y ?? -1.7;
  } });

const seabedGeometry = new THREE.CircleGeometry(220, 96);
seabedGeometry.rotateX(-Math.PI / 2);
{
  const position = seabedGeometry.attributes.position;
  const near = new THREE.Color(0x188b98);
  const far = new THREE.Color(0x03486e);
  const colors = [];
  for (let i = 0; i < position.count; i++) {
    const radius = Math.hypot(position.getX(i), position.getZ(i));
    const color = near.clone().lerp(far, Math.min(1, Math.max(0, (radius - 17) / 30)));
    colors.push(color.r, color.g, color.b);
  }
  seabedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}
const seabed = mesh(seabedGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), 0, -1.7, 0, false);
scene.add(seabed);

const water = mesh(
  new THREE.PlaneGeometry(440, 440),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uLagoon: { value: new THREE.Color(C.lagoon) },
      uShallow: { value: new THREE.Color(C.shallow) },
      uDeep: { value: new THREE.Color(C.deep) },
      uFoam: { value: new THREE.Color(C.foam) },
      uBoat: { value: new THREE.Vector2(BOAT_MOOR.x, BOAT_MOOR.z) },
      uBoatDir: { value: new THREE.Vector2(1, 0) },
      uBoatWake: { value: 0 },
      uTide: { value: 0 },
      uStorm: { value: 0 },
      uDaylight: { value: 1 },
      uSunlight: { value: 1 },
      uMoonlight: { value: 0 },
      uMoonDirection: { value: new THREE.Vector3(-.6, .7, .4).normalize() },
      uSunDirection: { value: new THREE.Vector3(-.4, .8, -.3).normalize() },
      uIslands: { value: ISLANDS.map(i => new THREE.Vector3(i.x, i.z, i.radius)) },
    },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float uTime, uBoatWake, uTide, uStorm, uDaylight,uSunlight,uMoonlight; uniform vec2 uBoat,uBoatDir; uniform vec3 uLagoon,uShallow,uDeep,uFoam,uSunDirection,uMoonDirection; uniform vec3 uIslands[4]; varying vec3 vWorld;
      ${COAST_SWASH_GLSL}
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
      }
      void main(){
        vec2 p=vWorld.xz;
        float ang=atan(-p.y,p.x);
        float r=length(p);
        float shore=${coastlineShaderRadius()};
        // Higher water moves the water/sand intersection inland; lower water
        // reveals the underwater slope. This same contour drives the foam mask.
        float wetShore=shore-uTide*.48;
        float shoreDepth=max(0.0,r-wetShore);
        float runupLimit=3.2;
        for(int i=0;i<4;i++){
          vec2 delta=p-uIslands[i].xy;
          float islandAngle=atan(delta.x,delta.y);
          float islandShore=${islandCoastlineShaderRadius('uIslands[i].z', 'islandAngle', 'uIslands[i].x', 'uIslands[i].y')};
          float islandWet=islandShore-uTide*.2;
          float islandDepth=max(0.0,length(delta)-islandWet);
          if(islandDepth<shoreDepth){shoreDepth=islandDepth;shore=islandShore;wetShore=islandWet;r=length(delta);ang=islandAngle;runupLimit=min(3.2,uIslands[i].z*.22);}
        }
        float lagoon=smoothstep(.45,9.5,shoreDepth);
        float deep=smoothstep(7.0,20.0,shoreDepth);
        float c1=noise(vec2(p.x*2.6+uTime*.35,p.y*2.6-uTime*.30));
        float c2=noise(vec2(p.x*3.5-uTime*.42,p.y*3.5+uTime*.30));
        float caustic=pow(clamp(1.0-abs(c1-c2)*2.8,0.,1.),4.0);
        float lagoonMask=1.0-smoothstep(.0,9.0,shoreDepth);
        float w1=sin(p.x*.5-uTime*(1.1+uStorm*.55))*.5+sin(p.y*.4+uTime*(.9+uStorm*.5))*.5;
        float rip=noise(vec2(p.x*2.8+uTime*(.85+uStorm*.7),p.y*2.8-uTime*(.65+uStorm*.55)))-.5;
        // Water is transparent over dry land. This guard also means surf can
        // never draw a white ring through the beach when shore geometry changes.
        float waterMask=smoothstep(wetShore-.20,wetShore+.95,r);
        // Break the surf into short tangential runs. Its distance comes from the
        // same harmonic shoreline used by the Blender mesh, rather than a circle.
        float along=ang*shore;
        float edgeNoise=(noise(vec2(along*.24+uTime*.12,uTime*.055))-.5)*.24
          +(noise(p*.38+uTime*.045)-.5)*.15;
        vec4 swash=coastSwash(p,shore-r,uTime,uTide,uStorm,runupLimit);
        float shoreFoam=swash.y;
        float surfDistance=shoreDepth+rip*(.13+uStorm*.08)-edgeNoise;
        float breakerOffset=.82+1.1*noise(vec2(along*.13,uTime*.035));
        float outerFoam=smoothstep(breakerOffset,breakerOffset+.13,surfDistance)
          *(1.0-smoothstep(breakerOffset+.20,breakerOffset+.55,surfDistance));
        outerFoam*=smoothstep(.63,.84,noise(vec2(along*.22,uTime*.05)))*.28;
        float foam=max(shoreFoam,outerFoam);
        vec2 boatDelta=p-uBoat;
        vec2 boatSide=vec2(-uBoatDir.y,uBoatDir.x);
        vec2 boatSpace=vec2(dot(boatDelta,uBoatDir),dot(boatDelta,boatSide));
        float trail=clamp((-boatSpace.x-.25)/3.8,0.0,1.0);
        float wakeWidth=.08+trail*.62;
        float wakeWaver=sin(trail*19.0+uTime*1.7)*.055*trail;
        float wakeLines=1.0-smoothstep(.035,.12,abs(abs(boatSpace.y-wakeWaver)-wakeWidth));
        float wakeFade=smoothstep(.25,.6,-boatSpace.x)*(1.0-smoothstep(3.6,4.2,-boatSpace.x));
        foam=max(foam,wakeLines*wakeFade*uBoatWake*(.7+.3*noise(boatSpace*2.0+uTime*.4)));
        foam*=.72+.28*w1;
        vec3 color=mix(uLagoon,uShallow,lagoon);
        color=mix(color,uDeep,deep);
        color+=uFoam*caustic*(.045+rip*.02)*lagoonMask;
        color=mix(color,uFoam,clamp(foam*(.38+uStorm*.12),0.,.48));
        color+=uFoam*rip*.028;
        // Sky reflection: ripple normals catch a pale sky, so the surface reads
        // as lit and reflective instead of a flat sheet of colour.
        vec2 slope=vec2(cos(p.x*1.3+p.y*.8-uTime*.8)*.18+cos(p.x*3.1-uTime*1.2)*.06,
          sin(p.y*1.7-p.x*.5+uTime*.7)*.16+sin(p.y*2.9+uTime*1.1)*.06);
        vec3 rippleN=normalize(vec3(slope.x,1.0,slope.y));
        float fres=pow(1.0-max(dot(rippleN,vec3(0.,1.,0.)),0.),3.0);
        color=mix(color,vec3(.72,.90,1.0),fres*.30*(1.0-deep*.6));
        vec3 halfLight=normalize(uSunDirection+vec3(.40,.82,.40));
        float sparkle=pow(max(0.,dot(rippleN,halfLight)),100.);
        color*=mix(.012,1.0,uDaylight);
        color+=vec3(1.,.90,.71)*sparkle*.15*uSunlight*(1.0-uStorm*.65);
        vec3 moonHalfLight=normalize(uMoonDirection+vec3(.40,.82,.40));
        float moonSparkle=pow(max(0.,dot(rippleN,moonHalfLight)),90.);
        color+=vec3(.56,.69,1.)*moonSparkle*.11*uMoonlight;
        float alpha=(mix(.38,.90,deep)+clamp(foam,0.,1.)*.12)*waterMask;
        gl_FragColor=vec4(color,clamp(alpha,0.,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), 0, -0.02, 0, false,
);
water.rotation.x = -Math.PI / 2;
water.renderOrder = 2;
scene.add(water);

const gltfLoader = new GLTFLoader();
const buildingSources = {};

function parseGlb(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => gltfLoader.parse(buffer, '', resolve, reject));
}

async function loadAtlas() {
  let image;
  try { image = await loadImage('assets/generated/tropical-atlas.webp'); }
  catch { image = await loadImage('assets/generated/tropical-atlas.png'); }
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

const atlasDoubleSidedNames = new Set(['Palm', 'Bush', 'Sea_Grass', 'Kelp']);

function applyAtlas(root, solidMaterial, leafMaterial = solidMaterial) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material = atlasDoubleSidedNames.has(object.name) ? leafMaterial : solidMaterial;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function addInstances(source, placements, material, tint) {
  source.updateMatrixWorld(true);
  const fromRoot = new THREE.Matrix4().copy(source.matrixWorld).invert();
  source.traverse((part) => {
    if (!part.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(fromRoot, part.matrixWorld);
    const instances = new THREE.InstancedMesh(part.geometry, material || part.material, placements.length);
    const placement = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const final = new THREE.Matrix4();
    placements.forEach(([x, y, z, size = 1, angle = 0], index) => {
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
      scale.setScalar(size);
      placement.compose(new THREE.Vector3(x, y, z), rotation, scale);
      instances.setMatrixAt(index, final.multiplyMatrices(placement, local));
      if (tint) instances.setColorAt(index, tint[index % tint.length]);
    });
    if (tint) instances.instanceColor.needsUpdate = true;
    instances.castShadow = true;
    instances.receiveShadow = true;
    scene.add(instances);
  });
}

function createTreeVisuals(source, terrainMeshes) {
  if (!source) return;
  const placements = groundPlacements(source, state.trees.map((tree) => [tree.x, 2, tree.z, tree.scale, tree.angle]), terrainMeshes);
  const sourceBottom = new THREE.Box3().setFromObject(source).min.y;
  const stumpMaterial = mat(0x8f633c);
  const soilMaterial = mat(0x866d4d);
  for (let index = 0; index < state.trees.length; index++) {
    const tree = state.trees[index];
    if (!clearOfFarm(tree.x, tree.z, 1.15 + tree.scale * .35)) continue;
    const placement = placements[index];
    const groundY = placement[1] + sourceBottom * tree.scale;
    const root = actionRoot(new THREE.Group(), { type: 'tree', treeId: tree.id });
    root.position.set(tree.x, groundY, tree.z);
    const crown = source.clone(true);
    crown.rotation.y = tree.angle;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(.23, .35, .3, 10), stumpMaterial);
    stump.position.y = .15;
    stump.castShadow = true;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(.6, .65, .06, 16), soilMaterial);
    soil.position.y = .035;
    soil.receiveShadow = true;
    root.add(crown, stump, soil);
    scene.add(root);
    treeVisuals.set(tree.id, { root, crown, stump, soil, sourceBottom });
  }
  refreshTreeVisuals();
}

function refreshTreeVisuals() {
  for (const tree of state.trees || []) {
    const visual = treeVisuals.get(tree.id);
    if (!visual) continue;
    const hasTree = tree.stage === 'mature' || tree.stage === 'growing';
    const growth = tree.stage === 'mature' ? 1 : .22 + .78 * Math.min(1, tree.ageMinutes / TREE_MATURE_MINUTES);
    const size = tree.scale * growth;
    visual.crown.visible = hasTree;
    visual.crown.scale.setScalar(size);
    visual.crown.position.y = -visual.sourceBottom * size;
    visual.stump.visible = tree.stage === 'stump';
    visual.soil.visible = tree.stage === 'empty' || tree.stage === 'growing';
  }
}

// Reserve every current and future bed, including its label and interaction
// footprint. Clearing only the garden centre left a palm trunk inside a row.
const bedPoints = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]];
for (const dz of [-2.7, 2.7, -1.35, 1.35]) for (const dx of [-4.05, -2.7, 1.35, 2.7, -1.35, 4.05]) {
  if (!bedPoints.some(([x, z]) => x === dx && z === dz)) bedPoints.push([dx, dz]);
}
const FARM_BED_CENTRES = bedPoints.map(([dx, dz]) => [-5.1 + dx, -5.5 + dz]);
const PLOT_POINTS = [[5.5, 2.2], [10.2, 7.0], [FRESHWATER_SITE.x, FRESHWATER_SITE.z]];
const clearOfFarm = (x, z, radius = 1.4) =>
  FARM_BED_CENTRES.every(([px, pz]) => Math.hypot(x - px, z - pz) >= radius);

// Deterministic scatter for reef/foliage dressing. Build plots are kept clear.
function scatter(count, minR, maxR, seed, y, clearance = 0, minScale = .55, maxScale = 1.25) {
  const out = [];
  let state = seed >>> 0;
  const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = minR + rand() * (maxR - minR);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (clearance && (PLOT_POINTS.some(([px, pz]) => Math.hypot(x - px, z - pz) < clearance)
      || !clearOfFarm(x, z, Math.max(1.45, clearance * .75)))) continue;
    out.push([x, y, z, minScale + rand() * (maxScale - minScale), rand() * Math.PI * 2]);
  }
  return out;
}

function addHibiscusBlossoms(placements) {
  const flowers = [[-.36, .68, -.08], [.34, .65, .13], [.04, .73, .35]];
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(.1, 8, 6), mat(0xfff1ed), placements.length * flowers.length * 5);
  const centres = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 7, 5), mat(0xffd565), placements.length * flowers.length);
  const flowerColors = [0xe96a8e, 0xf394a4, 0xf3a473].map((color) => new THREE.Color(color));
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let petalIndex = 0, centreIndex = 0;
  for (const [x, y, z, size = 1, orientation = 0] of placements) {
    for (let flowerIndex = 0; flowerIndex < flowers.length; flowerIndex++) {
      const [fx, fy, fz] = flowers[flowerIndex];
      const cx = x + (fx * Math.cos(orientation) - fz * Math.sin(orientation)) * size;
      const cz = z + (fx * Math.sin(orientation) + fz * Math.cos(orientation)) * size;
      const cy = y + fy * size;
      centres.setMatrixAt(centreIndex++, matrix.compose(new THREE.Vector3(cx, cy + .035 * size, cz),
        new THREE.Quaternion(), new THREE.Vector3(size, size, size)));
      for (let petal = 0; petal < 5; petal++) {
        const angle = orientation + petal * Math.PI * 2 / 5;
        rotation.setFromAxisAngle(Y_AXIS, -angle);
        scale.set(.96 * size, .28 * size, 1.2 * size);
        petals.setMatrixAt(petalIndex, matrix.compose(new THREE.Vector3(
          cx + Math.cos(angle) * .095 * size, cy, cz + Math.sin(angle) * .095 * size), rotation, scale));
        petals.setColorAt(petalIndex++, flowerColors[flowerIndex]);
      }
    }
  }
  petals.instanceMatrix.needsUpdate = true;
  petals.instanceColor.needsUpdate = true;
  centres.instanceMatrix.needsUpdate = true;
  petals.castShadow = centres.castShadow = false;
  scene.add(petals, centres);
}

const marineHitGeometry = new THREE.SphereGeometry(.78, 8, 6);
const marineHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function targetAvailable(target) {
  return target && (state.gatherCooldowns[target.id] || 0) <= state.gameMinutes;
}

function releaseMarineTarget() {
  if (activeMarineTarget) activeMarineTarget.reserved = false;
  activeMarineTarget = null;
  if (marineTargetMarker) marineTargetMarker.visible = false;
}

function reserveMarineTarget(target) {
  releaseMarineTarget();
  target.reserved = true;
  activeMarineTarget = target;
  if (!marineTargetMarker) {
    marineTargetMarker = new THREE.Mesh(new THREE.RingGeometry(.72, .88, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd773, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: .88 }));
    marineTargetMarker.rotation.x = -Math.PI / 2;
    marineTargetMarker.renderOrder = 9;
    scene.add(marineTargetMarker);
  }
  marineTargetMarker.visible = true;
  marineTargetMarker.position.set(target.x, water.position.y + .12, target.z);
}

function ensureFishingVisual() {
  if (fishingVisual) return;
  const root = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(.16, 12, 9), mat(0xf5ede0, .36), 0, .13, 0, false);
  body.scale.set(.8, 1.45, .8);
  const cap = mesh(new THREE.SphereGeometry(.105, 11, 7), mat(0xef713e, .38), 0, .31, 0, false);
  cap.scale.set(.85, .75, .85);
  const stem = mesh(new THREE.CylinderGeometry(.013, .017, .22, 8), mat(0x3b4844), 0, .43, 0, false);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(.29, .39, 30),
    new THREE.MeshBasicMaterial({ color: 0xe9faf0, transparent: true, opacity: .66,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = -.03;
  root.add(body, cap, stem, ripple);
  root.renderOrder = 5;
  scene.add(root);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  fishingLine = new THREE.Line(geometry,
    new THREE.LineBasicMaterial({ color: 0xe2e5d3, transparent: true, opacity: .82, depthTest: false }));
  fishingLine.renderOrder = 5;
  scene.add(fishingLine);
  fishingVisual = { root, ripple };
  root.visible = false;
  fishingLine.visible = false;
}

function updateFishingVisual(time) {
  if (!fishingSession || !avatar) return;
  ensureFishingVisual();
  const session = fishingSession;
  const target = marineTargets.find((entry) => entry.id === session.targetId);
  if (!target) return;
  const cast = session.phase === 'casting' ? Math.min(1, session.elapsed / session.castSeconds) : 1;
  const retrieval = session.phase === 'reeling' ? session.progress * .78 : 0;
  const distance = (1 - retrieval) * cast;
  const x = avatar.position.x + (target.x - avatar.position.x) * distance;
  const z = avatar.position.z + (target.z - avatar.position.z) * distance;
  const bite = session.phase === 'bite';
  const wobble = session.phase === 'waiting' ? Math.sin(time * 4.2) * .035
    : bite ? -.14 + Math.sin(time * 19) * .045
      : session.phase === 'reeling' ? Math.sin(time * 11) * .06 : 0;
  fishingVisual.root.position.set(x, water.position.y + .06 + wobble, z);
  fishingVisual.root.rotation.z = bite ? Math.sin(time * 18) * .18 : 0;
  fishingVisual.ripple.material.color.setHex(bite ? 0xffd068 : 0xe9faf0);
  fishingVisual.ripple.material.opacity = bite ? .83 : .4 + Math.sin(time * 5) * .15;
  const pulse = bite ? 1.25 + Math.sin(time * 15) * .16 : 1 + Math.sin(time * 4) * .08;
  fishingVisual.ripple.scale.setScalar(pulse);
  const lineStart = avatar.localToWorld(new THREE.Vector3(.12, 1.42, .14));
  const positions = fishingLine.geometry.attributes.position;
  positions.setXYZ(0, lineStart.x, lineStart.y, lineStart.z);
  positions.setXYZ(1, x, fishingVisual.root.position.y + .42, z);
  positions.needsUpdate = true;
}

function startFishingSession(target, fromBoat) {
  fishingResult = null;
  const spec = SEAFOOD[target.speciesId];
  if (!targetAvailable(target) || activeMarineTarget?.id !== target.id || !target.proxy.visible) {
    releaseMarineTarget(); flash('鱼已游开，请重新选择可见鱼群'); return false;
  }
  if (state.stamina < spec.stamina) { releaseMarineTarget(); flash('体力不足，先休息再抛竿'); return false; }
  if (state.ecology[target.speciesId] <= 0) { releaseMarineTarget(); flash('这片鱼场暂时稀少，等鱼群恢复'); return false; }
  if (inventoryUsed(state) >= state.backpackCapacity) { releaseMarineTarget(); flash('背包已满，先到交易站出售鱼获'); return false; }
  fishingSession = Object.assign(createFishingSession(target.speciesId, state.rodLevel),
    { targetId: target.id, fromBoat });
  hudOpen = false;
  if (marineTargetMarker) marineTargetMarker.visible = false;
  ensureFishingVisual();
  fishingVisual.root.visible = true;
  fishingLine.visible = true;
  avatar.rotation.y = Math.atan2(target.x - avatar.position.x, target.z - avatar.position.z);
  playAvatarAction('rod');
  drawHud();
  drawFishingPanel();
  return true;
}

function finishFishingSession(reason = null) {
  const session = fishingSession;
  if (!session) return;
  const target = marineTargets.find((entry) => entry.id === session.targetId);
  fishingSession = null;
  if (fishingVisual) fishingVisual.root.visible = false;
  if (fishingLine) fishingLine.visible = false;
  fishingSprite.visible = false;
  if (!reason && session.phase === 'landed') {
    const skillBonus = .11 + session.timingQuality * .13 - session.strain * .04;
    const result = catchSeafood(state, session.speciesId, 'rod', Math.random, { rodSkillBonus: skillBonus });
    if (result.ok && result.caught > 0) {
      if (target) {
        state.gatherCooldowns[target.id] = state.gameMinutes + 360;
        spawnCatchEffects(target, result.caught);
      }
      flash(`收竿成功！${SEAFOOD[session.speciesId].label} ×${result.caught} · 估值 ${result.value} 金`);
    } else if (result.ok) {
      if (target) state.gatherCooldowns[target.id] = state.gameMinutes + 90;
      flash('鱼在最后一下甩脱鱼钩，已消耗体力；换个目标再试');
    } else flash(`收竿未完成：${result.reason === 'capacity' ? '背包已满' : result.reason === 'stamina' ? '体力不足' : '目标已离开或装备不足'}`);
  } else {
    const failure = reason || session.reason || 'cancelled';
    const penalty = failure === 'storm' ? { stamina: 0, minutes: 0, cooldown: 20 }
      : failure === 'cancelled' ? { stamina: 2, minutes: 8, cooldown: 30 }
        : { stamina: failure === 'hook-slip' ? 5 : 3, minutes: failure === 'hook-slip' ? 20 : 15, cooldown: 90 };
    state.stamina = Math.max(0, state.stamina - penalty.stamina);
    if (penalty.minutes) spendActionTime(state, penalty.minutes);
    if (target) state.gatherCooldowns[target.id] = state.gameMinutes + penalty.cooldown;
    const explanation = ({ 'too-early': '浮漂还没下沉，提竿过早惊走了鱼', 'missed-bite': '咬钩窗口已过，鱼脱钩游走',
      'hook-slip': '收线力度与鱼的挣扎不匹配，鱼挣脱了', 'line-slack': '收线太慢，鱼松脱了',
      storm: '风浪变大，已收竿结束垂钓', cancelled: '已收起鱼竿，稍后再试' })[failure] || '鱼儿脱钩了';
    fishingResult = { ...session, phase: 'result', explanation, penalty,
      tip: failure === 'too-early' || failure === 'missed-bite'
        ? '下次等浮漂突然下沉，再点「提竿」'
        : failure === 'hook-slip' || failure === 'line-slack'
          ? '下次跟随鱼的动作调力度，也可开启辅助收线'
          : '稍后选择另一处可见鱼群再试' };
    flash(explanation);
  }
  releaseMarineTarget();
  if (session.fromBoat) startBoatReturnTrip();
  saveState(state);
  drawHud();
  if (fishingResult) drawFishingPanel();
}

function handleFishingAction(action) {
  if (!fishingSession) return;
  if (action === 'cancel') { finishFishingSession('cancelled'); return; }
  if (action === 'hook') {
    const hooked = hookFish(fishingSession);
    if (hooked) { playAvatarAction('rod'); drawFishingPanel(); }
    else if (fishingSession.phase === 'failed') finishFishingSession();
    return;
  }
  if (action === 'assist') { setFishingAssistance(fishingSession, !fishingSession.assisted); drawFishingPanel(); return; }
  if (action === 'force-down' || action === 'force-up') {
    setFishingForce(fishingSession, fishingSession.forceValue + (action === 'force-up' ? .05 : -.05)); drawFishingPanel(); return;
  }
  if (setFishingForce(fishingSession, action)) drawFishingPanel();
}

function updateFishingSession(seconds, timeMs) {
  if (!fishingSession) return;
  if (storm.phase === 'preparing' || storm.phase === 'impact') { finishFishingSession('storm'); return; }
  const previous = fishingSession.phase;
  advanceFishingSession(fishingSession, seconds);
  if (fishingSession.phase === 'failed') { finishFishingSession(); return; }
  if (fishingSession.phase === 'landed') { finishFishingSession(); return; }
  if (previous !== fishingSession.phase || timeMs - lastFishingUiMs > 80) {
    drawFishingPanel(); lastFishingUiMs = timeMs;
  }
  updateFishingVisual(timeMs / 1000);
}

function findMarineTarget(speciesId, preferred = null) {
  const origin = preferred || avatar?.position || { x: 0, z: 0 };
  return marineTargets.filter((target) => target.speciesId === speciesId && targetAvailable(target)
    && (SEAFOOD[speciesId]?.boatTier || Math.hypot(target.x, target.z) <= shoreRadiusAt(target.x, target.z) + MAX_SURFACE_DISTANCE - .4))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z))[0] || null;
}

// Marine animals share instanced draw calls. Each catchable
// instance also has a pick proxy, so inventory only changes for a visible target.
function addSchool(source, count, seed, tint, baseY, material, options = {}) {
  if (!source) return;
  const { radiusMin = 17, radiusMax = 32, spread = .8, sizeMin = 1.4, sizeMax = 2.5,
          bank = 0, bobble = .14, speedMin = .12, speedMax = .3, wander = false, speciesId = null } = options;
  let state = seed >>> 0;
  const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const data = [];
  let groundMinY = 0;
  if (speciesId === 'crab') {
    groundMinY = Infinity;
    source.traverse((part) => {
      if (!part.isMesh) return;
      part.geometry.computeBoundingBox();
      groundMinY = Math.min(groundMinY, part.geometry.boundingBox.min.y);
    });
    if (!Number.isFinite(groundMinY)) groundMinY = 0;
  }
  for (let i = 0; i < count; i++) {
    const radius = radiusMin + rand() * (radiusMax - radiusMin);
    const speed = speedMin + rand() * (speedMax - speedMin);
    const phase = rand() * Math.PI * 2;
    data.push({
      radius,
      speed: wander ? speed : speed * (rand() < .5 ? -1 : 1),
      phase,
      roamer: wander ? createRoamer(radius, phase, speed, seed + i * 73) : null,
      crab: speciesId === 'crab' ? createSandCrab(radius, phase, seed + i * 73) : null,
      bob: rand() * Math.PI * 2,
      y: baseY + (rand() - .5) * spread,
      size: sizeMin + rand() * (sizeMax - sizeMin),
      bank,
      bobble,
      groundMinY,
    });
  }
  if (speciesId) data.forEach((member, index) => {
    const target = { id: `marine-${speciesId}-${seed}-${index}`, speciesId, member, source,
      x: member.crab?.x ?? member.roamer?.x ?? Math.cos(member.phase) * member.radius,
      z: member.crab?.z ?? member.roamer?.z ?? Math.sin(member.phase) * member.radius,
      y: member.y, reserved: false };
    const proxy = actionRoot(new THREE.Mesh(marineHitGeometry, marineHitMaterial), { type: 'marine', targetId: target.id });
    proxy.position.set(target.x, target.y, target.z);
    scene.add(proxy);
    target.proxy = proxy;
    member.target = target;
    marineTargets.push(target);
  });
  source.traverse((part) => {
    if (!part.isMesh) return;
    const geometry = speciesId === 'crab' ? part.geometry.clone() : part.geometry;
    const crabGait = speciesId === 'crab' ? new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2) : null;
    if (crabGait) {
      crabGait.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('crabGait', crabGait);
      data.forEach((member, i) => crabGait.setXY(i, member.crab.gait, 0));
    }
    const inst = new THREE.InstancedMesh(geometry, material || part.material, count);
    inst.castShadow = false;
    inst.receiveShadow = false;
    if (material?.userData?.surfaceSchool) inst.renderOrder = 3;
    if (tint) {
      for (let i = 0; i < count; i++) inst.setColorAt(i, tint[i % tint.length]);
      inst.instanceColor.needsUpdate = true;
    }
    scene.add(inst);
    animated.push({
      school: { inst, data, crabGait, normal: new THREE.Vector3(), slopeQuat: new THREE.Quaternion(),
                matrix: new THREE.Matrix4(), pos: new THREE.Vector3(),
                quat: new THREE.Quaternion(), bankQuat: new THREE.Quaternion(),
                scale: new THREE.Vector3() },
    });
  });
}

async function loadSceneAssets() {
  const [islandAsset, vegetationAsset, buildingAsset, avatarAsset, atlas] = await Promise.all([
    parseGlb(islandGlb), parseGlb(vegetationGlb), parseGlb(buildingsGlb), parseGlb(avatarGlb), loadAtlas(),
  ]);
  const atlasMaterial = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: .88, metalness: 0 });
  const atlasLeafMaterial = createFoliageMaterial(windShaderUniforms, atlas);
  const authoredPlantMaterial = createFoliageMaterial(windShaderUniforms);
  applyAtlas(islandAsset.scene, atlasMaterial);
  const beach = islandAsset.scene.getObjectByName('Island_Sand');
  if (beach) beach.material = createBeachMaterial(water.material.uniforms);
  applyFoliageAtlas(vegetationAsset.scene, atlasMaterial, atlasLeafMaterial, authoredPlantMaterial);
  applyAtlas(buildingAsset.scene, atlasMaterial);
  avatarTemplate = avatarAsset.scene;
  avatarTemplate.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.name === 'Avatar_ContactMarker') object.visible = false;
  });
  const boatMesh = islandAsset.scene.getObjectByName('Boat');
  if (boatMesh) {
    // The source GLB bakes its island-space location into vertex positions.
    // Centre it once so rocking and upgrades share a true hull pivot.
    boatMesh.geometry.translate(-BOAT_MESH_ORIGIN.x, -BOAT_MESH_ORIGIN.y, -BOAT_MESH_ORIGIN.z);
    heroBoat = new THREE.Group();
    heroBoat.name = 'BoatPivot';
    heroBoat.position.set(BOAT_MESH_ORIGIN.x, BOAT_MESH_ORIGIN.y, BOAT_MESH_ORIGIN.z);
    heroBoat.add(boatMesh);
    heroBoat.userData.action = { type: 'voyage-board' };
    interactive.push(heroBoat);
    islandAsset.scene.add(heroBoat);
  }
  // The playable hut is built from Hut_Source; the baked showcase copy must not overlap it.
  const showcaseHut = islandAsset.scene.getObjectByName('HeroHut');
  if (showcaseHut) showcaseHut.visible = false;
  islandAsset.scene.updateMatrixWorld(true);
  const terrainMeshes = ['Island_Grass', 'Island_Sand', 'Island_Underwater']
    .map((name) => islandAsset.scene.getObjectByName(name)).filter(Boolean).concat(seabed);
  walkGroundMeshes = terrainMeshes;
  scene.add(islandAsset.scene);
  islandAsset.scene.traverse((object) => {
    if (object.name.startsWith('HutRoof')) hutRoofs.push(object);
  });
  createBoatUpgradeVisuals();

  for (const kind of ['garden', 'hut', 'dock']) {
    buildingSources[kind] = buildingAsset.scene.getObjectByName(`${kind[0].toUpperCase()}${kind.slice(1)}_Source`);
  }

  const palmSource = vegetationAsset.scene.getObjectByName('Palm_Source');
  voyagePalmSource = palmSource;
  createTreeVisuals(palmSource, terrainMeshes);
  const bushSource = vegetationAsset.scene.getObjectByName('Bush_Source');
  const clearBushes = sparseBushPlacements(
    scatter(64, 6.4, 11.2, 7, 2, 1.8, .55, .95),
    { trees: state.trees, farmBeds: FARM_BED_CENTRES,
      hut: { x: 1.6, z: -1.4 }, dock: DOCK_APPROACH, trade: TRADE_SIGN_POSITION,
      maxCount: 14 },
  );
  const bushPlacements = groundPlacements(bushSource, clearBushes, terrainMeshes);
  addInstances(bushSource, bushPlacements, undefined, bushSource.userData.authoredPlant
    ? undefined : [0xc9eab1, 0xe3f3c2, 0xa9d397].map((color) => new THREE.Color(color)));
  // The approved mesh already includes its attached petals and stamens.
  if (!bushSource.userData.authoredPlant) addHibiscusBlossoms(bushPlacements);
  for (const [x, , z, scale] of clearBushes) if (Math.hypot(x, z) < 11.3) walkObstacles.push({ x, z, r: .42 + scale * .42 });
  const rockSource = vegetationAsset.scene.getObjectByName('Rock_Source');
  voyageArtAssets = {
    rock: rockSource, bush: bushSource,
    coral: vegetationAsset.scene.getObjectByName('Reef_Staghorn_Source'),
    seaGrass: vegetationAsset.scene.getObjectByName('Sea_Grass_Source'),
    fish: vegetationAsset.scene.getObjectByName('Fish_A_Source'),
  };
  const rocks = [
    [-7.4, 1.3, 5.2, .7], [7.8, 1.1, 5.1, .62], [-8.5, 1, -4.2, .65], [8.7, 1, -3.5, .58],
  ];
  addInstances(rockSource, groundPlacements(rockSource, rocks, terrainMeshes).concat(scatter(24, 18, 34, 11, -1.45, 0, .7, 1.3)));
  for (const [x, , z, scale] of rocks) walkObstacles.push({ x, z, r: .3 + scale * .35 });
  const reefMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: 0 });
  const coralTint = [0x86e0ff, 0xb79cff, 0xffc46e, 0xff8fb4, 0x84ecc8, 0xff9a86].map((c) => new THREE.Color(c));
  const plantTint = [0x6fd48f, 0x93dd6c, 0x46c295, 0x7fca7c].map((c) => new THREE.Color(c));
  const bloomTint = [0xff9fc0, 0xffd27f, 0xff8f8f, 0xc9a6ff].map((c) => new THREE.Color(c));
  const reefSource = (name) => vegetationAsset.scene.getObjectByName(name + '_Source');
  const reefKinds = [
    ['Reef_Staghorn', 30, 18, 34, 31, .8, 1.5, coralTint],
    ['Reef_Fan', 20, 19, 34, 37, .8, 1.4, coralTint],
    ['Reef_Brain', 26, 18, 33, 41, .7, 1.2, coralTint],
    ['Reef_Table', 18, 19, 35, 43, .8, 1.3, coralTint],
    ['Reef_Tube', 30, 18, 34, 47, .8, 1.4, coralTint],
    ['Reef_Mushroom', 18, 18, 32, 53, .7, 1.2, coralTint],
    ['Reef_Anemone', 20, 18, 33, 59, .7, 1.1, coralTint],
    ['Sea_Grass', 40, 17, 34, 61, .8, 1.6, plantTint],
    ['Kelp', 22, 18, 33, 67, .8, 1.3, plantTint],
  ];
  const reefFloor = [islandAsset.scene.getObjectByName('Island_Underwater'), seabed].filter(Boolean);
  for (const [name, count, r0, r1, seed, s0, s1, tint] of reefKinds) {
    addInstances(reefSource(name), offshorePlacements(scatter(count, r0, r1, seed, -1.7, 0, s0, s1), .5), reefMaterial, tint);
  }
  const coralSource = reefSource('Coral');
  const coralSites = offshorePlacements(scatter(68, 16.5, 23.5, 19, -1.7, 0, .36, .68), 2.1);
  addInstances(coralSource, groundPlacements(coralSource, coralSites, reefFloor), reefMaterial, [...coralTint, ...bloomTint]);

  const fishMaterial = (pattern) => {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .52, metalness: 0,
      transparent: true, opacity: .58, depthWrite: false });
    // In the clear-water pass fish remain partly submerged, but their markings
    // are legible instead of being obscured by the near-opaque ocean overlay.
    material.userData.surfaceSchool = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCreatureTime = { value: 0 };
      animatedShaderUniforms.push(shader.uniforms.uCreatureTime);
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nuniform float uCreatureTime;\nvarying vec3 vFishLocal;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFishLocal = position;
          float tailWeight=1.0-smoothstep(-.72,-.16,position.x);
          transformed.z+=sin(uCreatureTime*5.0+position.x*3.8)*.055*tailWeight;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nvarying vec3 vFishLocal;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float body = smoothstep(-.42, -.32, vFishLocal.x) * (1.0 - smoothstep(.39, .49, vFishLocal.x));
          float eye = 1.0 - smoothstep(.005, .025, length(vec2((vFishLocal.x-.38)*.9, vFishLocal.y-.06)));
          float gill = (1.0 - smoothstep(.009, .024, abs(vFishLocal.x-.27))) * body;
          ${pattern}
          diffuseColor.rgb *= 1.0 - eye*.82 - gill*.26;`);
    };
    material.customProgramCacheKey = () => `island-fish-pattern-${pattern}`;
    return material;
  };
  const reefStripeMaterial = fishMaterial(`
    float band = 1.0 - smoothstep(.48, .80, sin(vFishLocal.x*26.0));
    diffuseColor.rgb *= 1.0 - .48*band*body;
    diffuseColor.rgb += vec3(.08,.08,.02) * smoothstep(.02,.14,vFishLocal.y) * body;`);
  const lagoonSpotMaterial = fishMaterial(`
    float spots = sin(vFishLocal.x*38.0) * sin(vFishLocal.y*37.0 + vFishLocal.z*27.0);
    float mark = smoothstep(.65,.88,spots)*body;
    diffuseColor.rgb *= 1.0 - .52*mark;
    diffuseColor.rgb += vec3(.08,.04,.02) * smoothstep(.04,.19,vFishLocal.y) * body;`);
  const silverJackMaterial = fishMaterial(`
    float flank = 1.0 - smoothstep(.014,.06,abs(vFishLocal.y-.08));
    diffuseColor.rgb *= 1.0 - .56*flank*body;
    diffuseColor.rgb += vec3(.10,.12,.12) * (1.0-smoothstep(-.13,.03,vFishLocal.y)) * body;`);
  const animalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: 0 });
  addSchool(reefSource('Fish_A'), 24, 71, [0xefd38b, 0xe4bd78].map((c) => new THREE.Color(c)), -.75, reefStripeMaterial,
            { radiusMin: 16.5, radiusMax: 18.5, spread: .9, sizeMin: .76, sizeMax: 1.22, speedMin: .24, speedMax: .45, wander: true, speciesId: 'reefFish' });
  addSchool(reefSource('Fish_B'), 16, 83, [0xe68d65, 0xd7715d].map((c) => new THREE.Color(c)), -1.1, lagoonSpotMaterial,
            { radiusMin: 16.5, radiusMax: 18.5, spread: .8, sizeMin: .76, sizeMax: 1.13, speedMin: .22, speedMax: .41, wander: true, speciesId: 'reefFish' });
  const crabSource = new THREE.Mesh(createSandCrabGeometry(), createSandCrabMaterial());
  addSchool(crabSource, 7, 103, [new THREE.Color(0xffceac), new THREE.Color(0xf8b786)], .75, crabSource.material,
            { radiusMin: 12.6, radiusMax: 14.2, spread: .06, sizeMin: .42, sizeMax: .54, bobble: .012, speedMin: .025, speedMax: .06, speciesId: 'crab' });
  addSchool(reefSource('Sea_SilverJack'), 12, 107, [new THREE.Color(0xbce6e1), new THREE.Color(0x9fd2d5)], -.82, silverJackMaterial,
            { radiusMin: 22, radiusMax: 31, spread: .65, sizeMin: .9, sizeMax: 1.34, bank: .08, speedMin: .3, speedMax: .54, wander: true, speciesId: 'silverJack' });
  addSchool(reefSource('Sea_Lobster'), 5, 109, [new THREE.Color(0xc75b43), new THREE.Color(0xdf7653)], -1.42, animalMaterial,
            { radiusMin: 18, radiusMax: 24, spread: .12, sizeMin: .6, sizeMax: .85, bobble: .02, speedMin: .02, speedMax: .05, speciesId: 'lobster' });
  const oysterSource = reefSource('Sea_PearlOyster');
  addSchool(oysterSource, 4, 113, [new THREE.Color(0xe4d6c4), new THREE.Color(0xc7b4d1)], -1.56, reefMaterial,
    { radiusMin: 25, radiusMax: 29, spread: 0, sizeMin: .55, sizeMax: .78, bobble: 0, speedMin: 0, speedMax: 0, speciesId: 'pearlOyster' });

  const birdTint = [0xf2f6fa, 0xdfe8f0, 0xcdd8e2].map((c) => new THREE.Color(c));
  const birdMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: 0 });
  birdMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uCreatureTime = { value: 0 };
    animatedShaderUniforms.push(shader.uniforms.uCreatureTime);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCreatureTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wingWeight=smoothstep(.08,.34,abs(position.z));
        transformed.y+=sin(uCreatureTime*8.0+abs(position.z)*.7)*.28*wingWeight;`);
  };
  birdMaterial.customProgramCacheKey = () => 'island-bird-flap-v1';
  addSchool(reefSource('Bird_A'), 10, 91, birdTint, 7.5, birdMaterial,
            { radiusMin: 12, radiusMax: 30, spread: 5, sizeMin: .4, sizeMax: .7, bank: .6, bobble: .3 });
  addSchool(reefSource('Bird_B'), 8, 97, birdTint, 9.5, birdMaterial,
            { radiusMin: 10, radiusMax: 26, spread: 4, sizeMin: .35, sizeMax: .6, bank: .6, bobble: .3 });
}

function createBoatUpgradeVisuals() {
  if (!heroBoat || visualProps.boatUpgrades) return;
  const root = new THREE.Group();
  const iron = new THREE.Group();
  const speed = new THREE.Group();
  const metal = mat(0x6a8588, .38);
  const trim = mat(0xc89445, .55);
  for (const side of [-1, 1]) {
    iron.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.3, .35, side * .28), new THREE.Vector3(0, .52, side * .38), new THREE.Vector3(1.28, .34, side * .28),
    ]), 10, .026, 6, false), metal, 0, 0, 0, false));
  }
  const bowBand = mesh(new THREE.TorusGeometry(.2, .024, 5, 12), trim, 1.3, .33, 0, false);
  bowBand.rotation.y = Math.PI / 2; iron.add(bowBand);
  const motor = mesh(new THREE.CapsuleGeometry(.16, .28, 4, 9), metal, -1.35, .36, 0, false);
  motor.rotation.z = Math.PI / 2;
  const propeller = new THREE.Group();
  propeller.position.set(-1.55, .2, 0);
  for (const angle of [0, Math.PI * .67, Math.PI * 1.33]) {
    const blade = mesh(new THREE.SphereGeometry(.09, 8, 5), trim, Math.cos(angle) * .1, Math.sin(angle) * .1, 0, false);
    blade.scale.set(1.6, .38, .2); propeller.add(blade);
  }
  speed.add(motor, propeller);
  root.add(iron, speed);
  visualProps.boatUpgrades = { root, iron, speed, propeller };
  scene.add(root);
  refreshBoatVisuals();
}

function refreshBoatVisuals() {
  const props = visualProps.boatUpgrades;
  if (!props || !heroBoat) return;
  props.root.position.copy(heroBoat.position);
  props.root.rotation.copy(heroBoat.rotation);
  props.iron.visible = state.boatTier === 'iron' || state.boatTier === 'speed';
  props.speed.visible = state.boatTier === 'speed';
}

function actionRoot(object, data) {
  object.userData.action = data;
  interactive.push(object);
  return object;
}

function addResource(kind, x, z, nodeId) {
  const group = actionRoot(new THREE.Group(), { type: 'gather', kind, nodeId, active: true });
  group.position.set(x, groundHeightAt(x, z) + .025, z);
  if (kind === 'wood') {
    for (const [i, xOffset, angle] of [[0, -.12, -.15], [1, .12, .12], [2, .01, .42]]) {
      const log = mesh(i === 2 ? driftwoodBranch : driftwoodLong,
        materials.driftwood, xOffset, .16 + i * .06, (i - 1) * .12);
      log.rotation.set((i - 1) * .12, angle, Math.PI / 2 + (i - 1) * .08);
      group.add(log);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * .27, z = Math.sin(i) * .18;
      const shell = mesh(shellGeometries[i % 2], i % 2 ? materials.pinkShell : materials.shell, x, .12, z);
      shell.rotation.y = i * .72;
      group.add(shell);
      const lip = mesh(new THREE.TorusGeometry((i % 2 ? .27 : .22) * .82, .012, 5, 14), mat(i % 2 ? 0xc77d93 : 0xd3b892), x, .135, z, false);
      lip.rotation.x = Math.PI / 2;
      lip.rotation.z = i * .72;
      group.add(lip);
    }
  }
  scene.add(group);
}

function createResources() {
  const westernWrack = upperBeachPoint(2.1);
  const southernWrack = upperBeachPoint(-2.1);
  addResource('wood', westernWrack.x, westernWrack.z, 'wood-wrack-west');
  addResource('wood', southernWrack.x, southernWrack.z, 'wood-wrack-south');
  addResource('shells', -7.6, 5.5, 'shells-76-55');
  addResource('shells', 7.6, -4.8, 'shells-76-48');
}

function createSiteProps() {
  if (visualProps.root) return;
  const root = new THREE.Group();
  const wood = mat(0x765037);
  const rope = mat(0xc9ad78, .96);
  const metal = mat(0x64777a, .42);
  const radio = new THREE.Group();
  radio.position.set(9.15, 1.5, 6.25);
  const radioBody = mesh(new THREE.CylinderGeometry(.24, .29, .18, 10), mat(0x3c6e69, .72), 0, .37, 0, false);
  radioBody.rotation.x = Math.PI / 2;
  const dial = mesh(new THREE.TorusGeometry(.075, .018, 5, 12), rope, 0, .37, .105, false);
  dial.rotation.x = Math.PI / 2;
  const antenna = curvedRod(.52, .012, metal);
  antenna.position.set(.08, .45, 0); antenna.rotation.z = -.15;
  for (const x of [-.17, .17]) radio.add(mesh(new THREE.CylinderGeometry(.025, .04, .52, 7), wood, x, .15, 0, false));
  radio.add(radioBody, dial, antenna);
  const crate = new THREE.Group();
  crate.position.set(8.75, 1.25, 6.45);
  for (const y of [.12, .28, .44]) crate.add(mesh(new RoundedBoxGeometry(.46, .08, .34, 3, .025), wood, 0, y, 0, false));
  for (const x of [-.22, .22]) crate.add(mesh(new THREE.CylinderGeometry(.035, .04, .52, 7), wood, x, .27, -.15, false));
  root.add(radio, crate);

  const anchor = new THREE.Group();
  anchor.position.set(9.4, 2.12, 7.3);
  const shank = mesh(new THREE.CylinderGeometry(.035, .05, .54, 8), metal, 0, .25, 0, false);
  const ring = mesh(new THREE.TorusGeometry(.09, .018, 6, 12), metal, 0, .55, 0, false);
  ring.rotation.x = Math.PI / 2;
  const stock = mesh(new THREE.CylinderGeometry(.025, .025, .42, 7), wood, 0, .4, 0, false);
  stock.rotation.z = Math.PI / 2;
  for (const direction of [-1, 1]) {
    const fluke = mesh(new THREE.ConeGeometry(.1, .22, 4), metal, direction * .1, .04, 0, false);
    fluke.rotation.z = direction * 1.02;
    anchor.add(fluke);
  }
  const coil = mesh(new THREE.TorusGeometry(.19, .018, 6, 18), rope, .26, .09, .02, false);
  coil.rotation.x = Math.PI / 2;
  anchor.add(shank, ring, stock, coil); root.add(anchor);

  const barrierSite = actionRoot(new THREE.Group(), { type: 'wave-barrier-site' });
  const barrier = new THREE.Group();
  const pileWood = mat(0x82613f);
  const railWood = mat(0xac8353);
  const seaStone = mat(0x7d918b);
  const points = WAVE_BARRIER_POSTS.map((point) => new THREE.Vector3(point.x, 0, point.z));
  const radial = new THREE.Vector3(WAVE_BARRIER_SITE.x, 0, WAVE_BARRIER_SITE.z).normalize();
  const beam = (from, to, radius, material) => {
    const direction = new THREE.Vector3().subVectors(to, from);
    const part = mesh(new THREE.CylinderGeometry(radius * .9, radius, direction.length(), 9), material,
      (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, false);
    part.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
    barrier.add(part);
  };
  for (let row = 0; row < 2; row++) {
    const offset = row ? .34 : -.34;
    const line = points.map((point) => point.clone().addScaledVector(radial, offset));
    line.forEach((point, index) => {
      const seabed = groundHeightAt(point.x, point.z);
      const top = .64 + (index % 2) * .09;
      beam(new THREE.Vector3(point.x, seabed - .08, point.z),
        new THREE.Vector3(point.x + radial.x * .08, top, point.z + radial.z * .08), .085, pileWood);
      const footing = mesh(new THREE.DodecahedronGeometry(.24, 1), seaStone,
        point.x, seabed + .08, point.z, false);
      footing.scale.set(1.15, .58, .85);
      barrier.add(footing);
      if (index % 2 === 0) {
        const braceFoot = point.clone().addScaledVector(radial, row ? .25 : -.25);
        beam(new THREE.Vector3(braceFoot.x, groundHeightAt(braceFoot.x, braceFoot.z), braceFoot.z),
          new THREE.Vector3(point.x, .38, point.z), .045, pileWood);
      }
    });
    for (let index = 0; index < line.length - 1; index++) {
      for (const height of [.22, .47]) {
        beam(new THREE.Vector3(line[index].x, height, line[index].z),
          new THREE.Vector3(line[index + 1].x, height, line[index + 1].z), .047, railWood);
      }
    }
  }
  barrierSite.add(barrier);

  const marker = new THREE.Group();
  marker.position.set(WAVE_BARRIER_SITE.x, .12, WAVE_BARRIER_SITE.z);
  marker.add(mesh(new THREE.CylinderGeometry(.16, .21, .28, 12), mat(0xe2aa4a, .5), 0, .12, 0, false));
  marker.add(mesh(new THREE.TorusGeometry(.25, .025, 7, 20), mat(0xffdf91, .46), 0, .13, 0, false));
  marker.add(mesh(new THREE.CylinderGeometry(.025, .03, .53, 8), pileWood, 0, .49, 0, false));
  const markerCanvas = offscreen(512, 96);
  const markerContext = markerCanvas.getContext('2d');
  markerContext.fillStyle = 'rgba(5, 48, 53, .94)';
  roundRect(markerContext, 4, 4, 504, 88, 14);
  markerContext.fillStyle = '#ffe5a3';
  markerContext.textAlign = 'center';
  markerContext.font = '700 43px sans-serif';
  markerContext.fillText('护栏安装点', 256, 65);
  const markerTexture = new THREE.CanvasTexture(markerCanvas);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  const markerLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture, transparent: true, depthTest: true }));
  markerLabel.position.set(0, 1.28, 0);
  markerLabel.scale.set(4.8, 1.02, 1);
  marker.add(markerLabel);
  marker.add(mesh(new THREE.SphereGeometry(.7, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, .62, 0, false));
  barrierSite.add(marker);
  root.add(barrierSite);

  const cabinet = new THREE.Group();
  cabinet.position.set(4.1, 2.2, .8);
  for (const x of [-.21, .21]) for (const z of [-.13, .13]) cabinet.add(mesh(new THREE.CylinderGeometry(.026, .034, .42, 7), wood, x, .2, z, false));
  cabinet.add(mesh(new THREE.CylinderGeometry(.28, .3, .48, 8), mat(0x496c65, .78), 0, .48, 0, false));
  const cabinetBand = mesh(new THREE.TorusGeometry(.255, .015, 5, 12), rope, 0, .48, .01, false);
  cabinetBand.rotation.x = Math.PI / 2; cabinet.add(cabinetBand); root.add(cabinet);

  const shutters = new THREE.Group();
  shutters.position.set(2.8, 3.52, .2);
  for (const x of [-.18, .18]) {
    const shutter = mesh(new RoundedBoxGeometry(.14, .36, .028, 3, .012), wood, x, 0, 0, false);
    shutter.rotation.y = x * 1.5; shutters.add(shutter);
  }
  root.add(shutters);
  visualProps.root = root;
  visualProps.anchor = anchor;
  visualProps.barrier = barrier;
  visualProps.barrierMarker = marker;
  visualProps.cabinet = cabinet;
  visualProps.shutters = shutters;
  scene.add(root);
  refreshSiteProps();
}

function refreshSiteProps() {
  if (!visualProps.root) return;
  const defenses = state.defenses || {};
  visualProps.anchor.visible = defenses.anchor === true || Number(defenses.anchor) > 0;
  visualProps.barrier.visible = defenses.waveBarrier === true || Number(defenses.waveBarrier) > 0;
  visualProps.barrierMarker.visible = !visualProps.barrier.visible;
  visualProps.cabinet.visible = defenses.waterproofCabinet === true || Number(defenses.waterproofCabinet) > 0;
  visualProps.shutters.visible = defenses.shutters === true || Number(defenses.shutters) > 0;
}

const plots = {
  garden: { pos: [-5.1, 2.05, -5.5] },
  hut: { pos: [1.6, 2.0, -1.4] },
  dock: { pos: [10.2, .95, 7.0] },
};
const HUT_APPROACH = { x: 1.6, z: -5.4 };
const KITCHEN_SITE = { x: -.95, z: -5.8 };
const KITCHEN_APPROACH = { x: .1, z: -5.8 };

function activateHutDoor() {
  if (!state.built.hut || hutCrossing || busyAction) return;
  const intent = hutDoorIntent(state.shelter, Math.hypot(avatar.position.x - HUT_DOOR_OUTSIDE.x, avatar.position.z - HUT_DOOR_OUTSIDE.z));
  if (intent === 'open') {
    state.shelter.doorOpen = true;
    hudPage = 'activity'; hudOpen = true;
    flash('小屋门已打开 · 点屋外或“走出小屋”出门；再次点门关闭');
  } else if (intent === 'close') { closeHutDoor(); return; }
  else if (intent === 'approach') {
    walkTo(HUT_DOOR_OUTSIDE.x, HUT_DOOR_OUTSIDE.z, { type: 'hut-door-open' }, .45);
  } else startHutCrossing(true);
  saveState(state);
  drawHud();
}

function closeHutDoor() {
  if (!state.shelter.doorOpen || hutCrossing || busyAction) return;
  if (!state.shelter.inside && Math.hypot(avatar.position.x - HUT_DOOR_OUTSIDE.x, avatar.position.z - HUT_DOOR_OUTSIDE.z) > 1.4) {
    walkTo(HUT_DOOR_OUTSIDE.x, HUT_DOOR_OUTSIDE.z, { type: 'hut-door-close' }, .45);
    return;
  }
  state.shelter.doorOpen = false;
  if (state.shelter.inside) { hudPage = 'activity'; hudOpen = true; }
  flash(state.shelter.inside ? '小屋门已关闭 · 留在屋内安全避险' : '小屋门已关闭');
  saveState(state);
  drawHud();
}

function startHutCrossing(entering, destination = null) {
  if (hutCrossing || busyAction || !avatar) return;
  const crossing = createHutCrossing(state.shelter, avatar.position, entering, destination);
  if (!crossing) return;
  avatarTarget = null;
  avatarRoute = [];
  arrivalAction = null;
  hutCrossing = crossing;
  hudOpen = false;
}

function updateHutDoor(deltaSeconds) {
  if (hutDoorLabel) {
    const text = state.shelter.inside ? (state.shelter.doorOpen ? '小屋 · 关门' : '小屋 · 开门')
      : state.shelter.doorOpen ? '小屋 · 进入' : '小屋 · 开门';
    paintActionLabel(hutDoorLabel, text);
  }
  if (hutDoorPivot) {
    const target = state.shelter.doorOpen ? 1.35 : 0;
    hutDoorPivot.rotation.y += (target - hutDoorPivot.rotation.y) * Math.min(1, deltaSeconds * 8);
  }
  if (!hutCrossing || !avatar) return;
  const step = stepHutCrossing(state.shelter, hutCrossing, deltaSeconds);
  avatar.position.x = step.x;
  avatar.position.z = step.z;
  avatar.rotation.y = Math.atan2(hutCrossing.endX - hutCrossing.startX, hutCrossing.endZ - hutCrossing.startZ);
  if (!step.done) return;
  const destination = hutCrossing.destination;
  hutCrossing = null;
  // Crossing used to hide the only close button. Present indoor controls
  // immediately on arrival, independently of the previously selected tab.
  if (state.shelter.inside) { hudPage = 'activity'; hudOpen = true; }
  else if (hudPage === 'activity') hudOpen = false;
  updateCamera();
  flash(state.shelter.inside ? '已进入小屋 · 请关门避险' : '已走出小屋 · 请关门');
  saveState(state);
  drawHud();
  if (destination && !state.shelter.inside && storm.phase !== 'impact') walkTo(destination.x, destination.z);
}

function createHutDoorSign() {
  const root = actionRoot(new THREE.Group(), { type: 'hut-door' });
  root.position.set(1.5, 2.03, -3.28);
  const sign = mesh(new RoundedBoxGeometry(.9, .33, .07, 2, .04), mat(0x214d4a), 0, 2.05, -.15, false);
  root.add(sign);
  hutDoorLabel = createActionLabel('小屋 · 开门', 2.5);
  hutDoorLabel.position.set(0, 2.48, -.35);
  root.add(hutDoorLabel);
  root.add(mesh(new THREE.BoxGeometry(1.5, 2.4, .65), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 1.2, -.08, false));
  scene.add(root);
}

function createActionLabel(text, width) {
  const canvas = offscreen(320, 100);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Labels are click targets. Keep their text legible above roofs and walls.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true,
    depthTest: false, depthWrite: false }));
  sprite.renderOrder = 100;
  sprite.scale.set(width, width * canvas.height / canvas.width, 1);
  sprite.userData.actionLabel = { canvas, texture, text: '' };
  paintActionLabel(sprite, text);
  return sprite;
}

function paintActionLabel(sprite, text) {
  const label = sprite.userData.actionLabel;
  if (label.text === text) return;
  label.text = text;
  const ctx = label.canvas.getContext('2d');
  ctx.clearRect(0, 0, 320, 100);
  ctx.fillStyle = 'rgba(5,48,53,.96)';
  roundRect(ctx, 3, 3, 314, 94, 18);
  ctx.strokeStyle = '#f1cf82'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff4d1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 43px sans-serif';
  ctx.fillText(text, 160, 52, 290);
  label.texture.needsUpdate = true;
}

function createCookingStation() {
  const root = actionRoot(new THREE.Group(), { type: 'kitchen' });
  root.position.set(KITCHEN_SITE.x, groundHeightAt(KITCHEN_SITE.x, KITCHEN_SITE.z), KITCHEN_SITE.z);
  root.add(mesh(new RoundedBoxGeometry(1.1, .65, .85, 2, .07), mat(0x9c8870), 0, .32, 0));
  root.add(mesh(new THREE.CylinderGeometry(.34, .29, .26, 16), mat(0x374e4a, .5), 0, .77, 0));
  const broth = mesh(new THREE.CircleGeometry(.30, 20), mat(0xdca951), 0, .91, 0, false);
  broth.rotation.x = -Math.PI / 2; root.add(broth);
  for (const x of [-.4, .4]) root.add(mesh(new THREE.BoxGeometry(.2, .06, .09), materials.wood, x, .83, 0, false));
  const steam = [];
  for (let i = 0; i < 5; i++) {
    const puff = mesh(new THREE.SphereGeometry(.065, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: .45, depthWrite: false }), 0, 1, 0, false);
    root.add(puff); steam.push(puff);
  }
  const image = offscreen(256, 96), ctx = image.getContext('2d');
  ctx.fillStyle = '#204e47'; roundRect(ctx, 4, 4, 248, 88, 12);
  ctx.fillStyle = '#ffe3a6'; ctx.font = '700 44px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('海岛厨房', 128, 64);
  const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sign.position.set(0, 1.65, 0); sign.scale.set(1.65, .62, 1); root.add(sign);
  root.add(mesh(new THREE.BoxGeometry(1.25, 1.2, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, .6, 0, false));
  walkObstacles.push({ ...KITCHEN_SITE, r: .72 });
  scene.add(root); visualProps.kitchen = { root, steam };
}

function cookingFailure(reason) {
  return ({ locked: '先学会这道菜谱', ingredients: '食材不足，请收获或捕获后再来；仓库食材需先取回',
    capacity: '制作后背包仍会超量，请先整理背包', gold: '金币不足', practice: '熟练度不足，先制作更多份料理',
    'max-level': '菜谱已满级', known: '已经学会这道菜谱' })[reason] || '暂时不能制作这道料理';
}

function beginCooking(recipeId) {
  if (busyAction || hutCrossing || fishingSession || boatTrip || voyage?.engaged) { flash('请先完成当前动作并返回家园'); return; }
  if (storm.phase === 'impact' && !state.shelter.inside) { flash('台风登陆中，请先进入小屋避险'); return; }
  if (!state.built.hut || state.hutDurability <= 0) { flash('小屋已损坏，请先维修厨房'); return; }
  if (!state.shelter.inside && (marineMode !== 'land' || Math.hypot(avatar.position.x - KITCHEN_APPROACH.x, avatar.position.z - KITCHEN_APPROACH.z) > 1.5)) {
    flash('先走到小屋旁的海岛厨房'); return;
  }
  const quote = recipeQuote(state, recipeId);
  if (!quote.ok) { flash(cookingFailure(quote.reason)); return; }
  avatarTarget = null; avatarRoute = []; arrivalAction = null;
  selectedRecipeId = recipeId;
  kitchenPage = Math.floor(Object.keys(RECIPES).indexOf(recipeId) / 4);
  cookingJob = { recipeId, elapsed: 0, duration: 5 };
  busyAction = true; hudPage = 'kitchen'; hudOpen = true;
  playAvatarAction('hand');
  if (!state.shelter.inside) avatar.rotation.y = Math.atan2(KITCHEN_SITE.x - avatar.position.x, KITCHEN_SITE.z - avatar.position.z);
  flash(`正在制作${RECIPES[recipeId].name}，完成后装入背包`);
}

function updateCooking(deltaSeconds) {
  if (visualProps.kitchen) visualProps.kitchen.steam.forEach((puff, i) => {
    puff.visible = Boolean(cookingJob) && !state.shelter.inside;
    const phase = ((cookingJob?.elapsed || 0) * .5 + i / 5) % 1;
    puff.position.set(Math.sin(i * 2 + phase) * .15, 1 + phase * .65, Math.cos(i * 2) * .12);
    puff.scale.setScalar(.6 + phase * 1.6); puff.material.opacity = (1 - phase) * .45;
  });
  if (!cookingJob) return;
  if (state.hutDurability <= 0 || (storm.phase === 'impact' && !state.shelter.inside)) {
    cookingJob = null; busyAction = false; flash('风灾中断烹饪，食材没有扣除；请先进入小屋避险'); return;
  }
  cookingJob.elapsed = Math.min(cookingJob.duration, cookingJob.elapsed + deltaSeconds);
  if (cookingJob.elapsed < cookingJob.duration) return;
  const result = cookMeal(state, cookingJob.recipeId);
  cookingJob = null; busyAction = false;
  flash(result.ok ? `${result.dish.name} Lv.${result.dish.level} 已入背包 · 食用可补 ${result.dish.satiety} 饱腹` : cookingFailure(result.reason));
  saveState(state);
}

function handleKitchenAction(id) {
  if (cookingJob || busyAction || hutCrossing || fishingSession) { flash('请先完成当前动作'); return; }
  if (id.startsWith('kitchen-select:')) { selectedRecipeId = id.slice(15); drawHud(); return; }
  if (id === 'kitchen-prev' || id === 'kitchen-next') {
    kitchenPage = 1 - kitchenPage;
    selectedRecipeId = Object.keys(RECIPES)[kitchenPage * 4]; drawHud(); return;
  }
  if (id === 'kitchen-learn' || id === 'kitchen-upgrade') {
    const result = id === 'kitchen-learn' ? learnRecipe(state, selectedRecipeId) : upgradeRecipe(state, selectedRecipeId);
    flash(result.ok ? `${RECIPES[selectedRecipeId].name} · 已${id === 'kitchen-learn' ? '学会' : '升级'} Lv.${result.level}` : cookingFailure(result.reason));
    saveState(state); return;
  }
  if (id === 'kitchen-eat') {
    const itemId = Object.keys(DISHES).find((key) => state.inventory[key] > 0) || 'food';
    useInventoryItem(itemId); return;
  }
  if (id === 'kitchen-cook') {
    const quote = recipeQuote(state, selectedRecipeId);
    if (!quote.ok) { flash(cookingFailure(quote.reason)); return; }
    if (state.shelter.inside || (!voyage?.engaged && marineMode === 'land'
      && Math.hypot(avatar.position.x - KITCHEN_APPROACH.x, avatar.position.z - KITCHEN_APPROACH.z) <= 1.5)) beginCooking(selectedRecipeId);
    else {
      if (voyage?.engaged) { flash('请先返航靠岸，在家园厨房制作食物'); return; }
      if (storm.phase === 'impact') { flash('台风登陆中，请先进入小屋避险'); return; }
      hudOpen = false;
      if (walkTo(KITCHEN_APPROACH.x, KITCHEN_APPROACH.z, { type: 'cook', recipeId: selectedRecipeId }, .3)) flash('正在前往海岛厨房，抵达后制作料理');
    }
  }
}

function createTradeSign() {
  // A permanent shore-side stall is available even before the dock upgrade.
  const root = actionRoot(new THREE.Group(), { type: 'trade' });
  root.position.set(TRADE_SIGN_POSITION.x, groundHeightAt(TRADE_SIGN_POSITION.x, TRADE_SIGN_POSITION.z), TRADE_SIGN_POSITION.z);
  const timber = mat(0x70502e);
  const edge = mat(0xc89c57, .67);
  root.add(mesh(new THREE.CylinderGeometry(.065, .085, 1.65, 10), timber, -.42, .82, 0, false));
  root.add(mesh(new RoundedBoxGeometry(1.18, .58, .12, 3, .045), timber, 0, 1.42, 0, false));
  root.add(mesh(new THREE.TorusGeometry(.18, .033, 8, 20), edge, -.23, 1.43, .09, false));
  root.add(mesh(new THREE.SphereGeometry(.075, 10, 7), edge, -.23, 1.43, .1, false));
  for (const x of [-.49, .49]) root.add(mesh(new THREE.SphereGeometry(.038, 7, 6), edge, x, 1.42, .09, false));
  const labelCanvas = offscreen(320, 112);
  const labelContext = labelCanvas.getContext('2d');
  labelContext.fillStyle = 'rgba(5,48,53,.94)';
  roundRect(labelContext, 4, 4, 312, 104, 18);
  labelContext.strokeStyle = '#f1cf82';
  labelContext.lineWidth = 5;
  labelContext.strokeRect(10, 10, 300, 92);
  labelContext.fillStyle = '#fff4d1';
  labelContext.textAlign = 'center';
  labelContext.font = '700 49px sans-serif';
  labelContext.fillText('交易站', 160, 75);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: true }));
  label.position.set(0, 2.22, 0);
  label.scale.set(2.2, .78, 1);
  root.add(label);
  const hit = mesh(new THREE.SphereGeometry(.86, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 1.32, 0, false);
  root.add(hit);
  scene.add(root);
  visualProps.tradeSign = root;
}

function createFreshwaterCollector() {
  const root = actionRoot(new THREE.Group(), { type: 'freshwater' });
  root.position.set(FRESHWATER_SITE.x, groundHeightAt(FRESHWATER_SITE.x, FRESHWATER_SITE.z), FRESHWATER_SITE.z);
  const bamboo = mat(0x8b713d, .88);
  const canvasMaterial = new THREE.MeshStandardMaterial({ color: 0x7da994, roughness: .9, side: THREE.DoubleSide });
  const barrelMaterial = mat(0x70482b, .92);
  for (const [x, z] of [[-.9, -.7], [.9, -.7], [-.9, .7], [.9, .7]]) {
    root.add(mesh(new THREE.CylinderGeometry(.045, .065, 2.15, 8), bamboo, x, 1.08, z, false));
  }
  const funnel = mesh(new THREE.ConeGeometry(1.18, .52, 4, 1, true), canvasMaterial, 0, 1.9, 0, false);
  funnel.rotation.y = Math.PI / 4;
  root.add(funnel);
  const barrel = mesh(new THREE.CylinderGeometry(.46, .52, 1.05, 14), barrelMaterial, .72, .54, .76, false);
  root.add(barrel);
  const rim = mesh(new THREE.TorusGeometry(.47, .045, 7, 18), bamboo, .72, 1.06, .76, false);
  rim.rotation.x = Math.PI / 2;
  root.add(rim);
  const waterLevel = mesh(new THREE.CircleGeometry(.42, 24), new THREE.MeshBasicMaterial({ color: 0x61cbd0, transparent: true, opacity: .78 }), .72, 1.07, .76, false);
  waterLevel.rotation.x = -Math.PI / 2;
  root.add(waterLevel);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.63, 0), new THREE.Vector3(.25, 1.38, .24), new THREE.Vector3(.72, 1.25, .65),
  ]), 12, .035, 7, false), mat(0x5f7770, .55));
  root.add(pipe);
  const still = mesh(new THREE.CircleGeometry(.62, 20), new THREE.MeshStandardMaterial({ color: 0x7ca9ad, transparent: true, opacity: .56, side: THREE.DoubleSide }), -.92, 1.03, .84, false);
  still.rotation.x = -1.05;
  root.add(still);
  const drops = [];
  for (let i = 0; i < 5; i++) {
    const drop = mesh(new THREE.SphereGeometry(.035, 8, 6), mat(0x8ee6e3, .28), -.7 + i * .34, 2.75 + i * .13, -.35 + (i % 2) * .6, false);
    root.add(drop); drops.push(drop);
  }
  const labelCanvas = offscreen(320, 112);
  const labelContext = labelCanvas.getContext('2d');
  labelContext.fillStyle = 'rgba(5,48,53,.94)'; roundRect(labelContext, 4, 4, 312, 104, 18);
  labelContext.strokeStyle = '#9fe7d2'; labelContext.lineWidth = 5; labelContext.strokeRect(10, 10, 300, 92);
  labelContext.fillStyle = '#fff4d1'; labelContext.textAlign = 'center'; labelContext.font = '700 45px sans-serif';
  labelContext.fillText('淡水收集', 160, 73);
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: true }));
  label.position.set(0, 2.75, 0); label.scale.set(2.15, .75, 1); root.add(label);
  root.add(mesh(new THREE.SphereGeometry(1.28, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 1.25, 0, false));
  scene.add(root);
  visualProps.freshwater = { root, waterLevel, still, drops };
  refreshFreshwaterVisuals();
}

function refreshFreshwaterVisuals() {
  const props = visualProps.freshwater;
  if (!props) return;
  const supply = state.freshwater;
  props.waterLevel.visible = supply.tank > 0;
  props.waterLevel.position.y = .58 + .48 * supply.tank / supply.tankCapacity;
  props.still.visible = supply.stillLevel > 0;
  const rainy = rainForDay(state.dayId) > 0 || ['preparing', 'impact'].includes(storm.phase);
  props.drops.forEach((drop, index) => {
    drop.visible = rainy;
    drop.position.y = 2.3 + ((sceneElapsed * 2.2 + index * .31) % .9);
  });
}

function createFarmBeds() {
  (state.plots || []).forEach((plot, index) => {
    if (cropObjects[index]) return;
    const [dx, dz] = bedPoints[index] || [0, 0];
    const root = actionRoot(new THREE.Group(), { type: 'farmplot', plotId: plot.id });
    root.position.set(plots.garden.pos[0] + dx, plots.garden.pos[1] + .12, plots.garden.pos[2] + dz);
    const soilMat = mat(plot.elevation === 'high' ? 0x785b38 : 0x916b43);
    const soilBase = mesh(new THREE.SphereGeometry(1, 18, 8), mat(0x57432f), 0, .065, 0, false);
    soilBase.scale.set(1.02, .085, .7);
    root.add(soilBase);
    for (const [z, length, radius] of [[-.26, .9, .27], [.26, .85, .25]]) {
      const ridge = mesh(new THREE.SphereGeometry(1, 18, 8), soilMat, .03, .14, z, false);
      ridge.scale.set(length, .15, radius);
      root.add(ridge);
    }
    const groove = mesh(new THREE.SphereGeometry(1, 16, 6), mat(0x423525), 0, .11, 0, false);
    groove.scale.set(.85, .022, .055);
    root.add(groove);
    const plants = new THREE.Group();
    // Plants emerge directly from the raised earth, not from a decorative bed mesh.
    plants.position.y = .29;
    plants.scale.setScalar(1.24);
    plants.userData.cropId = '';
    plants.visible = Boolean(plot.crop);
    root.userData.plants = plants;
    root.userData.protection = createFarmProtection();
    const labelCanvas = offscreen(256, 88);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: true }));
    label.scale.set(2.1, .72, 1);
    label.position.set(0, .84, -.86);
    root.userData.label = { canvas: labelCanvas, texture: labelTexture, sprite: label, text: '' };
    root.add(plants, root.userData.protection.root, label);
    scene.add(root);
    cropObjects[index] = root;
  });
}

function refreshPlotLabel(root, text) {
  const label = root?.userData.label;
  if (!label || label.text === text) return;
  label.text = text;
  const ctx = label.canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 88);
  ctx.fillStyle = text.includes('可收获') ? 'rgba(141, 83, 27, .96)'
    : text.startsWith('空田') ? 'rgba(91, 61, 37, .94)' : 'rgba(41, 88, 47, .96)';
  ctx.fillRect(4, 7, 248, 72);
  ctx.strokeStyle = '#ddbe82';
  ctx.lineWidth = 5;
  ctx.strokeRect(7, 10, 242, 66);
  ctx.fillStyle = '#fff4d6';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 45, 232);
  label.texture.needsUpdate = true;
}

function leafBlade(material, x, y, z, angle, scale = 1, tilt = .35) {
  const leaf = mesh(leafGeometry, material, x, y, z, false);
  leaf.rotation.set(-Math.PI / 2 + tilt, 0, angle);
  leaf.scale.setScalar(scale);
  return leaf;
}

function createCropForm(group, cropId) {
  group.clear();
  group.userData.cropId = cropId;
  const stemMat = mat(0x467c45);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x72a95a, roughness: .88, side: THREE.DoubleSide });
  const fruitMat = mat(0xd97843, .55);
  let leafIndex = 0;
  const stem = (x, height, z = 0) => {
    const part = mesh(new THREE.CapsuleGeometry(.028, height, 3, 5), stemMat, x, height / 2, z, false);
    part.userData.growthRole = 'stem';
    group.add(part);
    return part;
  };
  const leaf = (x, y, z, angle, size, tilt) => {
    const part = leafBlade(leafMat, x, y, z, angle, size, tilt);
    part.userData.growthRole = 'leaf';
    part.userData.growthDelay = .18 + leafIndex++ * .035;
    group.add(part);
    return part;
  };
  const fruit = (x, y, z, size = .1) => {
    const part = mesh(new THREE.SphereGeometry(size, 10, 7), fruitMat, x, y, z, false);
    part.userData.growthRole = 'fruit';
    group.add(part);
    return part;
  };
  const sprout = new THREE.Group();
  const sproutStem = mesh(new THREE.CapsuleGeometry(.022, .16, 3, 6), stemMat, 0, .09, 0, false);
  const sproutLeafA = leafBlade(leafMat, 0, .15, 0, -.8, .4, .28);
  const sproutLeafB = leafBlade(leafMat, 0, .17, 0, 1.0, .36, .32);
  for (const part of [sproutStem, sproutLeafA, sproutLeafB]) part.userData.growthRole = 'seedling';
  sprout.add(sproutStem, sproutLeafA, sproutLeafB);
  group.userData.seedling = sprout;
  group.add(sprout);
  if (cropId === 'corn') {
    stem(0, .95);
    for (let i = 0; i < 6; i++) leaf(0, .18 + i * .11, 0, i * 1.12, .92, .18);
    const cob = mesh(new THREE.CapsuleGeometry(.115, .22, 5, 10), fruitMat, .1, .56, .04, false);
    cob.userData.growthRole = 'fruit'; group.add(cob);
    for (const side of [-1, 1]) leaf(.1, .44, side * .06, side * 1.1, .37, .12);
  } else if (cropId === 'pineapple') {
    for (let i = 0; i < 8; i++) leaf(0, .06, 0, i * .79, .86, .04);
    const pineapple = mesh(new THREE.SphereGeometry(.18, 12, 9), fruitMat, 0, .31, .01, false);
    pineapple.scale.set(.82, 1.32, .82); pineapple.userData.growthRole = 'fruit'; group.add(pineapple);
    for (let i = 0; i < 6; i++) leaf(0, .5, 0, i * 1.05, .35, .12);
  } else if (cropId === 'pumpkin') {
    stem(0, .2);
    for (let i = 0; i < 6; i++) leaf(0, .13, 0, i * 1.05, 1.0, .12);
    const pumpkinGeometry = new THREE.SphereGeometry(.24, 24, 12);
    const positions = pumpkinGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      const rib = 1 + .075 * Math.cos(Math.atan2(z, x) * 8);
      positions.setX(i, x * rib);
      positions.setZ(i, z * rib);
    }
    pumpkinGeometry.computeVertexNormals();
    const pumpkin = mesh(pumpkinGeometry, fruitMat, .16, .12, .11, false);
    pumpkin.scale.set(1.12, .7, 1); pumpkin.userData.growthRole = 'fruit'; group.add(pumpkin);
  } else if (cropId === 'sweetPotato') {
    stem(0, .2);
    for (let i = 0; i < 7; i++) leaf(0, .12, 0, i * .9, .94, .18);
    const tuber = fruit(.13, .045, -.12, .16);
    tuber.scale.set(1.35, .58, .85);
  } else {
    stem(0, .72);
    for (let i = 0; i < 6; i++) leaf(0, .2 + (i % 3) * .12, 0, i * 1.12 + .3, .73, .32);
    fruit(.12, .34, .06, .12); fruit(-.12, .44, .02, .105); fruit(.06, .56, -.03, .095);
  }
  // Three plants per bed read as a planted row at the island camera distance.
  const originals = [...group.children];
  for (const [x, z, size] of [[-.38, -.22, .82], [.37, .21, .76]]) {
    const plant = new THREE.Group();
    plant.position.set(x, 0, z);
    plant.scale.setScalar(size);
    for (const object of originals) plant.add(object.clone(true));
    group.add(plant);
  }
  group.traverse((part) => {
    if (part.isMesh) part.userData.matureScale = part.scale.clone();
  });
}

function createFarmProtection() {
  const root = new THREE.Group();
  const net = new THREE.Group();
  const drain = new THREE.Group();
  const postMat = mat(0x6f5034);
  const ropeMat = mat(0x9b805a, .92);
  const netMat = new THREE.MeshStandardMaterial({ color: 0x8eb9a3, transparent: true, opacity: .5, roughness: .76, side: THREE.DoubleSide });
  const postTops = [];
  for (const x of [-.78, .78]) for (const z of [-.48, .48]) {
    const post = mesh(new THREE.CylinderGeometry(.025, .04, .78, 7), postMat, x, .4, z, false);
    post.rotation.z = x * .1;
    net.add(post);
    postTops.push(new THREE.Vector3(x, .76, z));
    const anchor = new THREE.Vector3(x * 1.16, .025, z * 1.48);
    const cablePath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, .68, z),
      new THREE.Vector3(x * 1.08, .34, z * 1.18),
      anchor,
    ]);
    net.add(mesh(new THREE.TubeGeometry(cablePath, 5, .009, 4, false), ropeMat, 0, 0, 0, false));
    const stake = mesh(new THREE.CylinderGeometry(.014, .024, .16, 6), postMat, anchor.x, anchor.y + .07, anchor.z, false);
    stake.rotation.z = -x * .18;
    net.add(stake);
  }
  for (const [from, to] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
    const ropePath = new THREE.CatmullRomCurve3([postTops[from], postTops[to]]);
    net.add(mesh(new THREE.TubeGeometry(ropePath, 6, .012, 5, false), ropeMat, 0, 0, 0, false));
  }
  const canopy = mesh(new THREE.PlaneGeometry(1.72, .96, 4, 2), netMat, 0, .72, 0, false);
  canopy.rotation.x = -Math.PI / 2;
  const positions = canopy.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, positions.getZ(i) + Math.sin(positions.getX(i) * 3.6) * .11);
  positions.needsUpdate = true;
  net.add(canopy);
  const ditchBankMat = mat(0x8a6944, .96);
  const ditchFloorMat = mat(0x334c43, .94);
  const ditchLength = 1.52;
  const ditchHalfWidth = .18;
  const ditchFloorHalfWidth = .062;
  const ditchTopY = .018;
  const ditchBottomY = -.045;
  const slopeGeometry = (outerZ, innerZ) => {
    const geometry = new THREE.BufferGeometry();
    const vertices = [
      -ditchLength / 2, ditchTopY, outerZ,
      ditchLength / 2, ditchTopY, outerZ,
      -ditchLength / 2, ditchBottomY, innerZ,
      ditchLength / 2, ditchBottomY, innerZ,
    ];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(outerZ < 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2]);
    geometry.computeVertexNormals();
    return geometry;
  };
  drain.add(mesh(slopeGeometry(-ditchHalfWidth, -ditchFloorHalfWidth), ditchBankMat, 0, 0, 0, false));
  drain.add(mesh(slopeGeometry(ditchHalfWidth, ditchFloorHalfWidth), ditchBankMat, 0, 0, 0, false));
  const ditchFloor = mesh(new THREE.PlaneGeometry(ditchLength, ditchFloorHalfWidth * 2), ditchFloorMat, 0, ditchBottomY, 0, false);
  ditchFloor.rotation.x = -Math.PI / 2;
  drain.add(ditchFloor);
  // Small low lips connect the recessed channel to the existing soil ridges.
  for (const side of [-1, 1]) {
    const lip = mesh(new THREE.CapsuleGeometry(.022, ditchLength - .16, 3, 8), ditchBankMat,
      0, .012, side * .235, false);
    lip.rotation.z = Math.PI / 2;
    drain.add(lip);
  }
  root.add(net, drain);
  return { root, net, drain };
}

function refreshFarmBeds() {
  const availableSeed = usableCropSeed(state, selectedSeed);
  (state.plots || []).forEach((plot, index) => {
    const root = cropObjects[index];
    const group = root?.userData.plants;
    if (!group) return;
    group.visible = Boolean(plot.crop);
    const protection = cropObjects[index]?.userData.protection;
    const defense = state.defenses?.plots?.find((entry) => entry.id === plot.id);
    if (protection) {
      protection.net.visible = defense?.windNet === true || Number(defense?.windNet) > 0;
      protection.drain.visible = defense?.drainage === true || Number(defense?.drainage) > 0;
    }
    if (!plot.crop) {
      refreshPlotLabel(root, availableSeed ? `空田·${cropLabel(availableSeed)}可播` : '空田·缺农田种子');
      return;
    }
    const crop = cropOptions.find((entry) => entry.id === plot.crop.id);
    if (group.userData.cropId !== plot.crop.id) createCropForm(group, plot.crop.id);
    const progress = Math.max(0, Math.min(1, Number(plot.crop.growthMinutes || 0) / (crop?.minutes || 1)));
    refreshPlotLabel(root, `${cropLabel(plot.crop.id)}·${progress >= 1 ? '可收获' : progress < .38 ? '幼苗' : progress < .68 ? '生长中' : '结果中'}`);
    const fruitColor = crop?.id === 'tomato' ? 0xd64331 : crop?.id === 'sweetPotato' ? 0xb2814b :
      crop?.id === 'corn' ? 0xe5c24f : crop?.id === 'pineapple' ? 0xe7b849 : 0xf0a84d;
    if (group.userData.fruitColor !== fruitColor) {
      group.traverse((part) => {
        if (part.isMesh && part.userData.growthRole === 'fruit') part.material.color.setHex(fruitColor);
      });
      group.userData.fruitColor = fruitColor;
    }
    const stage = (from, to) => {
      const value = THREE.MathUtils.clamp((progress - from) / (to - from), 0, 1);
      return value * value * (3 - 2 * value);
    };
    group.traverse((part) => {
      if (!part.isMesh) return;
      const role = part.userData.growthRole;
      const baseScale = part.userData.matureScale;
      if (role === 'seedling') {
        const growth = .62 + stage(0, .24) * .38;
        part.visible = progress < .39;
        const spread = .72 + stage(0, .24) * .28;
        part.scale.set(baseScale.x * spread, baseScale.y * growth, baseScale.z * spread);
      } else {
        const delay = role === 'leaf' ? part.userData.growthDelay : .12;
        const growth = role === 'fruit' ? stage(.65, .94) : stage(delay, delay + .32);
        part.visible = role === 'fruit' ? progress >= .65 : progress >= .12;
        const spread = .72 + growth * .28;
        part.scale.set(baseScale.x * spread, baseScale.y * Math.max(.12, growth), baseScale.z * spread);
      }
    });
  });
}

function plotPoint(plotId) {
  const index = (state.plots || []).findIndex((plot) => plot.id === plotId);
  const [dx, dz] = bedPoints[index] || [0, 0];
  return [plots.garden.pos[0] + dx, plots.garden.pos[2] + dz];
}

function addPlot(kind) {
  const data = plots[kind];
  if (state.built[kind]) return showBuilding(kind);
  const group = actionRoot(new THREE.Group(), { type: 'build', kind });
  group.position.set(...data.pos);
  const pad = mesh(new THREE.CylinderGeometry(1.6, 1.72, .22, 24), new THREE.MeshStandardMaterial({ color: C.sand, roughness: .9, emissive: 0x332400, emissiveIntensity: .12 }), 0, .1, 0);
  const marker = mesh(new THREE.TorusGeometry(.75, .08, 7, 24), materials.gold, 0, .25, 0);
  marker.rotation.x = Math.PI / 2;
  group.add(pad, marker);
  group.userData.marker = marker;
  animated.push({ object: marker, spin: true, speed: .6, amount: 1 });
  scene.add(group);
  data.plot = group;
}

function showBuilding(kind) {
  const data = plots[kind];
  if (data.built) return;
  if (data.plot) {
    data.plot.visible = false;
    data.plot.userData.action = null;
  }
  if (kind === 'garden') {
    // The state-driven farm beds below are the garden. A second static GLB
    // would show permanent generic sprouts even when every plot is empty.
    data.built = new THREE.Group();
    return;
  }
  const model = buildingSources[kind].clone(true);
  model.position.set(...data.pos);
  if (kind === 'dock') {
    model.rotation.y = -.85;
    // Clicking the raised deck is an interaction, not a request to walk on the
    // terrain underneath it (which would visually sink the avatar into planks).
    actionRoot(model, { type: 'trade' });
  }
  model.scale.setScalar(0.001);
  scene.add(model);
  if (kind === 'hut') {
    const door = model.getObjectByName('Hut_Door');
    if (door) {
      // The GLB keeps the original leaf separate; the hinge is on its left jamb.
      const pivot = new THREE.Group();
      pivot.position.set(-.53, 0, -1.6);
      door.position.set(.43, .9, 0);
      pivot.add(door);
      model.add(pivot);
      pivot.rotation.y = state.shelter.doorOpen ? 1.35 : 0;
      hutDoorPivot = pivot;
    }
    model.traverse((object) => {
      if (object.name.startsWith('HutRoof')) hutRoofs.push(object);
      if (/^Hut_Bed(Base|Quilt|Pillow)/.test(object.name)) {
        actionRoot(object, { type: 'hut-bed' });
        if (object.name === 'Hut_BedBase') hutBed = object;
      }
    });
    // The shipped GLB merges furniture into Hut.001. Match the source bed's
    // footprint without regenerating or replacing the user's building asset.
    if (!hutBed) {
      hutBed = actionRoot(mesh(new THREE.BoxGeometry(1.34, .55, 1.94),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), -1.05, .35, -.5, false), { type: 'hut-bed' });
      model.add(hutBed);
    }
    const bedLabel = actionRoot(createActionLabel('床位 · 休息', 2.5), { type: 'hut-bed' });
    bedLabel.position.set(-1.05, 1.4, -.5);
    bedLabel.visible = state.shelter.inside;
    bedLabel.userData.indoorBedLabel = true;
    model.add(bedLabel);
  }
  data.built = model;
  animated.push({ object: model, grow: true, target: 1 });
}

function completeArrival(action) {
  if (action?.type === 'cook') { beginCooking(action.recipeId); return; }
  if (!action || (storm.phase === 'impact' && !['hut-door-open', 'hut-door-close'].includes(action.type))) return;
  if (action.type === 'voyage-board') { voyage?.board(); return; }
  if (action.type === 'hut-door-open') {
    state.shelter.doorOpen = true;
    flash('小屋门已打开 · 再点门进入，进屋后记得关门');
    saveState(state);
    drawHud();
    return;
  }
  if (action.type === 'hut-door-close') { closeHutDoor(); return; }
  let tool = action.type === 'tree-work' ? action.operation === 'chop' ? 'axe' : 'wateringCan'
    : action.type === 'farm-arrive' || action.type === 'install' || action.type === 'repair' || action.type === 'wood-patch' ? 'shovel'
    : action.type === 'capture' || action.type === 'sea-capture' ? (action.tool === 'dive' ? 'diveCatch' : action.speciesId === 'crab' ? 'hand' : action.tool === 'net' ? 'net' : 'rod')
      : action.type === 'world' && action.root?.userData.action?.kind === 'wood' ? 'shovel' : null;
  const plotAction = action.type === 'world' && action.root?.userData.action?.type === 'farmplot';
  if (plotAction) {
    const plot = state.plots?.find((entry) => entry.id === action.root.userData.action.plotId);
    const crop = plot?.crop && CROPS[plot.crop.id];
    tool = !plot?.crop ? (usableCropSeed(state, selectedSeed) ? 'shovel' : null) : crop && plot.crop.growthMinutes >= crop.minutes ? 'hand'
      : state.gameMinutes >= plot.crop.wateredUntil ? 'wateringCan' : null;
  }
  if (tool && !(tool === 'rod' && ['capture', 'sea-capture'].includes(action.type))) playAvatarAction(tool);
  if (action.type === 'world') {
    const { root } = action;
    const data = root?.userData.action;
    if (!data) return;
    if (data.type === 'gather' && data.active) {
      const source = root.getWorldPosition(new THREE.Vector3());
      if (!root.visible || Math.hypot(avatar.position.x - source.x, avatar.position.z - source.z) > 1.8) {
        flash('离可见的资源太远，请走近后再采集'); return;
      }
      const result = gather(state, data.kind, data.nodeId);
      if (!result.ok) { flash(result.reason === 'stamina' ? '体力不足，回小屋休息到早晨' : '这处资源尚未刷新，稍后再来'); return; }
      root.visible = false;
      data.active = false;
      flash(data.kind === 'wood' ? '搬回 2 份漂流木 · 可在维修仓储抢修受损设施' : '捡起 1 枚彩贝 · 消耗 2 体力');
    } else if (data.type === 'build') {
      const item = BUILDINGS[data.kind];
      if (!build(state, data.kind)) { flash(`${item.label}需要 ${item.cost.wood} 木材 + ${item.cost.shells} 贝壳`); return; }
      showBuilding(data.kind);
      flash(`${item.label}建成了！`);
    } else if (data.type === 'farmplot') {
      const plot = state.plots?.find((entry) => entry.id === data.plotId);
      if (!plot) return;
      selectedPlotId = plot.id;
      const crop = CROPS[plot.crop?.id];
      if (plot.crop && crop && plot.crop.growthMinutes >= crop.minutes) {
        const result = harvestCrop(state, data.plotId);
        flash(result.ok ? `收获 ${crop.label} ×${result.quantity ?? crop.yield}，已装入背包` : `暂时无法收获：${result.reason || '请查看背包容量'}`);
      } else if (!plot.crop) {
        const cropId = usableCropSeed(state, selectedSeed);
        if (!cropId) {
          const storedCrop = Object.keys(CROPS).some((id) => state.storage[`${id}Seed`] > 0);
          flash(storedCrop ? '农田种子在仓库，请先取回背包再播种'
            : state.inventory.palmSeed ? '背包只有椰树种子；田地需要地瓜、番茄等农作物种子'
              : '背包没有农作物种子，请在农田或商店购买');
          return;
        }
        const changedSeed = cropId !== selectedSeed;
        selectedSeed = cropId;
        const result = plantCrop(state, data.plotId, cropId);
        flash(result.ok ? changedSeed ? `原选种子已用完，已改种背包中的${cropLabel(cropId)}`
          : `种下${cropLabel(cropId)}，成熟前记得浇水`
          : result.reason === 'stamina' ? '体力不足，休息后再播种'
            : result.reason === 'no-seed' ? `${cropLabel(cropId)}种子已用完，请检查背包` : '田地暂时无法播种');
      } else if (plot.crop.growthMinutes < (crop?.minutes || 0) && state.gameMinutes >= plot.crop.wateredUntil) {
        const result = waterCrop(state, data.plotId);
        flash(result.ok ? `浇水完成，${crop.label}继续生长 · 水壶剩余 ${state.freshwater.canteen} L`
          : result.reason === 'water' ? '水壶已空，请先到淡水收集场补水'
            : `现在不能浇水：${result.reason || '体力不足'}`);
      } else { const hint = plotGuidance(state, plot, selectedSeed); flash(`${hint.status} · ${hint.detail}`); }
      refreshFarmBeds();
    }
  } else if (action.type === 'tree-work') {
    const tree = state.trees.find((entry) => entry.id === action.treeId);
    const result = action.operation === 'chop' ? chopTree(state, action.treeId)
      : action.operation === 'plant' ? plantTree(state, action.treeId) : tendTree(state, action.treeId);
    refreshTreeVisuals();
    if (result.ok) flash(action.operation === 'chop' ? `砍下椰树，获得木材 ×${result.wood}；树桩可重新种植`
      : action.operation === 'plant' ? '椰树苗已种下；每日养护可加速生长'
        : `已养护${tree?.stage === 'mature' ? '成树' : '树苗'}，健康 ${result.health}/100`);
    else flash(({ 'not-mature': '树还没有长成，暂时不能砍伐', stamina: '体力不足，先休息', occupied: '这里已有树木',
      'no-seed': '背包缺少椰树种子；农田种子不能种椰树', 'no-tree': '这里没有可养护的树',
      'already-tended': '这棵树今天已经养护过，明天再来' })[result.reason] || '林木操作未完成');
  } else if (action.type === 'trip-start') {
    const target = marineTargets.find((entry) => entry.id === action.targetId);
    if (!targetAvailable(target)) { releaseMarineTarget(); flash('目标已经离开，请重新选取海产'); return; }
    state.boatMoored = false;
    boatTrip = { phase: 'outbound', speciesId: action.speciesId, tool: action.tool, targetId: target.id, elapsed: 0, duration: 1.6,
      fromX: heroBoat.position.x, fromZ: heroBoat.position.z,
      toX: target.x, toZ: target.z };
    flash(`解开缆绳，正驶向可见的${SEAFOOD[action.speciesId].label}`);
  } else if (action.type === 'capture' || action.type === 'sea-capture') {
    const target = marineTargets.find((entry) => entry.id === action.targetId);
    const captureDistance = action.tool === 'rod' && action.type === 'capture' ? 7.3 : 1.8;
    if (!targetAvailable(target) || activeMarineTarget?.id !== target.id || !target.proxy.visible
      || Math.hypot(avatar.position.x - target.x, avatar.position.z - target.z) > captureDistance) {
      releaseMarineTarget(); flash('目标已经离开，请重新选取可见海产'); return;
    }
    if (action.tool === 'rod') {
      startFishingSession(target, action.type === 'sea-capture');
      return;
    }
    const result = catchSeafood(state, action.speciesId, action.tool);
    if (result.ok && result.caught > 0) {
      state.gatherCooldowns[target.id] = state.gameMinutes + 360;
      spawnCatchEffects(target, result.caught);
    }
    releaseMarineTarget();
    if (!result.ok) {
      flash(({ stamina: '体力不足，回小屋休息到早晨', depleted: '这片鱼场暂时很稀少', wrongTool: '缺少适用的渔具', boatLevel: '需要先购买小铁船', capacity: '背包已满', oxygen: '氧气不足，先返回码头', noNet: '还没有购买高级渔网', rodLevel: '鱼竿等级不足', diveLevel: '潜水装备等级不足', diveSupply: '潜水耗材不足，先到商店补充' })[result.reason] || `现在不能采集：${result.reason || '请检查装备'}`);
    } else flash(result.caught ? `捕获${SEAFOOD[action.speciesId].label} ×${result.caught}　估值 ${result.value} 金` : `${SEAFOOD[action.speciesId].label}逃脱了，体力已消耗`);
  } else if (action.type === 'buy') {
    const result = buyItem(state, action.itemId, action.quantity);
    if (result.ok && ['lowPlot', 'highPlot'].includes(action.itemId)) {
      createFarmBeds();
      flash(`新田块已开垦 · 当前 ${state.plots.length} 块`);
    } else if (result.ok && action.itemId === 'waveBarrier') {
      flash('消浪护栏已入背包 · 点击码头侧方海里的黄色安装浮标，或在背包点物资');
    } else if (result.ok && action.itemId === 'solarStill') {
      refreshFreshwaterVisuals();
      flash('太阳能蒸馏器已安装到淡水收集场 · 每日额外产出 2 L');
    } else if (result.ok && ['windNet', 'drainage', 'anchor', 'waterproofCabinet', 'windowReinforcement', 'raisedBed'].includes(action.itemId)) {
      flash('物资已入背包；将前往设施安装，也可在背包点它再次安装');
      beginInstallStock(action.itemId);
    } else {
      const label = shopCatalog.find((item) => item.id === action.itemId)?.name || action.itemId;
      flash(result.ok ? `已购 ${label} ×${action.quantity}，支出 ${result.cost} 金` : `购买未完成：${result.reason === 'gold' ? '金币不足' : result.reason === 'capacity' ? '背包空间不足' : '前置条件未满足或已拥有'}`);
    }
  } else if (action.type === 'install') {
    const targetIds = installTargets(action.itemId);
    const result = targetIds ? installDefense(state, action.itemId, targetIds) : { ok: false, reason: 'already-protected' };
    const label = shopCatalog.find((item) => item.id === action.itemId)?.name || '防灾设施';
    flash(result.ok ? action.itemId === 'waveBarrier' ? '消浪护栏已固定在近岸浅海；台风时可降低码头损伤'
      : `${label}已安装，背包物资已消耗，可在“已拥有装备”查看`
      : `安装未完成：${result.reason === 'already-protected' ? '当前设施已保护，暂不能重复安装' : result.reason === 'insufficient-stock' ? '背包没有该物资，请先从仓库取回' : result.reason === 'stamina' ? '体力不足' : '没有可安装的目标'}`);
  } else if (action.type === 'repair') {
    const result = repairAsset(state, action.asset);
    flash(result.ok ? `修复完成：${({ boat: '船只', dock: '码头', hut: '小屋' })[action.asset]}已恢复至 100 耐久，花费 ${result.cost} 金` : `修理未完成：${result.reason === 'gold' ? '金币不足' : result.reason === 'stamina' ? '体力不足' : '已满耐久'}`);
  } else if (action.type === 'wood-patch') {
    const result = patchAssetWithWood(state, action.asset);
    flash(result.ok ? `木材抢修完成：${({ boat: '船只', dock: '码头', hut: '小屋' })[action.asset]}恢复 ${result.points} 耐久，消耗 ${result.wood} 木材`
      : `抢修未完成：${result.reason === 'wood' ? '木材不足，可在海滩拾取漂流木或伐树' : result.reason === 'stamina' ? '体力不足' : '耐久已达 40，继续修理需要金币'}`);
  } else if (action.type === 'move-stock') {
    const result = moveAllStock(state, action.from, action.to);
    const amount = Object.values(state[action.to]).reduce((sum, n) => sum + n, 0);
    flash(result.ok ? `${action.to === 'storage' ? '货物已存入仓库' : '货物已取回背包'} · 当前 ${amount} 件` : `转存未完成：${result.reason === 'capacity' ? '目标空间不足' : result.reason === 'invalid-item' ? '旧版汇总鱼获需先在码头出售' : '没有可转移货物'}`);
  } else if (action.type === 'retrieve-item') {
    const result = moveStock(state, action.itemId, 1, 'storage', 'inventory');
    flash(result.ok ? '已从仓库取回 1 件；打开背包点该物品即可使用'
      : `取回失败：${result.reason === 'capacity' ? '背包已满' : '仓库里没有该物品'}`);
  } else if (action.type === 'sell') {
    let value = 0;
    const sold = [];
    for (const itemId of [...Object.keys(SEAFOOD), ...Object.keys(CROPS), 'legacyFish']) {
      const quantity = state.inventory[itemId] || 0;
      if (quantity > 0) {
        const result = sellItem(state, itemId, quantity);
        value += result.value || 0;
        sold.push(`${CROPS[itemId]?.label || SEAFOOD[itemId]?.label || '旧鱼获'}×${quantity}`);
      }
    }
    flash(value ? `售出 ${sold.slice(0, 3).join('、')}${sold.length > 3 ? '等货物' : ''}，收入 +${value} 金` : '背包没有可售货品');
  } else if (action.type === 'open-trade') {
    tradeMode = action.mode || 'buy';
    hudPage = 'shop';
    hudOpen = true;
    flash('已到交易站 · 选择购入或售出货物');
  } else if (action.type === 'water-station') {
    hudPage = 'water';
    hudOpen = true;
    flash(`已到淡水收集场 · 储水 ${state.freshwater.tank}/${state.freshwater.tankCapacity} L`);
  } else if (action.type === 'water-refill') {
    const result = refillCanteen(state);
    refreshFreshwaterVisuals();
    flash(result.ok ? `水壶补充 ${result.transferred} L · 水壶 ${state.freshwater.canteen}/${state.freshwater.canteenCapacity} L`
      : result.reason === 'full' ? '水壶已经装满' : '储水桶已空，等待露水或降雨补充');
  } else if (action.type === 'farm-arrive') {
    flash('走近田块，点击泥垄播种、浇水或收获');
  } else if (action.type === 'rest') {
    const recoveryCap = restRecoveryCap(state);
    const plan = bedRestPlan({ ...state, recoveryCap }, Boolean(restTransition));
    if (!plan.ok) {
      flash(restUnavailableMessage(plan.reason));
      return;
    }
    if (action.requestedKind && action.requestedKind !== plan.kind) {
      flash('途中已跨过昼夜时段，请重新选择休息方式');
      return;
    }
    restTransition = { ...plan, recoveryCap, fromMinutes: state.gameMinutes, initialStamina: state.stamina, elapsed: 0, nutritionSpent: 0, savedElapsed: 0,
      standingPosition: avatar.position.clone(), standingRotation: avatar.rotation.clone() };
    const bedPosition = hutBed.getWorldPosition(new THREE.Vector3());
    avatar.position.set(bedPosition.x, bedPosition.y + .28, bedPosition.z + .55);
    avatar.rotation.set(-Math.PI / 2, 0, 0);
    busyAction = true;
    hudOpen = false;
    flash(plan.kind === 'nap' ? '正在小憩 · 最多 90 游戏分钟恢复体力' : '已回小屋休息 · 时间将逐步推进到清晨');
  }
  syncStorm();
  saveState(state);
  drawHud();
}

function restUnavailableMessage(reason) {
  if (reason === 'outside') return '先进入小屋，才能使用床位休息';
  if (reason === 'door') return '请先关闭小屋门，再上床休息';
  if (reason === 'food') return '饱腹不足，先食用背包中的鱼获或农作物';
  if (reason === 'nutrition') return '食物或淡水不足，已达到当前恢复上限；请先吃饭、喝水';
  if (reason === 'busy') return '请先完成当前动作';
  return reason === 'full' ? '白天体力已满，无需休息；傍晚后可睡到清晨'
    : reason === 'storm' ? '台风预警期间不能休息，请先检查防灾措施' : '当前时间无法休息';
}

function requestBedRest() {
  const plan = bedRestPlan({ ...state, recoveryCap: restRecoveryCap(state) },
    Boolean(busyAction || hutCrossing || bedApproach || restTransition || fishingSession || cookingJob));
  if (!plan.ok) { flash(restUnavailableMessage(plan.reason)); return; }
  if (!hutBed || !avatar) { flash('床位正在准备，请稍后再试'); return; }
  const bed = hutBed.getWorldPosition(new THREE.Vector3());
  bedApproach = { start: avatar.position.clone(), end: new THREE.Vector3(bed.x + .85, avatar.position.y, bed.z), elapsed: 0 };
  avatarTarget = null;
  avatarRoute = [];
  arrivalAction = null;
  busyAction = true;
  hudOpen = false;
  flash('正在走到床边');
  drawHud();
}

function restPreviewText() {
  const cap = restRecoveryCap(state);
  const plan = bedRestPlan({ ...state, recoveryCap: cap });
  if (!plan.ok) return restUnavailableMessage(plan.reason);
  const preview = restPreview(plan, state.gameMinutes, state.stamina, cap, PASSIVE_TIME_SCALE * 2);
  return `${Math.ceil(preview.gameMinutes)} 游戏分钟 / 现实 ${Math.ceil(preview.realSeconds / 60)} 分钟 · 体力 +${Math.floor(preview.staminaGain)} · 随时起床`;
}

function updateBedApproach(deltaSeconds) {
  if (!bedApproach) return;
  const approach = bedApproach;
  approach.elapsed += deltaSeconds;
  const progress = Math.min(1, approach.elapsed / 1.2);
  avatar.position.lerpVectors(approach.start, approach.end, progress);
  avatar.rotation.y = Math.atan2(approach.end.x - approach.start.x, approach.end.z - approach.start.z);
  const limbs = avatar.userData.limbs;
  limbs.leftLeg.rotation.x = Math.sin(progress * Math.PI * 6) * .3;
  limbs.rightLeg.rotation.x = -limbs.leftLeg.rotation.x;
  if (progress < 1) return;
  limbs.leftLeg.rotation.x = limbs.rightLeg.rotation.x = 0;
  bedApproach = null;
  busyAction = false;
  completeArrival({ type: 'rest' });
}

function stableRoll(key) {
  let hash = 2166136261;
  for (const char of String(key)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}

function ensureStormSchedule() {
  const current = state.storm || (state.storm = {});
  if (Number.isFinite(current.impactAt)) return;
  const nextDay = Math.max(Number(current.nextDay) || 7, Number(state.dayId) || 1);
  const id = Math.max(1, Number(current.count || state.stormCount) + 1);
  const cycle = [1, 2, 2, 3];
  state.storm = {
    ...current,
    id,
    seed: Number(current.seed) || stableRoll(`storm:${id}`) * 0xffffffff >>> 0,
    intensity: Number(current.strength) || cycle[(id - 1) % cycle.length],
    impactAt: (nextDay - 1) * 1440 + 720,
    settledId: Number(current.settledId) || 0,
    stage: 'calm',
    result: current.result ?? null,
    count: Number(current.count) || 0,
    nextDay,
  };
}

function prepareCropForecast() {
  for (const plot of state.plots || []) {
    if (!plot.crop) continue;
    const crop = CROPS[plot.crop.id];
    if (!crop) continue;
    if (!Number.isFinite(plot.crop.expectedUnits)) {
      const expected = crop.yield * (Number(plot.yieldFactor) || 1);
      plot.crop.expectedUnits = Math.floor(expected) + (stableRoll(`${plot.id}:${plot.crop.plantedAt}`) < expected % 1 ? 1 : 0);
    }
    plot.crop.valuePerUnit = crop.price;
  }
}

function syncStorm() {
  ensureStormSchedule();
  prepareCropForecast();
  const result = updateStorm(state);
  storm.phase = result.stage === 'preparation' ? 'preparing' : result.stage;
  storm.strength = state.storm.intensity || 1;
  if (result.report) {
    state.stormCount = (state.stormCount || 0) + 1;
    state.storm.count = state.stormCount;
    const id = state.storm.id + 1;
    const offset = [-2, -1, 0, 1, 2][Math.floor(stableRoll(`interval:${id}`) * 5)];
    const gap = 8 + offset;
    const strength = [1, 2, 2, 3][(id - 1) % 4];
    state.storm = {
      id, seed: Math.floor(stableRoll(`storm:${id}`) * 0xffffffff) || 1,
      intensity: strength, impactAt: state.storm.impactAt + gap * 1440,
      settledId: 0, stage: 'calm', result: result.report, count: state.stormCount,
      nextDay: state.dayId + gap,
    };
    state.shelter.exposureMinutes = 0;
    state.shelter.lastCheckedMinutes = state.gameMinutes;
    flash(`风暴清算：货物损失 ${result.report.totals.valueLost} 金，维修 ${result.report.totals.repairCost} 金`);
  } else if (result.transition?.to === 'warning' || result.transition?.to === 'preparation' || result.transition?.to === 'impact') {
    flash(result.prompt);
    if (result.transition.to === 'preparation' && boatTrip) {
      releaseMarineTarget();
      boatTrip.phase = 'return'; boatTrip.elapsed = 0;
      boatTrip.fromX = heroBoat.position.x; boatTrip.fromZ = heroBoat.position.z;
      boatTrip.toX = BOAT_MOOR.x; boatTrip.toZ = BOAT_MOOR.z;
      flash('台风将近：立即回港，远海采集已取消');
    }
  }
  if (result.changed) saveState(state);
  return result;
}

const HUD_WIDTH = 1024;
const HUD_HEIGHT = 740;
const MOBILE_HUD_HEIGHT = 1060;
const HUD_TOP = 12;
const hudCanvas = offscreen(HUD_WIDTH, HUD_HEIGHT);
const hudContext = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;
const hudSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hudTexture, transparent: true, depthTest: false }));
hudSprite.center.set(.5, 0);
hudScene.add(hudSprite);
let hudWidth = 0;
let hudHeight = 0;
let hudButtons = [];
let hudOpen = state.shelter.inside;
let hudPanelRect = null;
let hudNavRect = null;
let hudContentOffset = 0;
const statusCanvas = offscreen(768, 146);
const statusTexture = new THREE.CanvasTexture(statusCanvas);
statusTexture.colorSpace = THREE.SRGBColorSpace;
const statusSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: statusTexture, transparent: true, depthTest: false }));
statusSprite.center.set(0, 1);
hudScene.add(statusSprite);
const feedbackCanvas = offscreen(800, 160);
const feedbackTexture = new THREE.CanvasTexture(feedbackCanvas);
feedbackTexture.colorSpace = THREE.SRGBColorSpace;
const feedbackSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: feedbackTexture, transparent: true, depthTest: false }));
feedbackSprite.visible = false;
feedbackSprite.renderOrder = 20;
hudScene.add(feedbackSprite);
const feedbackAnchor = new THREE.Vector3();
const navCanvas = offscreen(1000, 112);
const navTexture = new THREE.CanvasTexture(navCanvas);
navTexture.colorSpace = THREE.SRGBColorSpace;
const navSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: navTexture, transparent: true, depthTest: false }));
navSprite.center.set(.5, 0);
hudScene.add(navSprite);
let navButtons = [];
const fishingCanvas = offscreen(760, 520);
const fishingTexture = new THREE.CanvasTexture(fishingCanvas);
fishingTexture.colorSpace = THREE.SRGBColorSpace;
const fishingSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fishingTexture, transparent: true, depthTest: false }));
fishingSprite.visible = false;
fishingSprite.renderOrder = 25;
hudScene.add(fishingSprite);
let fishingRect = null;
let fishingButtons = [];
let fishingForceRect = null;
const restShade = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x001b24, transparent: true, opacity: .42, depthTest: false }));
restShade.renderOrder = 28;
restShade.visible = false;
hudScene.add(restShade);
const restCanvas = offscreen(640, 280);
const restTexture = new THREE.CanvasTexture(restCanvas);
restTexture.colorSpace = THREE.SRGBColorSpace;
const restSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: restTexture, transparent: true, depthTest: false }));
restSprite.renderOrder = 29;
restSprite.visible = false;
hudScene.add(restSprite);

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect ? context.roundRect(x, y, width, height, radius) : context.rect(x, y, width, height);
  context.fill();
}

function drawFishingPanel() {
  const session = fishingSession || fishingResult;
  fishingSprite.visible = Boolean(session);
  if (!session) { fishingButtons = []; fishingForceRect = null; return; }
  const mobile = screen.width < 600;
  const width = Math.min(screen.width - 16, mobile ? 500 : 510);
  const height = width * fishingCanvas.height / fishingCanvas.width;
  const target = marineTargets.find((entry) => entry.id === session.targetId);
  const projected = target ? new THREE.Vector3(target.x, water.position.y, target.z).project(camera) : null;
  const targetX = projected ? (projected.x + 1) * screen.width / 2 : screen.width / 2;
  const targetY = projected ? (1 - projected.y) * screen.height / 2 : screen.height / 2;
  fishingRect = {
    x: mobile ? (screen.width - width) / 2 : targetX > screen.width / 2 ? 16 : screen.width - width - 16,
    y: mobile && targetY > screen.height / 2 ? 82 : screen.height - height - 14,
    width, height,
  };
  fishingSprite.scale.set(width, height, 1);
  fishingSprite.position.set(fishingRect.x + width / 2, screen.height - fishingRect.y - height / 2, 0);
  const ctx = fishingCanvas.getContext('2d');
  ctx.clearRect(0, 0, 760, 520);
  ctx.fillStyle = 'rgba(4, 40, 49, .95)';
  roundRect(ctx, 5, 5, 750, 510, 26);
  ctx.strokeStyle = '#dfc47f'; ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, 730, 490);
  if (session.phase === 'result') {
    fishingButtons = []; fishingForceRect = null;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff1c8'; ctx.font = '700 35px sans-serif';
    ctx.fillText(`${SEAFOOD[session.speciesId].label} · 本次垂钓结束`, 38, 72, 680);
    ctx.font = '27px sans-serif'; ctx.fillStyle = '#ffdb82';
    ctx.fillText(session.explanation, 38, 143, 680);
    ctx.fillStyle = '#c4ebe0'; ctx.font = '25px sans-serif';
    ctx.fillText(`本次消耗：体力 ${session.penalty.stamina} · ${session.penalty.minutes} 游戏分钟`, 38, 212, 680);
    ctx.fillText(session.tip, 38, 294, 680);
    ctx.fillText('这处鱼群需要恢复，换一个目标可继续垂钓', 38, 350, 680);
    ctx.fillStyle = '#fff1c8'; ctx.fillText('点击任意位置关闭，继续操作', 38, 454, 680);
    fishingTexture.needsUpdate = true;
    return;
  }
  const bite = session.phase === 'bite';
  const reeling = session.phase === 'reeling';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff1c8'; ctx.font = '700 35px sans-serif';
  ctx.fillText(`${SEAFOOD[session.speciesId].label} · ${reeling ? '收线中' : bite ? '鱼已咬钩' : session.phase === 'casting' ? '抛竿中' : '等待咬钩'}`, 38, 63, 680);
  ctx.font = '24px sans-serif'; ctx.fillStyle = bite ? '#ffdb82' : '#c4ebe0';
  ctx.fillText(reeling ? `鱼的动作：${({ light: '猛冲，轻收', steady: '平游，稳收', strong: '松劲，快收' })[fishingCue(session)]} · ${session.assisted ? '辅助收线中' : '让指针留在绿色区域'}`
    : bite ? '浮漂下沉！在黄色时间条结束前提竿' : '观察水面浮漂；未咬钩就提竿会惊走鱼', 38, 105, 680);
  fishingButtons = [];
  fishingForceRect = null;
  const button = (id, x, y, w, h, label, fill) => {
    ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = '#fff8df'; ctx.font = '700 31px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 11, w - 20);
    fishingButtons.push({ id, x, y, width: w, height: h });
  };
  if (reeling) {
    const guide = fishingForceGuide(session);
    ctx.textAlign = 'left'; ctx.font = '23px sans-serif'; ctx.fillStyle = '#e6f4e5';
    ctx.fillText(`收线 ${Math.floor(session.progress * 100)}%`, 40, 145);
    ctx.fillText(`鱼线受力 ${Math.floor(session.strain * 100)}%`, 402, 145);
    ctx.fillStyle = '#276467'; roundRect(ctx, 40, 158, 315, 20, 10);
    ctx.fillStyle = '#9bdf9d'; roundRect(ctx, 40, 158, Math.max(7, 315 * session.progress), 20, 10);
    ctx.fillStyle = '#276467'; roundRect(ctx, 402, 158, 315, 20, 10);
    ctx.fillStyle = session.strain > .72 ? '#ee8163' : '#e3bf69';
    roundRect(ctx, 402, 158, Math.max(7, 315 * session.strain), 20, 10);
    ctx.fillStyle = '#fff1c8'; ctx.font = '700 28px sans-serif';
    ctx.fillText(`力度 ${Math.round(session.forceValue * 100)}%`, 40, 221);
    ctx.fillStyle = '#a9ddc5'; ctx.font = '23px sans-serif';
    ctx.fillText(`安全 ${Math.round(guide.min * 100)}–${Math.round(guide.max * 100)}%`, 247, 221);
    ctx.fillText(`${guide.seconds.toFixed(1)}秒后 ${FISHING_FORCE_LABELS[guide.next]}`, 508, 221);
    button('force-down', 38, 234, 92, 92, '−5%', '#356f72');
    button('force-up', 632, 234, 92, 92, '+5%', '#356f72');
    fishingForceRect = { x: 145, y: 234, width: 470, height: 92 };
    ctx.fillStyle = '#725e51'; roundRect(ctx, 145, 261, 470, 35, 17);
    ctx.fillStyle = '#68bc93'; roundRect(ctx, 145 + 470 * guide.min, 261, 470 * (guide.max - guide.min), 35, 12);
    ctx.fillStyle = '#d9f8be'; ctx.fillRect(145 + 470 * guide.target - 2, 264, 4, 29);
    const knob = 145 + session.forceValue * 470;
    ctx.fillStyle = '#fff8de'; roundRect(ctx, knob - 9, 251, 18, 56, 8);
    ctx.textAlign = 'center'; ctx.fillStyle = '#c1d5c9'; ctx.font = '22px sans-serif';
    for (const percent of [0, 25, 50, 75, 100]) ctx.fillText(`${percent}%`, 145 + percent / 100 * 470, 345);
    for (const [index, force] of ['light', 'steady', 'strong'].entries()) {
      button(force, 38 + index * 171, 365, 154, 92, `${FISHING_FORCE_LABELS[force]} ${[25, 50, 75][index]}%`,
        !session.assisted && session.force === force ? '#b28636' : '#287974');
    }
    button('assist', 551, 365, 171, 92, session.assisted ? '辅助：开' : '辅助：关', session.assisted ? '#a07839' : '#466568');
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9d8ce'; ctx.font = '22px sans-serif';
    ctx.fillText('拖动力度条 · ← / → 微调 · 开辅助可跟随推荐', 40, 496, 680);
  } else {
    const remaining = bite ? Math.max(0, 1 - (session.elapsed - session.biteAt) / session.biteWindow) : 0;
    ctx.fillStyle = '#1d5a60'; roundRect(ctx, 40, 144, 680, 31, 15);
    ctx.fillStyle = bite ? '#f7cb65' : '#75b3b2';
    roundRect(ctx, 40, 144, 680 * (bite ? Math.max(.02, remaining) : .16), 31, 15);
    ctx.textAlign = 'left'; ctx.font = '23px sans-serif'; ctx.fillStyle = '#d7e9df';
    ctx.fillText(bite ? `剩余 ${(session.biteWindow * remaining).toFixed(1)} 秒 · 看准浮漂下沉再提竿`
      : '轻晃不是咬钩；突然下沉才是时机', 40, 218, 680);
    button('hook', 35, 283, 475, 105, '提竿 · 空格 / 点击', bite ? '#b88737' : '#427c78');
    button('cancel', 525, 283, 200, 105, '收竿取消', '#745f53');
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9d8ce'; ctx.font = '24px sans-serif';
    ctx.fillText('咬钩后可拖动力度条，也可开启辅助收线', 40, 443, 680);
  }
  fishingTexture.needsUpdate = true;
}

function dragFishingForce(x, y, continuing = false) {
  if (!fishingSession || fishingSession.phase !== 'reeling' || !fishingRect || !fishingForceRect) return false;
  const localX = (x - fishingRect.x) * fishingCanvas.width / fishingRect.width;
  const localY = (y - fishingRect.y) * fishingCanvas.height / fishingRect.height;
  const track = fishingForceRect;
  if (!continuing && (localX < track.x || localX > track.x + track.width || localY < track.y || localY > track.y + track.height)) return false;
  setFishingForce(fishingSession, (localX - track.x) / track.width);
  drawFishingPanel(); return true;
}

function handleFishingTap(x, y) {
  if (fishingResult && !fishingSession) {
    fishingResult = null; fishingSprite.visible = false; fishingRect = null;
    return false;
  }
  if (!fishingSession) return false;
  if (!fishingRect || x < fishingRect.x || x > fishingRect.x + fishingRect.width
    || y < fishingRect.y || y > fishingRect.y + fishingRect.height) return true;
  const localX = (x - fishingRect.x) * fishingCanvas.width / fishingRect.width;
  const localY = (y - fishingRect.y) * fishingCanvas.height / fishingRect.height;
  if (dragFishingForce(x, y)) return true;
  const hit = fishingButtons.find((item) => localX >= item.x && localX <= item.x + item.width
    && localY >= item.y && localY <= item.y + item.height);
  if (hit) handleFishingAction(hit.id);
  return true;
}

function updateRestTransition(deltaSeconds) {
  if (!restTransition) {
    restShade.visible = false;
    restSprite.visible = false;
    return;
  }
  const rest = restTransition;
  const { progress, minutes: reachedMinutes, stamina } = restProgress(rest, deltaSeconds, PASSIVE_TIME_SCALE * 2);
  advanceGameTime(state, Math.max(0, reachedMinutes - state.gameMinutes) / 2);
  const nutritionDue = restNutritionCost(rest.kind, progress);
  state.satiety = Math.max(0, state.satiety - (nutritionDue - rest.nutritionSpent));
  rest.nutritionSpent = nutritionDue;
  rest.recoveryCap = Math.min(rest.recoveryCap, restRecoveryCap(state));
  state.stamina = Math.min(rest.recoveryCap, Math.max(state.stamina, stamina));
  if (rest.elapsed - rest.savedElapsed >= 10) { saveState(state); rest.savedElapsed = rest.elapsed; }
  const ctx = restCanvas.getContext('2d');
  ctx.clearRect(0, 0, 640, 280);
  ctx.fillStyle = 'rgba(5,39,44,.97)';
  roundRect(ctx, 12, 12, 616, 256, 25);
  ctx.strokeStyle = '#ead38f';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff1d0';
  ctx.textAlign = 'center';
  ctx.font = '700 34px sans-serif';
  ctx.fillText(rest.kind === 'nap' ? '小屋 · 白天小憩' : '小屋 · 夜间休息', 320, 72);
  const hour = Math.floor(state.clockHours), minute = Math.floor((state.clockHours % 1) * 60);
  ctx.font = '24px sans-serif';
  ctx.fillText(`第${state.dayId}天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · 体力 ${Math.floor(state.stamina)}/100`, 320, 113);
  ctx.fillStyle = '#1b5658';
  roundRect(ctx, 64, 138, 512, 22, 11);
  ctx.fillStyle = '#b7dda2';
  roundRect(ctx, 64, 138, Math.max(10, 512 * progress), 22, 11);
  const secondsLeft = Math.ceil((rest.targetMinutes - reachedMinutes) / (PASSIVE_TIME_SCALE * 2));
  ctx.fillStyle = '#fff1d0'; ctx.font = '20px sans-serif';
  ctx.fillText(`剩余 ${Math.ceil(rest.targetMinutes - reachedMinutes)} 游戏分钟 · 现实 ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`, 320, 188);
  ctx.fillStyle = '#397459'; roundRect(ctx, 200, 205, 240, 48, 12);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 24px sans-serif'; ctx.fillText('起床 · 保留已恢复体力', 320, 237);
  restTexture.needsUpdate = true;
  restShade.visible = !hudOpen && !voyage?.mapOpen;
  restSprite.visible = !voyage?.mapOpen;
  restSprite.position.y = screen.height * (hudOpen ? .8 : .2);
  if (progress < 1) return;
  finishBedRest(false);
}

function finishBedRest(early = true) {
  if (!restTransition) return;
  const rest = restTransition;
  avatar.position.copy(rest.standingPosition);
  avatar.rotation.copy(rest.standingRotation);
  restTransition = null;
  busyAction = false;
  restShade.visible = false;
  restSprite.visible = false;
  flash(early ? `已经起床 · 恢复 ${Math.floor(Math.max(0, state.stamina - rest.initialStamina))} 体力 · 按实际休息扣除营养`
    : rest.interruptedByStorm ? '休息到台风预警时刻；请立即检查防灾措施'
    : rest.kind === 'nap' ? `小憩结束，体力有所恢复 · 饱腹 ${Math.floor(state.satiety)}/100`
      : `睡到清晨 06:00，体力已恢复 · 饱腹 ${Math.floor(state.satiety)}/100`);
  saveState(state);
  drawHud();
}

function drawHud() {
  const narrowHud = screen.width < 600;
  const tallPage = hudPage === 'logistics' || hudPage === 'inventory';
  const contentHeight = hudPage === 'kitchen' ? (narrowHud ? COOKING_MOBILE_HEIGHT : HUD_HEIGHT)
    : hudPage === 'shop' ? (narrowHud ? MOBILE_HUD_HEIGHT : HUD_HEIGHT)
    : hudPage === 'logistics' ? (narrowHud ? 690 : 700)
      : hudPage === 'inventory' ? (narrowHud ? 900 : 650)
        : hudPage === 'activity' ? (state.shelter.inside ? (narrowHud ? 560 : 420) : narrowHud ? 950 : 700)
          : hudPage === 'water' ? (narrowHud ? 690 : 560)
        : narrowHud ? (tallPage ? 820 : 690) : (tallPage ? 560 : 420);
  hudContentOffset = hudCanvas.height - contentHeight;
  if (hudNavRect) {
    const defaultWidth = Math.min(screen.width - (narrowHud ? 16 : 32), narrowHud ? 440 : 520);
    const availableHeight = Math.max(280, hudNavRect.y - (narrowHud ? 16 : 20));
    hudWidth = hudPage === 'shop' || hudPage === 'kitchen'
      ? Math.min(screen.width - (narrowHud ? 16 : 32), narrowHud ? 440 : 900,
        availableHeight * HUD_WIDTH / contentHeight)
      : defaultWidth;
    hudHeight = hudWidth * hudCanvas.height / HUD_WIDTH;
    const panelX = screen.width < 600 || hudPage === 'shop' || hudPage === 'kitchen' ? (screen.width - hudWidth) / 2 : screen.width - hudWidth - 16;
    const visiblePanelHeight = hudWidth * contentHeight / HUD_WIDTH;
    const panelY = hudNavRect.y - visiblePanelHeight - 8;
    hudPanelRect = { x: panelX, y: panelY, width: hudWidth, height: visiblePanelHeight };
    hudSprite.scale.set(hudWidth, hudHeight, 1);
    hudSprite.position.set(panelX + hudWidth / 2, screen.height - hudNavRect.y + 8, 0);
  }
  const ctx = hudContext;
  ctx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  const clock = Number.isFinite(state.clockHours) ? state.clockHours : 6;
  const clockLabel = `${String(Math.floor(clock)).padStart(2, '0')}:${String(Math.floor((clock % 1) * 60)).padStart(2, '0')}`;
  const tide = tideAt(Number.isFinite(Number(state.gameHours)) ? Number(state.gameHours) : 6);
  const tideLabel = ({ low: '低潮', rising: '涨潮', high: '高潮', falling: '退潮' })[tide] || '平潮';
  const day = state.dayId || 1;
  const stamina = Number.isFinite(state.stamina) ? state.stamina : 100;
  const stormInfo = stormStatus(state);
  const stormLabel = stormReportOpen && state.storm?.result ? `上场台风清算 · ${state.storm.result.intensity}级` :
    storm.phase === 'warning' ? `台风预警 · ${storm.strength}级` :
    storm.phase === 'preparing' ? `台风准备 · ${storm.strength}级 · ${state.shelter.inside && !state.shelter.doorOpen ? '已关门避险' : '请进屋关门'}` : storm.phase === 'impact'
      ? state.shelter.inside && !state.shelter.doorOpen ? '台风来袭 · 屋内避险' : '台风来袭 · 暴露在风雨中' :
      `第${day}天 ${clockLabel} · ${tideLabel}`;
  const top = statusCanvas.getContext('2d');
  top.clearRect(0, 0, 768, 146);
  top.fillStyle = 'rgba(5,48,53,.88)';
  roundRect(top, 4, 4, 760, 138, 24);
  top.strokeStyle = 'rgba(238,223,137,.64)';
  top.lineWidth = 2;
  top.strokeRect(12, 12, 744, 122);
  top.fillStyle = '#fff6d9';
  top.font = '700 27px sans-serif';
  top.fillText('孤岛余生 · 风暴物语', 28, 39);
  top.font = '600 22px sans-serif';
  top.fillText(`第${day}天 ${clockLabel}  ${tideLabel}  体力${Math.floor(stamina)}  水分${Math.floor(state.freshwater.hydration)}  饱腹${Math.floor(state.satiety)}  金币${state.gold}`, 28, 70, 706);
  top.font = '22px sans-serif';
  top.fillStyle = storm.phase === 'impact' ? '#ffd9bd' : '#b8f4df';
  const forecast = stormReportOpen && state.storm?.result
    ? `　货物损失 ${state.storm.result.totals.valueLost} 金 · ${state.storm.result.totals.itemsLost} 件 · 维修 ${state.storm.result.totals.repairCost} 金`
    : ['warning', 'preparation'].includes(stormInfo.stage)
    ? `　距登陆 ${Math.ceil(stormInfo.minutesToImpact / 60)} 小时`
    : state.storm.result ? `　上场损失 ${state.storm.result.totals.itemsLost} 件 · 维修 ${state.storm.result.totals.repairCost} 金`
      : `　鱼获 ${state.fishValue || 0} 金 · 水壶 ${state.freshwater.canteen}/${state.freshwater.canteenCapacity}L · 储水 ${state.freshwater.tank}/${state.freshwater.tankCapacity}L`;
  const statusLabel = storm.phase === 'calm' && !stormReportOpen ? forecast : `${stormLabel}${forecast}`;
  const marineStatus = voyage?.engaged ? (voyage.sailing ? `远航探索 · 船体 ${Math.round(state.boatDurability)}/100 · 已发现 ${state.voyage.discovered.length - 1}/4 座岛 · 海图规划航线` : '岛屿探索 · 点击资源采集，重新登船可返回家园') : marineMode === 'dive'
    ? `潜水剩余 ${Math.ceil(diveSecondsLeft)} 秒 · 当前 ${waterDepthMetres(avatar.position.x, avatar.position.z).toFixed(1)} 米 / 限深 ${diveDepthLimit()} 米`
    : marineMode === 'swim' ? '水面游泳 · 活动页可下潜 · 点击沙滩返回' : '';
  top.fillText(marineStatus || statusLabel, 28, 94, 706);
  top.fillStyle = '#ffdf8f'; top.font = '600 22px sans-serif';
  const nextAction = restTransition ? '正在休息 · 可查看背包、农田和海图，随时起床'
    : ['preparing', 'impact'].includes(storm.phase) ? '当前目标 · 进屋关门避险，检查防灾措施'
      : nextPlayerAction(state).text;
  top.fillText(`下一步：${nextAction}`, 28, 124, 706);
  statusTexture.needsUpdate = true;
  statusSprite.visible = !(hudOpen && hudPage === 'shop');

  const tabNames = [['activity', '活动'], ['voyage', '航海'], ['farm', '农田'], ['inventory', '背包'], ['kitchen', '烹饪'], ['trees', '林木'], ['storm', stormReportOpen ? '返回防灾' : '防灾'], ['logistics', '维修仓储']];
  if (state.shopLevel >= 2) tabNames.push(['orders', '订单']);
  const nav = navCanvas.getContext('2d');
  nav.clearRect(0, 0, 1000, 112);
  nav.fillStyle = 'rgba(5,48,53,.9)';
  roundRect(nav, 4, 4, 992, 104, 26);
  const tabGap = 8, tabWidth = (964 - (tabNames.length - 1) * tabGap) / tabNames.length;
  navButtons = tabNames.map(([id, title], index) => {
    const x = 18 + index * (tabWidth + tabGap);
    nav.fillStyle = hudOpen && hudPage === id ? '#b6853b' : '#226764';
    roundRect(nav, x, 16, tabWidth, 80, 18);
    nav.fillStyle = '#fff6d9';
  nav.font = '700 34px sans-serif';
    nav.textAlign = 'center';
    nav.fillText(title, x + tabWidth / 2, 65, tabWidth - 12);
    return { id: `tab-${id}`, x, y: 16, width: tabWidth, height: 80 };
  });
  navTexture.needsUpdate = true;
  navSprite.visible = !fishingSession;
  hudSprite.visible = hudOpen && !fishingSession;
  if (!hudOpen) { hudButtons = []; return; }
  ctx.save();
  ctx.translate(0, hudContentOffset);
  ctx.fillStyle = 'rgba(5,48,53,.92)';
  const panelBottom = contentHeight - 16;
  roundRect(ctx, 8, 8, 1008, panelBottom, 28);
  ctx.strokeStyle = 'rgba(238,223,137,.62)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 976, panelBottom - 32);
  ctx.fillStyle = '#fff6d9';
  ctx.font = '700 35px sans-serif';
  ctx.fillText(hudPage === 'shop' ? `码头交易 · ${tradeMode === 'buy' ? '购入' : '售出'}`
    : hudPage === 'activity' && state.shelter.inside ? '海风小屋'
    : hudPage === 'water' ? '淡水收集场' : tabNames.find(([id]) => id === hudPage)?.[1] || '操作', 45, 75);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#b8f4df';
  ctx.fillText(hudPage === 'inventory' ? '选择物品查看价值、等级与状态'
    : hudPage === 'activity' && state.shelter.inside ? state.shelter.doorOpen ? '门已打开 · 关门避险或选择出屋' : '门已关闭 · 屋内避险，可休息或开门'
    : hudPage === 'kitchen' ? `金币 ${state.gold} · 学习、制作与升级菜谱 · 在小屋旁烹饪`
    : hudPage === 'water' ? '饮水维持水分 · 清晨结算露水与降雨'
    : hudPage === 'shop' ? `金币 ${state.gold} · ${tradeMode === 'buy' ? '点击商品直接购买' : '点击货物售出该类全部库存'}`
      : '点击场景可移动 / 交互', 45, 112);
  ctx.fillStyle = '#94702f';
  roundRect(ctx, 889, 34, 82, 67, 16);
  ctx.fillStyle = '#fff6d9';
  ctx.font = '700 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('×', 930, 79);
  ctx.textAlign = 'start';

  const columns = [30, 520];
  const buttonWidth = 474;
  const sellableIds = [...Object.keys(SEAFOOD), ...Object.keys(CROPS), 'legacyFish'];
  const sellableCount = sellableIds.reduce((sum, id) => sum + (state.inventory[id] || 0), 0);
  const produceCount = Object.keys(CROPS).reduce((sum, id) => sum + (state.inventory[id] || 0), 0);
  const edibleCount = [...Object.keys(DISHES), ...Object.keys(CROPS), ...Object.keys(SEAFOOD)]
    .reduce((sum, id) => sum + (state.inventory[id] || 0), state.food || 0);
  const shopCards = hudPage === 'shop' ? drawTradePanel(ctx, narrowHud, hudContentOffset) : [];
  const report = state.storm?.result;
  const reportSummary = summarizeStormReport(report);
  const itemLabels = { crab: '沙蟹', reefFish: '珊瑚鱼', silverJack: '银鲹', lobster: '刺龙虾', pearlOyster: '珍珠贝', legacyFish: '旧鱼获', sweetPotato: '地瓜', tomato: '番茄', corn: '玉米', pineapple: '菠萝', pumpkin: '南瓜' };
  const dailyOrders = state.orderBoard?.dayId === state.dayId ? state.orderBoard.offers : [];
  const orderCards = dailyOrders.map((order, index) => {
    const requirements = order.requirements.map(({ itemId, quantity }) =>
      `${itemLabels[itemId] || itemId}×${quantity}（${state.inventory[itemId] || 0}）`).join(' + ');
    return {
      id: `order-deliver:${order.id}`, x: columns[index], y: 200,
      title: order.completed ? `今日订单 ${index + 1} · 已交付` : `交付订单 ${index + 1} · 额外奖励 ${order.bonus} 金`,
      detail: order.completed ? '已结清，不会重复扣货或发奖' : requirements,
      color: order.completed ? '#397459' : '#467b77',
    };
  });
  const stockRowsLost = reportSummary.inventory.rows;
  const stockBreakdown = stockRowsLost.slice(0, 3).map((row) => `${itemLabels[row.itemId] || row.itemId}×${row.lost}`).join('、') || '无库存损失';
  const assetBreakdown = ['boat', 'dock', 'hut'].map((key) => {
    const row = reportSummary.assets[key];
    return `${({ boat: '船', dock: '码头', hut: '小屋' })[key]} ${row.durabilityAfter ?? '—'}/100`;
  }).join(' · ');
  const protectionRows = reportSummary.protections;
  const protectionNames = { windNet: '防风网', drainage: '排水渠', anchor: '锚绳', waterproofCabinet: '防水柜', waveBarrier: '护栏', shutters: '门窗' };
  const protectionBreakdown = protectionRows.slice(0, 3).map(([key, row]) => `${protectionNames[key] || key} ${row.before}→${row.after}`).join(' · ') || '本场未安装防护';
  const plantedPlots = (state.plots || []).filter((plot) => plot.crop && CROPS[plot.crop.id]);
  const readyPlots = plantedPlots.filter((plot) => plot.crop.growthMinutes >= CROPS[plot.crop.id].minutes);
  const nextCrop = plantedPlots.filter((plot) => plot.crop.growthMinutes < CROPS[plot.crop.id].minutes)
    .sort((a, b) => (CROPS[a.crop.id].minutes - a.crop.growthMinutes) - (CROPS[b.crop.id].minutes - b.crop.growthMinutes))[0];
  const thirstyCrop = plantedPlots.find((plot) => plot.crop.growthMinutes < CROPS[plot.crop.id].minutes
    && state.gameMinutes >= plot.crop.wateredUntil);
  const nextProgress = nextCrop ? Math.min(1, nextCrop.crop.growthMinutes / CROPS[nextCrop.crop.id].minutes) : 0;
  const nextStage = nextProgress < .39 ? '萌芽' : nextProgress < .65 ? '长叶' : '结果';
  const selectedTree = state.trees.find((tree) => tree.id === selectedTreeId) || state.trees[0];
  const treeIndex = state.trees.indexOf(selectedTree);
  const treeProgress = Math.floor((selectedTree?.ageMinutes || 0) / TREE_MATURE_MINUTES * 100);
  const treeStatus = selectedTree?.stage === 'mature' ? `成树 · 健康 ${selectedTree.health}/100`
    : selectedTree?.stage === 'growing' ? `树苗 · 成长 ${treeProgress}% · 健康 ${selectedTree.health}/100`
      : selectedTree?.stage === 'stump' ? '已砍伐 · 可重新种植' : '空树位 · 可种植';
  const farmDetail = thirstyCrop
    ? `需浇水 · ${cropLabel(thirstyCrop.crop.id)}暂停生长`
    : nextCrop
    ? `可收 ${readyPlots.length} 块 · ${cropLabel(nextCrop.crop.id)}${nextStage} ${Math.floor(nextProgress * 100)}%`
    : readyPlots.length ? `可收 ${readyPlots.length} 块 · 点击田垄收获` : '空地点击田垄播种';
  const selectedPlot = state.plots.find(plot => plot.id === selectedPlotId) || readyPlots[0] || thirstyCrop || state.plots[0];
  const plotHint = plotGuidance(state, selectedPlot, selectedSeed);
  const selectedPlotIndex = state.plots.indexOf(selectedPlot);
  const stormReportCards = report ? [
    { id: 'storm-report-card-crops', x: columns[0], y: 200, title: `田间损失 · ${reportSummary.plots.unitsLost} 件`, detail: `${reportSummary.plots.count} 块受灾田 · 价值 ${reportSummary.plots.valueLost} 金`, color: '#94702f' },
    { id: 'storm-report-card-stock', x: columns[1], y: 200, title: `库存损失 · ${reportSummary.inventory.unitsLost} 件`, detail: `${stockBreakdown}${stockRowsLost.length > 3 ? ' 等' : ''} · 价值 ${reportSummary.inventory.valueLost} 金`, color: '#765b8b' },
    { id: 'storm-report-card-assets', x: columns[0], y: 316, title: `维修费用 · ${reportSummary.totals.repairCost} 金`, detail: assetBreakdown, color: '#397459' },
    { id: 'storm-report-card-protection', x: columns[1], y: 316, title: `防护减损(估算) · ${reportSummary.totals.protectedUnitsExpected.toFixed(1)} 件`, detail: `${protectionBreakdown}${protectionRows.length > 3 ? ' 等' : ''} · 建筑减伤 ${reportSummary.totals.durabilitySaved} 耐久`, color: '#467b77' },
    { id: 'storm-report-card-shelter', title: !report.shelter ? '旧战报 · 无人员避险记录'
      : report.shelter.protected ? '人员避险 · 全程安全' : `人员暴露 · ${report.shelter.exposureMinutes} 分钟`,
    detail: `避险取决于进屋并关门 · 体力损失 ${report.shelter?.staminaLost || 0}`, color: '#765b8b' },
  ] : [
    { id: 'storm-report-card-crops', x: columns[0], y: 200, title: '尚无清算记录', detail: '第一次台风结算后，这里会保存详细报告', color: '#467b77' },
    { id: 'storm-report-card-stock', x: columns[1], y: 200, title: '损失按实结算', detail: '作物、背包与仓库分别列出，不重复扣除', color: '#397459' },
    { id: 'storm-report-card-assets', x: columns[0], y: 316, title: '耐久与维修费', detail: '显示船、码头、小屋灾前/灾后状态', color: '#94702f' },
    { id: 'storm-report-card-protection', x: columns[1], y: 316, title: '防护效果', detail: '显示每项已安装设施的磨损变化', color: '#765b8b' },
  ];
  const definitions = hudPage === 'shop' || hudPage === 'kitchen' ? [] : hudPage === 'water' ? [
    { id: 'water-drink', title: `饮用 1 L · 水壶 ${state.freshwater.canteen}/${state.freshwater.canteenCapacity} L`,
      detail: `水分 ${Math.floor(state.freshwater.hydration)}/100 · 低于 25 会限制体力恢复`, color: '#287f74' },
    { id: 'water-refill', title: `从储水桶补水 · ${state.freshwater.tank}/${state.freshwater.tankCapacity} L`,
      detail: '需走到淡水收集场 · 农田浇水也消耗水壶淡水', color: '#397459' },
    { id: 'water-still', title: state.freshwater.stillLevel ? '太阳能蒸馏器 · 已安装' : '安装太阳能蒸馏器 · 80 金',
      detail: state.freshwater.stillLevel ? '晴雨皆可每日额外产出 2 L' : '前往交易站购买 · 降低旱日缺水风险', color: '#94702f' },
    { id: 'water-info', title: `明日预计收集 ${dailyWaterYield(state.dayId + 1, state.freshwater.stillLevel)} L`,
      detail: rainForDay(state.dayId + 1) ? '明日有降雨 · 06:00 汇入储水桶' : '明日晴朗 · 仅露水与蒸馏产水', color: '#467b77' },
  ] : hudPage === 'logistics' ? [
    { id: 'repair-boat', x: 30, y: 200, title: `修理船只 · ${state.boatDurability}/100`, detail: `修复至 100 耐久　${repairQuote(state, 'boat')?.cost || 0} 金`, color: '#467b77' },
    { id: 'repair-dock', x: 356, y: 200, title: `修理码头 · ${state.dockDurability}/100`, detail: `修复至 100 耐久　${repairQuote(state, 'dock')?.cost || 0} 金`, color: '#397459' },
    { id: 'repair-hut', x: 682, y: 200, title: `修理小屋 · ${state.hutDurability}/100`, detail: `修复至 100 耐久　${repairQuote(state, 'hut')?.cost || 0} 金`, color: '#765b8b' },
    ...['boat', 'dock', 'hut'].map((asset) => {
      const quote = woodPatchQuote(state, asset);
      const label = ({ boat: '船只', dock: '码头', hut: '小屋' })[asset];
      return { id: `wood-patch-${asset}`, title: `木材抢修${label} · ${state[`${asset}Durability`]}/100`,
        detail: quote.ok ? `修 ${quote.points} 耐久需 ${quote.wood} 木 · 现有 ${state.wood} 木` : '40 耐久以上请用金币修理', color: '#8a6539' };
    }),
    { id: 'store-all', x: 30, y: 316, title: '存入背包货物', detail: `${Object.values(state.inventory).reduce((sum, n) => sum + n, 0)} 件 · 全部存入仓库`, color: '#94702f' },
    { id: 'retrieve-all', x: 356, y: 316, title: '取出仓库货物', detail: `${Object.values(state.storage).reduce((sum, n) => sum + n, 0)} 件 · 全部取回背包`, color: '#94702f' },
  ] : hudPage === 'orders' ? [
    ...orderCards,
    ...(dailyOrders.length === 1 ? [{ id: 'order-info-next', x: columns[1], y: 200, title: '每日一份混合订单', detail: '无线电商店 Lv.3 可增加第二单', color: '#397459' }] : []),
    { id: 'order-info-pay', x: columns[0], y: 316, title: '交付收益', detail: '按商品正常售价结算，另加订单奖励', color: '#94702f' },
    { id: 'order-info-refresh', x: columns[1], y: 316, title: `已完成 ${state.ordersCompleted} 份`, detail: '每日 06:00 刷新；未完成订单不罚款', color: '#765b8b' },
  ] : hudPage === 'activity' && state.shelter.inside ? [
    ...hutControls(state.shelter),
    { id: 'activity-rest', title: '在小屋休息', detail: restPreviewText(), color: '#765b8b' },
  ] : hudPage === 'activity' ? [
    ...hutControls(state.shelter),
    { id: 'activity-voyage', title: '驾驶小船 · 探索群岛', detail: '海图选航线 · 自由驾驶 · 靠岸搜寻淡水和食物', color: '#a37b3a' },
    { id: 'activity-catch', x: columns[0], y: 200, title: `${SEAFOOD[selectedSeafood]?.label || '沙蟹'} · ${SEAFOOD[selectedSeafood]?.tool === 'rod' ? '抛竿垂钓' : '开始采集'}`,
      detail: SEAFOOD[selectedSeafood]?.tool === 'rod' ? '看浮漂提竿 · 跟随鱼的动作控制收线力度'
        : `${SEAFOOD[selectedSeafood]?.depth || '0–2 m'} · 成功率约 ${Math.round((SEAFOOD[selectedSeafood]?.chance || .85) * 100)}%`, color: '#287f74' },
    { id: 'activity-cycle', x: columns[1], y: 200, title: '切换海产目标', detail: '沙蟹 · 珊瑚鱼 · 银鲹 · 龙虾 · 珍珠贝', color: '#467b77' },
    { id: 'sell', x: columns[0], y: 316, title: '返回码头出售', detail: `${sellableCount} 件可售货物 · 果蔬 ${produceCount} 件`, color: '#397459' },
    { id: 'activity-meal', title: `烹饪与菜谱 · 食物 ${edibleCount} 件`,
      detail: `已做好 ${edibleDishCount(state)} 份 · 料理提升饱腹，吃饱后休息`, color: '#8a6539' },
    marineMode === 'land'
      ? { id: 'activity-rest', x: columns[1], y: 316, title: state.shelter.inside ? '在小屋休息' : '回小屋休息 · 先开门进入',
        detail: restPreviewText(), color: '#765b8b' }
      : { id: 'activity-dive', x: columns[1], y: 316,
        title: marineMode === 'dive' ? '浮出水面' : '下潜探索',
        detail: marineMode === 'dive' ? `剩余 ${Math.ceil(diveSecondsLeft)} 秒 · 自动上浮保命`
          : state.diveLevel ? `潜水服 Lv.${state.diveLevel} · 氧气 ${Math.floor(state.oxygen)}` : '徒手限深 3 米 · 闭气 12 秒',
        color: '#286e8a' },
    ...(state.hasNet ? [{ id: 'activity-net', title: `高级渔网 · 今日 ${state.netUsesDay}/3 次`,
      detail: '先选珊瑚鱼或银鲹 · 一网双次捕获判定', color: '#287f74' }] : []),
  ] : hudPage === 'trees' ? [
    { id: 'tree-chop', x: columns[0], y: 200, title: `砍伐椰树 · ${selectedTree?.stage === 'mature' ? '可砍伐' : '未成熟'}`, detail: '成熟树产 2–4 木材 · 消耗 8 体力', color: '#94702f' },
    { id: 'tree-plant', x: columns[1], y: 200,
      title: state.inventory.palmSeed ? `种植椰树 · 椰树种子 ${state.inventory.palmSeed} 枚`
        : state.storage.palmSeed ? `取回椰树种子 · 仓库 ${state.storage.palmSeed} 枚` : '购买椰树种子 · 10 金',
      detail: state.inventory.palmSeed ? '在空树位或树桩种植 · 约两天长成'
        : state.storage.palmSeed ? '农田种子不能种树 · 点击前往仓库' : '农田种子不能种树 · 点击前往商店', color: '#397459' },
    { id: 'tree-tend', x: columns[0], y: 316, title: '浇水养护', detail: '每日一次 · 加速 6 小时并恢复健康', color: '#287f74' },
    { id: 'tree-next', x: columns[1], y: 316, title: `查看下一棵 · ${treeIndex + 1}/${state.trees.length}`, detail: `当前 ${treeStatus} · 也可点场景中的树`, color: '#467b77' },
  ] : hudPage === 'farm' ? [
    { id: 'farm-go', x: columns[0], y: 200, title: `${plotHint.action} · 第 ${selectedPlotIndex + 1} 块田 · ${plotHint.status}`, detail: plotHint.detail, color: '#397459' },
    { id: 'farm-seed', x: columns[1], y: 200, title: `切换种子 · ${cropLabel(selectedSeed)} ×${state.inventory[`${selectedSeed}Seed`] || 0}`, detail: '缺货时田地自动改用背包中的农田种子', color: '#94702f' },
    { id: 'farm-buy-seed', x: columns[0], y: 316, title: '购买 1 包种子', detail: `${cropLabel(selectedSeed)} ${CROPS[selectedSeed].seedPrice} 金 · 前往码头`, color: '#94702f' },
    { id: 'farm-help', x: columns[1], y: 316, title: `切换田块 · ${selectedPlotIndex + 1}/${state.plots.length}`, detail: `已种 ${plantedPlots.length}/${state.plots.length} · ${farmDetail}`, color: '#287f74' },
  ] : hudPage === 'storm' && stormReportOpen ? stormReportCards : hudPage === 'storm' ? [
    ...hutControls(state.shelter),
    { id: 'defense-net', x: columns[0], y: 200, title: '防风网 · 60 金', detail: '一组保护最多 6 块田', color: '#397459' },
    { id: 'defense-drain', x: columns[1], y: 200, title: '排水渠 · 80 金', detail: '减轻台风水损与日常潮害', color: '#397459' },
    { id: 'defense-anchor', x: columns[0], y: 316, title: '加固锚绳 · 70 金', detail: '船只必须回港并完成安装', color: '#467b77' },
    { id: 'storm-report-open', x: columns[1], y: 316, title: '上次台风 · 查看明细', detail: '作物、库存、建筑与防护磨损', color: '#94702f' },
  ] : [];
  if (!['activity', 'farm', 'shop', 'inventory', 'kitchen', 'trees', 'storm', 'logistics', 'orders', 'water'].includes(hudPage)) hudPage = 'activity';
  let cards = definitions.map(({ id, title, detail, color }, index) => {
    const logisticsGrid = narrowHud && hudPage === 'logistics';
    const x = narrowHud && !logisticsGrid ? 30 : columns[index % 2];
    const y = narrowHud && !logisticsGrid ? 130 + index * 132 : 135 + Math.floor(index / 2) * 135;
    const cardWidth = narrowHud && !logisticsGrid ? 964 : buttonWidth;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, cardWidth, 119, 22);
    ctx.strokeStyle = 'rgba(255,246,217,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, cardWidth - 6, 113);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff6d9';
    ctx.font = '700 25px sans-serif';
    ctx.fillText(title, x + cardWidth / 2, y + 52, cardWidth - 24);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#d7f1df';
    ctx.fillText(detail, x + cardWidth / 2, y + 86, cardWidth - 24);
    ctx.textAlign = 'start';
    return { id, x, y: y + hudContentOffset, width: cardWidth, height: 119 };
  });
  if (hudPage === 'inventory') {
    const inventoryUi = drawInventoryPanel(ctx, state, {
      mode: inventoryMode, page: inventoryPage, selectedId: selectedInventoryId,
      narrow: narrowHud, offset: hudContentOffset,
    });
    inventoryPage = inventoryUi.page;
    selectedInventoryId = inventoryUi.selectedId;
    cards = inventoryUi.buttons;
  }
  if (hudPage === 'shop') cards = shopCards;
  if (hudPage === 'kitchen') cards = drawCookingPanel(ctx, state, {
    selectedId: selectedRecipeId, narrow: narrowHud, offset: hudContentOffset,
    progress: cookingJob ? cookingJob.elapsed / cookingJob.duration : null, labels: itemLabels, page: kitchenPage,
  });
  ctx.restore();
  hudButtons = [{ id: 'close-panel', x: 889, y: hudContentOffset + 34, width: 82, height: 67 }, ...cards];
  hudTexture.needsUpdate = true;
}

function flash(text) {
  messageUntil = Date.now() + 2600;
  const ctx = feedbackCanvas.getContext('2d');
  ctx.clearRect(0, 0, feedbackCanvas.width, feedbackCanvas.height);
  ctx.fillStyle = 'rgba(5,48,53,.94)';
  roundRect(ctx, 12, 13, 776, 128, 24);
  ctx.strokeStyle = '#e6c987';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff6dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 32px sans-serif';
  const characters = [...text];
  const split = characters.length > 25 ? Math.ceil(characters.length / 2) : characters.length;
  if (split < characters.length) {
    ctx.fillText(characters.slice(0, split).join(''), 400, 63, 720);
    ctx.fillText(characters.slice(split).join(''), 400, 106, 720);
  } else ctx.fillText(text, 400, 79, 720);
  feedbackTexture.needsUpdate = true;
  feedbackSprite.visible = true;
  drawHud();
}

function positionFeedback() {
  if (Date.now() >= messageUntil || !avatar || !feedbackSprite.visible) {
    feedbackSprite.visible = false;
    return;
  }
  feedbackAnchor.copy(avatar.position).y += 2.5;
  feedbackAnchor.project(camera);
  const width = Math.min(390, screen.width - 24);
  const height = width * feedbackCanvas.height / feedbackCanvas.width;
  const x = (feedbackAnchor.x + 1) * screen.width / 2;
  const y = (feedbackAnchor.y + 1) * screen.height / 2 + 55;
  feedbackSprite.scale.set(width, height, 1);
  feedbackSprite.position.set(THREE.MathUtils.clamp(x, width / 2 + 8, screen.width - width / 2 - 8),
    THREE.MathUtils.clamp(y, height / 2 + 12, screen.height - height / 2 - 12), 0);
  feedbackSprite.material.opacity = Math.min(1, (messageUntil - Date.now()) / 350);
}

const cropOptions = Object.entries(CROPS).map(([id, crop]) => ({ id, seed: `${id}Seed`, name: crop.label, minutes: crop.minutes, yield: crop.yield, value: crop.price }));
const shopCatalog = [
  ['sweetPotatoSeed', '地瓜种子', '12 小时成熟 · 2 枚'], ['tomatoSeed', '番茄种子', '24 小时成熟 · 2 枚'],
  ['cornSeed', '玉米种子', '36 小时成熟 · 3 枚'], ['pineappleSeed', '菠萝种子', '48 小时成熟 · 2 枚'],
  ['pumpkinSeed', '南瓜种子', '72 小时成熟 · 2 枚'], ['diveSupply', '潜水耗材包', '出海潜水的必备消耗品'],
  ['palmSeed', '椰树种子', '10 金 · 可在树桩或空树位种植'],
  ['rod2', '鱼竿 Lv.2', '解锁银鲹 · 提竿窗口更宽'], ['rod3', '鱼竿 Lv.3', '扩大提竿容错 · 收线更稳'],
  ['shovel2', '铁锹 Lv.2', '播种省体力 · 可扩至 8 田'], ['shovel3', '铁锹 Lv.3', '播种更省力 · 需度过首场台风'],
  ['net', '高级渔网', '双次判定 · 每日最多 3 网'], ['dive1', '潜水服 Lv.1', '解锁龙虾 · 需铁船与礁区探索'],
  ['dive2', '潜水服 Lv.2', '解锁珍珠贝 · 需快艇'], ['ironBoat', '小铁船', '解锁外海 · 木船换购补差'],
  ['speedBoat', '快艇', '航程减半 · 需码头 Lv.2 与两场台风'], ['dock2', '码头 Lv.2', '开放快艇升级 · 需度过首场台风'],
  ['windNet', '防风网', '保护最多 6 块田'], ['drainage', '排水渠', '减轻风暴积水与潮害'],
  ['anchor', '加固锚绳', '减轻已回港船只损伤'], ['waterproofCabinet', '防水柜', '保护仓库中选定货物'],
  ['waveBarrier', '消浪护栏', '在海中浮标处安装 · 降低码头风暴损伤'], ['windowReinforcement', '门窗加固件', '降低小屋风暴损伤'],
  ['raisedBed', '高畦改造', '选择一块低地田免受日常潮峰影响'], ['backpack', '背包扩容', '容量 20 → 30'],
  ['warehouse', '仓库扩容', '容量 40 → 80'], ['hut2', '小屋升级', '增加储物空间'], ['shop2', '无线电商店 Lv.2', '累计售货 150 金后解锁订单'],
  ['shop3', '无线电商店 Lv.3', '完成 5 份订单后每日双订单'], ['lamp', '手提灯', '夜间照明，不改变鱼获概率'],
  ['solarStill', '太阳能蒸馏器', '每日额外收集 2 L 淡水'],
  ['lowPlot', '开垦低地田', '便宜扩田 · 需承担潮汐风险'], ['highPlot', '开垦高地田', '扩建安全农田 · 数量有限'],
].map(([id, name, description]) => ({ id, name, description }));

function tradePageSize() { return screen.width < 600 ? 8 : 9; }

function tradeIcon(itemId, mode) {
  const cropId = itemId.endsWith('Seed') && itemId !== 'palmSeed' ? itemId.slice(0, -4) : null;
  const gearIcons = {
    rod2: 'rod', rod3: 'rod', shovel2: 'shovel', shovel3: 'shovel',
    ironBoat: 'boat', speedBoat: 'boat', dock2: 'dock', hut2: 'hut',
    dive1: 'dive', dive2: 'dive', diveSupply: 'dive',
    shop2: 'shop', shop3: 'shop', warehouse: 'warehouse',
    lowPlot: 'lowPlot', highPlot: 'highPlot',
  };
  return {
    icon: cropId || gearIcons[itemId] || (itemId === 'palmSeed' ? 'palmSeed' : itemId === 'legacyFish' ? 'reefFish' : itemId),
    kind: cropId || itemId === 'palmSeed' ? 'seed'
      : mode === 'sell' && SEAFOOD[itemId] ? 'seafood'
        : mode === 'sell' && CROPS[itemId] ? 'crop' : 'gear',
  };
}

function drawTradePanel(ctx, narrow, offset) {
  const buttons = [];
  const perPage = tradePageSize();
  const sellableItems = [...Object.keys(SEAFOOD), ...Object.keys(CROPS), 'legacyFish']
    .filter((id) => (state.inventory[id] || 0) > 0);
  const items = tradeMode === 'buy' ? shopCatalog : sellableItems;
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  if (tradeMode === 'buy') shopPage = Math.min(shopPage, pageCount - 1);
  else sellPage = Math.min(sellPage, pageCount - 1);
  const page = tradeMode === 'buy' ? shopPage : sellPage;
  const controlY = 129, controlHeight = narrow ? 102 : 68;
  for (const [mode, title, x] of [['buy', '购入', 30], ['sell', '售出', 266]]) {
    ctx.fillStyle = tradeMode === mode ? '#bc883b' : '#256967';
    roundRect(ctx, x, controlY, 222, controlHeight, 15);
    ctx.fillStyle = '#fff6d9'; ctx.font = '700 29px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, x + 111, controlY + controlHeight / 2 + 10);
    buttons.push({ id: `shop-mode:${mode}`, x, y: controlY + offset, width: 222, height: controlHeight });
  }
  for (const [id, title, x] of [['shop-prev', '‹', 520], ['shop-next', '›', 851]]) {
    ctx.fillStyle = '#286f70'; roundRect(ctx, x, controlY, 123, controlHeight, 15);
    ctx.fillStyle = '#fff6d9'; ctx.font = '700 42px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, x + 61, controlY + controlHeight / 2 + 14);
    buttons.push({ id, x, y: controlY + offset, width: 123, height: controlHeight });
  }
  ctx.fillStyle = '#fff6d9'; ctx.font = '700 25px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${page + 1} / ${pageCount}`, 748, controlY + controlHeight / 2 + 8);
  ctx.textAlign = 'start';
  if (!items.length) {
    ctx.fillStyle = '#b8f4df'; ctx.font = '700 32px sans-serif';
    ctx.fillText('背包暂无可售货物', 44, 330);
    ctx.font = '25px sans-serif'; ctx.fillText('捕鱼、采集或收获后，到码头交易站出售。', 44, 378);
    return buttons;
  }
  const columns = narrow ? 2 : 3;
  const cardWidth = narrow ? 474 : 310;
  const cardHeight = narrow ? 185 : 155;
  const startY = narrow ? 246 : 211;
  const gapX = narrow ? 16 : 16;
  const gapY = narrow ? 12 : 13;
  items.slice(page * perPage, (page + 1) * perPage).forEach((entry, index) => {
    const itemId = tradeMode === 'buy' ? entry.id : entry;
    const x = 30 + index % columns * (cardWidth + gapX);
    const y = startY + Math.floor(index / columns) * (cardHeight + gapY);
    const quantity = state.inventory[itemId] || 0;
    const price = tradeMode === 'buy' ? SHOP[itemId] : itemId === 'legacyFish'
      ? state.legacyFishValue || 0 : quantity * (SEAFOOD[itemId]?.price ?? CROPS[itemId]?.price ?? 0);
    const title = tradeMode === 'buy' ? entry.name
      : SEAFOOD[itemId]?.label || CROPS[itemId]?.label || '旧鱼获';
    const detail = tradeMode === 'buy' ? entry.description : `库存 ${quantity} 件 · 一次售出全部`;
    const affordable = tradeMode !== 'buy' || state.gold >= price;
    ctx.fillStyle = affordable ? (tradeMode === 'buy' ? '#80602f' : '#2a7160') : '#505a58';
    roundRect(ctx, x, y, cardWidth, cardHeight, 17);
    ctx.strokeStyle = 'rgba(255,246,217,.65)'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, cardWidth - 4, cardHeight - 4);
    const iconSize = narrow ? 130 : 100;
    drawIcon(ctx, tradeIcon(itemId, tradeMode), x + 10, y + (cardHeight - iconSize) / 2, iconSize);
    const textX = x + (narrow ? 153 : 120);
    const maxTextWidth = cardWidth - (textX - x) - 10;
    ctx.fillStyle = '#fff6d9'; ctx.font = `700 ${narrow ? 31 : 23}px sans-serif`;
    ctx.fillText(title, textX, y + (narrow ? 47 : 43), maxTextWidth);
    ctx.fillStyle = affordable ? '#ffe3a0' : '#e6b6a9';
    ctx.font = `700 ${narrow ? 29 : 23}px sans-serif`;
    ctx.fillText(`${tradeMode === 'buy' ? '价格' : '可得'} ${price} 金`, textX, y + (narrow ? 90 : 79), maxTextWidth);
    ctx.fillStyle = '#d8eee1'; ctx.font = `${narrow ? 23 : 18}px sans-serif`;
    ctx.fillText(detail, textX, y + (narrow ? 133 : 109), maxTextWidth);
    if (tradeMode === 'buy' && quantity > 0) {
      ctx.fillStyle = '#c7f3d4'; ctx.font = `${narrow ? 22 : 18}px sans-serif`;
      ctx.fillText(`已拥有 ${quantity}`, textX, y + (narrow ? 165 : 137), maxTextWidth);
    }
    buttons.push({ id: `shop-${tradeMode}:${itemId}`, x, y: y + offset, width: cardWidth, height: cardHeight });
  });
  return buttons;
}

function cropLabel(id) { return CROPS[id]?.label || '地瓜'; }

function beginCapture(speciesId, tool, requestedTarget = null) {
  const spec = SEAFOOD[speciesId];
  const needsBoat = Boolean(spec?.boatTier);
  if (!spec) return;
  if (needsBoat && state.boatTier === 'wreck') { flash('船只已损毁，先到码头修复'); return; }
  if (spec.boatTier === 'iron' && state.boatTier === 'wood' || spec.boatTier === 'speed' && state.boatTier !== 'speed') {
    flash(`需要${spec.boatTier === 'speed' ? '快艇' : '小铁船'}才能到达这片水域`); return;
  }
  if (spec.rodLevel && state.rodLevel < spec.rodLevel) { flash(`升级鱼竿至 Lv.${spec.rodLevel} 后再来`); return; }
  if (spec.diveLevel && state.diveLevel < spec.diveLevel) { flash(`需要潜水装备 Lv.${spec.diveLevel}`); return; }
  const target = requestedTarget && targetAvailable(requestedTarget) ? requestedTarget
    : findMarineTarget(speciesId, needsBoat ? { x: BOAT_MOOR.x, z: BOAT_MOOR.z } : null);
  if (!target || target.speciesId !== speciesId) { flash(`附近没有可见的${spec.label}，等它们回游再试`); return; }
  reserveMarineTarget(target);
  if (needsBoat) {
    if (!walkTo(DOCK_APPROACH.x, DOCK_APPROACH.z, { type: 'trip-start', speciesId, tool, targetId: target.id }, 1.0)) releaseMarineTarget();
    return;
  }
  const shoreCast = tool === 'rod';
  const radius = Math.hypot(target.x, target.z);
  const shoreRadius = shoreCast ? Math.min(radius, shoreRadiusAt(target.x, target.z) - .65) : radius;
  const destination = shoreCast
    ? { x: target.x * shoreRadius / radius, z: target.z * shoreRadius / radius }
    : { x: target.x, z: target.z };
  if (!walkTo(destination.x, destination.z, { type: 'capture', speciesId, tool, targetId: target.id }, shoreCast ? .55 : 1.15)) releaseMarineTarget();
}

function startBoatReturnTrip() {
  if (!heroBoat) return;
  boatTrip = {
    phase: 'return', elapsed: 0, duration: 1.4,
    fromX: heroBoat.position.x, fromZ: heroBoat.position.z,
    toX: BOAT_MOOR.x, toZ: BOAT_MOOR.z,
  };
}

function updateBoatTrip(deltaSeconds) {
  if (!boatTrip || !heroBoat) return;
  boatTrip.elapsed += deltaSeconds;
  const t = Math.min(1, boatTrip.elapsed / boatTrip.duration);
  const eased = t * t * (3 - 2 * t);
  heroBoat.position.x = boatTrip.fromX + (boatTrip.toX - boatTrip.fromX) * eased;
  heroBoat.position.z = boatTrip.fromZ + (boatTrip.toZ - boatTrip.fromZ) * eased;
  avatar.position.set(heroBoat.position.x + .55, heroBoat.position.y + .45, heroBoat.position.z);
  if (t < 1) return;
  const trip = boatTrip;
  boatTrip = null;
  if (trip.phase === 'outbound') {
    spendActionTime(state, 10);
    state.explored.reef = true;
    completeArrival({ type: 'sea-capture', speciesId: trip.speciesId, tool: trip.tool, targetId: trip.targetId });
    if (!fishingSession) startBoatReturnTrip();
  } else {
    spendActionTime(state, 10);
    state.boatMoored = true;
    avatar.position.set(DOCK_APPROACH.x, groundHeightAt(DOCK_APPROACH.x, DOCK_APPROACH.z) + .02, DOCK_APPROACH.z);
    flash('已返港，鱼获与潜水状态已保存');
    saveState(state);
    drawHud();
  }
}

function openDockTrade(mode = 'buy') {
  hudOpen = false;
  drawHud();
  return walkTo(DOCK_APPROACH.x, DOCK_APPROACH.z, { type: 'open-trade', mode }, .9);
}

function buyAtDock(itemId) {
  const index = shopCatalog.findIndex((item) => item.id === itemId);
  if (index >= 0) shopPage = Math.floor(index / tradePageSize());
  openDockTrade('buy');
}

function installTargets(itemId) {
  if (itemId === 'raisedBed') {
    const ids = state.plots.filter((plot) => plot.elevation === 'low' && !plot.raised).slice(0, 1).map((plot) => plot.id);
    return ids.length ? ids : null;
  }
  if (itemId === 'windNet' || itemId === 'drainage') {
    const ids = state.plots.filter((plot) => !state.defenses.plots.find((entry) => entry.id === plot.id)?.[itemId])
      .slice(0, 6).map((plot) => plot.id);
    return ids.length ? ids : null;
  }
  const field = { anchor: 'anchor', waterproofCabinet: 'waterproofCabinet', waveBarrier: 'waveBarrier', windowReinforcement: 'shutters' }[itemId];
  return field && !state.defenses[field] ? [] : null;
}

function beginInstallStock(itemId) {
  if (!(state.inventory[itemId] > 0)) { flash('背包没有该物资；若在仓库，请先取回'); return false; }
  if (!installTargets(itemId)) { flash('当前没有可安装的位置；多余物资会留在背包'); return false; }
  const destination = itemId === 'waveBarrier' ? WAVE_BARRIER_APPROACH
    : itemId === 'anchor' ? DOCK_APPROACH
    : ['waterproofCabinet', 'windowReinforcement'].includes(itemId) ? HUT_APPROACH
      : { x: plots.garden.pos[0], z: plots.garden.pos[2] };
  hudOpen = false;
  return walkTo(destination.x, destination.z, { type: 'install', itemId });
}

function useInventoryItem(itemId) {
  if (INSTALLABLE_STOCK[itemId]) { beginInstallStock(itemId); return; }
  if (itemId === 'wood') { hudPage = 'logistics'; hudOpen = true; return; }
  if (itemId === 'diveSupply') { hudPage = 'activity'; hudOpen = true; return; }
  if (itemId === 'palmSeed') {
    const tree = state.trees.find((entry) => ['empty', 'stump'].includes(entry.stage) && treeVisuals.has(entry.id));
    if (!tree) { flash('暂无空树位；砍伐成熟树后可在树桩重新种植'); return; }
    selectedTreeId = tree.id;
    hudOpen = false;
    walkTo(tree.x, tree.z, { type: 'tree-work', treeId: tree.id, operation: 'plant' }, 1.2);
    return;
  }
  const cropId = itemId.endsWith('Seed') ? itemId.slice(0, -4) : null;
  if (CROPS[cropId]) {
    const index = state.plots.findIndex((plot) => !plot.crop);
    if (index < 0) { flash('田块已种满，收获后再播种'); return; }
    const root = cropObjects[index];
    if (!root) { flash('田块还在加载，请稍后再试'); return; }
    selectedSeed = cropId;
    hudOpen = false;
    walkTo(root.position.x, root.position.z, { type: 'world', root }, .65);
    return;
  }
  if (DISHES[itemId] || CROPS[itemId] || SEAFOOD[itemId] || itemId === 'food') {
    const result = eatMeal(state, itemId);
    flash(result.ok ? `吃下${result.label} · 饱腹 ${Math.floor(result.satiety)}/100；休息后可恢复体力`
      : result.reason === 'full' ? '已经吃饱了，先休息或继续劳作' : '这份食物已经用完');
    saveState(state);
    return;
  }
  if (itemId === 'legacyFish') {
    const sellables = [...Object.keys(SEAFOOD), ...Object.keys(CROPS), 'legacyFish']
      .filter((id) => (state.inventory[id] || 0) > 0);
    sellPage = Math.max(0, Math.floor(sellables.indexOf(itemId) / tradePageSize()));
    openDockTrade('sell');
  }
}

function tradeIsInReach() {
  return Math.hypot(avatar.position.x - DOCK_APPROACH.x, avatar.position.z - DOCK_APPROACH.z) <= 2.3;
}

function handlePageAction(id) {
  if (restTransition && !['tab-inventory', 'tab-farm', 'tab-voyage', 'close-panel', 'inventory-prev', 'inventory-next', 'farm-help'].includes(id)
    && !id.startsWith('inventory-select:') && !id.startsWith('inventory-mode:')) { flash('休息中可查看信息；先起床再进行操作'); return; }
  if (cookingJob && !id.startsWith('tab-') && id !== 'close-panel') { flash('正在烹饪，请等待这一份料理完成'); return; }
  if (id === 'tab-voyage' || id === 'activity-voyage') { voyage?.open(); return; }
  if (id.startsWith('tab-')) {
    voyage?.dismiss();
    if (id === 'tab-storm') stormReportOpen = false;
    const nextPage = id.slice(4);
    hudOpen = hudPage === nextPage ? !hudOpen : true;
    hudPage = nextPage;
    drawHud();
    return;
  }
  if (id === 'close-panel') { hudOpen = false; drawHud(); return; }
  if (id === 'activity-meal') { hudPage = 'kitchen'; hudOpen = true; drawHud(); return; }
  if (id.startsWith('kitchen-')) { handleKitchenAction(id); return; }
  if (id.startsWith('inventory-use:') && (DISHES[id.slice(14)] || CROPS[id.slice(14)] || SEAFOOD[id.slice(14)] || id.slice(14) === 'food')) {
    if (busyAction) { flash('请先完成当前动作'); return; }
    useInventoryItem(id.slice(14)); drawHud(); return;
  }
  if (id === 'water-drink') {
    const result = drinkWater(state);
    flash(result.ok ? `饮水完成 · 水分 ${Math.floor(result.hydration)}/100 · 体力恢复上限 ${staminaCeiling(state)}`
      : result.reason === 'full' ? '当前水分充足，无需饮水' : '水壶已空，请到淡水收集场补水');
    saveState(state); drawHud(); return;
  }
  if (id === 'water-info') return;
  if (id.startsWith('inventory-mode:')) {
    inventoryMode = id.slice('inventory-mode:'.length);
    inventoryPage = 0;
    selectedInventoryId = null;
    drawHud();
    return;
  }
  if (id.startsWith('inventory-select:')) {
    selectedInventoryId = id.slice('inventory-select:'.length);
    drawHud();
    return;
  }
  if (id === 'inventory-prev' || id === 'inventory-next') {
    const pages = Math.max(1, Math.ceil(getInventoryRows(state, inventoryMode).length / (screen.width < 600 ? 4 : 6)));
    inventoryPage = (inventoryPage + (id === 'inventory-next' ? 1 : -1) + pages) % pages;
    selectedInventoryId = null;
    drawHud();
    return;
  }
  if (id === 'hut-door') { activateHutDoor(); return; }
  if (id === 'hut-close') { closeHutDoor(); return; }
  if (id === 'hut-exit') { if (state.shelter.inside && state.shelter.doorOpen) startHutCrossing(false); return; }
  if (storm.phase === 'impact') { flash('台风登陆中，请在小屋内避险'); return; }
  if (state.shelter.inside && !['activity-rest', 'farm-help'].includes(id)) { flash('先开门走出小屋，再进行室外操作'); return; }
  if (id === 'water-refill') {
    const inReach = Math.hypot(avatar.position.x - FRESHWATER_SITE.x, avatar.position.z - FRESHWATER_SITE.z) < 2.2;
    if (inReach) completeArrival({ type: 'water-refill' });
    else { hudOpen = false; walkTo(FRESHWATER_SITE.x + 1.35, FRESHWATER_SITE.z, { type: 'water-refill' }, .9); }
    return;
  }
  if (id === 'water-still') {
    if (state.freshwater.stillLevel) { flash('太阳能蒸馏器已安装，每日额外产出 2 L'); return; }
    buyAtDock('solarStill');
    return;
  }
  if (id.startsWith('inventory-retrieve:')) {
    const itemId = id.slice('inventory-retrieve:'.length);
    hudOpen = false;
    walkTo(HUT_APPROACH.x, HUT_APPROACH.z, { type: 'retrieve-item', itemId });
    return;
  }
  if (id.startsWith('inventory-use:')) {
    useInventoryItem(id.slice('inventory-use:'.length));
    drawHud();
    return;
  }
  if (id === 'tree-next') {
    const index = state.trees.findIndex((tree) => tree.id === selectedTreeId);
    selectedTreeId = state.trees[(index + 1) % state.trees.length].id;
    drawHud(); return;
  }
  if (['tree-chop', 'tree-plant', 'tree-tend'].includes(id)) {
    const tree = state.trees.find((entry) => entry.id === selectedTreeId);
    if (!tree || !treeVisuals.has(tree.id)) { flash('这处树位不可到达，请选择另一棵'); return; }
    const operation = id.slice('tree-'.length);
    if (operation === 'plant' && !state.inventory.palmSeed) {
      const cropSeeds = Object.entries(CROPS).filter(([cropId]) => state.inventory[`${cropId}Seed`] > 0)
        .map(([, crop]) => crop.label);
      if (state.storage.palmSeed) hudPage = 'logistics';
      else {
        buyAtDock('palmSeed');
        flash(cropSeeds.length ? `${cropSeeds.slice(0, 2).join('、')}种子只能种田；请到交易站买椰树种子`
          : '背包没有椰树种子；正前往交易站');
        return;
      }
      hudOpen = true;
      flash('椰树种子在仓库，请先取回背包；农田种子不能种椰树');
      return;
    }
    if (operation === 'chop' && tree.stage !== 'mature') { flash('树还没有长成，暂时不能砍伐'); return; }
    if (operation === 'plant' && !['empty', 'stump'].includes(tree.stage)) { flash('这里已有树木，请选择空树位或树桩'); return; }
    if (operation === 'tend' && !['growing', 'mature'].includes(tree.stage)) { flash('这里没有可养护的树'); return; }
    walkTo(tree.x, tree.z, { type: 'tree-work', treeId: tree.id, operation }, 1.2);
    return;
  }
  if (id === 'shop-next' || id === 'shop-prev') {
    const count = tradeMode === 'buy' ? shopCatalog.length : [...Object.keys(SEAFOOD), ...Object.keys(CROPS), 'legacyFish']
      .filter((itemId) => (state.inventory[itemId] || 0) > 0).length;
    const pages = Math.max(1, Math.ceil(count / tradePageSize()));
    const step = id === 'shop-next' ? 1 : -1;
    if (tradeMode === 'buy') shopPage = (shopPage + step + pages) % pages;
    else sellPage = (sellPage + step + pages) % pages;
    drawHud(); return;
  }
  if (id.startsWith('shop-mode:')) { tradeMode = id.slice('shop-mode:'.length); drawHud(); return; }
  if (id === 'shop-toggle') { tradeMode = tradeMode === 'buy' ? 'sell' : 'buy'; drawHud(); return; }
  if (id.startsWith('shop-buy:')) {
    if (!tradeIsInReach()) { hudOpen = false; flash('请走近码头交易站后再购买'); return; }
    completeArrival({ type: 'buy', itemId: id.slice('shop-buy:'.length), quantity: 1 });
    return;
  }
  if (id.startsWith('shop-sell:')) {
    if (!tradeIsInReach()) { hudOpen = false; flash('请走近码头交易站后再出售'); return; }
    const itemId = id.slice('shop-sell:'.length);
    const result = sellItem(state, itemId);
    flash(result.ok ? `售出${SEAFOOD[itemId]?.label || CROPS[itemId]?.label || '旧鱼获'} ×${result.quantity}，收入 ${result.value} 金`
      : '出售失败：背包没有这类货物');
    saveState(state);
    return;
  }
  if (id === 'shop-empty' || id === 'shop-info') return;
  if (id === 'storm-report-open') { stormReportOpen = true; drawHud(); return; }
  if (id.startsWith('storm-report-card-')) return;
  if (id.startsWith('order-deliver:')) {
    const result = submitOrder(state, id.slice('order-deliver:'.length));
    flash(result.ok ? `订单完成：货款 ${result.baseValue} + 奖励 ${result.bonus} 金` :
      result.reason === 'insufficient-stock' ? '背包货物不足；先捕鱼或收获，再交付订单' : '订单已刷新或已经完成');
  }
  else if (id === 'activity-catch') beginCapture(selectedSeafood, SEAFOOD[selectedSeafood]?.tool || 'hand');
  else if (id === 'activity-net') {
    if (selectedSeafood !== 'reefFish' && selectedSeafood !== 'silverJack') {
      flash('渔网适用于珊瑚鱼或银鲹；请先切换海产目标'); return;
    }
    if (state.netUsesDay >= 3) { flash('今天已下 3 网，明天再来'); return; }
    beginCapture(selectedSeafood, 'net');
  }
  else if (id === 'activity-dive') toggleDive();
  else if (id === 'activity-cycle') {
    const species = Object.keys(SEAFOOD);
    selectedSeafood = species[(species.indexOf(selectedSeafood) + 1) % species.length];
    flash(`目标切换为${SEAFOOD[selectedSeafood].label}`);
  }
  else if (id === 'sell') {
    openDockTrade('sell');
  } else if (id === 'activity-rest') {
    requestBedRest();
  } else if (id === 'farm-go') {
    const ready = state.plots.findIndex((plot) => plot.crop && plot.crop.growthMinutes >= CROPS[plot.crop.id]?.minutes);
    const thirsty = state.plots.findIndex((plot) => plot.crop && plot.crop.growthMinutes < CROPS[plot.crop.id]?.minutes
      && state.gameMinutes >= plot.crop.wateredUntil);
    const empty = state.plots.findIndex((plot) => !plot.crop);
    const selected = state.plots.findIndex(plot => plot.id === selectedPlotId);
    const target = selected >= 0 ? selected : ready >= 0 ? ready : thirsty >= 0 ? thirsty : empty >= 0 ? empty : 0;
    selectedPlotId = state.plots[target]?.id;
    if (!state.plots[target]?.crop && !usableCropSeed(state, selectedSeed)) { buyAtDock(`${selectedSeed}Seed`, 1); return; }
    const root = cropObjects[target];
    if (root) walkTo(root.position.x, root.position.z, { type: 'world', root }, .65);
    else flash('田地正在准备中，请稍后再试');
  } else if (id === 'farm-seed') {
    const index = cropOptions.findIndex((crop) => crop.id === selectedSeed);
    selectedSeed = cropOptions[(index + 1) % cropOptions.length].id;
    flash(`已选择${cropLabel(selectedSeed)}种子`);
  } else if (id === 'farm-buy-seed') buyAtDock(cropOptions.find((crop) => crop.id === selectedSeed).seed, 1);
  else if (id === 'farm-help') {
    const current = state.plots.findIndex(plot => plot.id === selectedPlotId);
    const fallback = state.plots.findIndex(plot => plot.crop && plot.crop.growthMinutes >= CROPS[plot.crop.id]?.minutes);
    const thirsty = state.plots.findIndex(plot => plot.crop && plot.crop.growthMinutes < CROPS[plot.crop.id]?.minutes && state.gameMinutes >= plot.crop.wateredUntil);
    const active = current >= 0 ? current : fallback >= 0 ? fallback : thirsty >= 0 ? thirsty : 0;
    selectedPlotId = state.plots[(active + 1) % state.plots.length]?.id;
  }
  else if (id === 'defense-net') buyAtDock('windNet');
  else if (id === 'defense-drain') buyAtDock('drainage');
  else if (id === 'defense-anchor') buyAtDock('anchor');
  else if (id === 'defense-cabinet') buyAtDock('waterproofCabinet');
  else if (id === 'repair-boat' || id === 'repair-dock') {
    walkTo(DOCK_APPROACH.x, DOCK_APPROACH.z, { type: 'repair', asset: id === 'repair-boat' ? 'boat' : 'dock' });
  } else if (id === 'repair-hut') {
    walkTo(HUT_APPROACH.x, HUT_APPROACH.z, { type: 'repair', asset: 'hut' });
  } else if (id.startsWith('wood-patch-')) {
    const asset = id.slice('wood-patch-'.length);
    const destination = asset === 'hut' ? HUT_APPROACH : DOCK_APPROACH;
    walkTo(destination.x, destination.z, { type: 'wood-patch', asset });
  } else if (id === 'store-all' || id === 'retrieve-all') {
    const from = id === 'store-all' ? 'inventory' : 'storage';
    const to = id === 'store-all' ? 'storage' : 'inventory';
    walkTo(HUT_APPROACH.x, HUT_APPROACH.z, { type: 'move-stock', from, to });
  }
}

function handleHudTap(x, y) {
  if (restTransition) {
    const localX = (x - (restSprite.position.x - restSprite.scale.x / 2)) * 640 / restSprite.scale.x;
    const localY = (y - (screen.height - restSprite.position.y - restSprite.scale.y / 2)) * 280 / restSprite.scale.y;
    if (restSprite.visible && localX >= 200 && localX <= 440 && localY >= 205 && localY <= 253) { finishBedRest(); return true; }
  }
  const inside = (rect) => rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  let button;
  const inNavHitArea = hudNavRect && x >= hudNavRect.x && x <= hudNavRect.x + hudNavRect.width
    && y >= hudNavRect.y - 6 && y <= hudNavRect.y + hudNavRect.height + 6;
  if (inNavHitArea) {
    const localX = (x - hudNavRect.x) * navCanvas.width / hudNavRect.width;
    button = navButtons.find(({ x: bx, width }) => localX >= bx && localX <= bx + width);
    if (!button) return true;
  } else if (hudOpen && inside(hudPanelRect)) {
    const localX = (x - hudPanelRect.x) * HUD_WIDTH / hudPanelRect.width;
    const localYs = [y].map((touchY) =>
      (touchY - hudPanelRect.y) * HUD_WIDTH / hudWidth + hudContentOffset);
    button = localYs.map((localY) => hudButtons.find(({ x: bx, y: by, width, height }) =>
      localX >= bx && localX <= bx + width && localY >= by && localY <= by + height)).find(Boolean);
    if (!button) return true;
  } else return false;
  handlePageAction(button.id);
  if (!button.id.startsWith('tab-') && !button.id.startsWith('inventory-')
    && !button.id.startsWith('shop-') && !button.id.startsWith('kitchen-')
    && !keepHutControlsOpen(button.id, state.shelter)
    && !['activity-meal', 'close-panel', 'tree-next', 'tree-plant', 'activity-cycle', 'farm-seed', 'farm-help', 'storm-report-open'].includes(button.id)) {
    hudOpen = false;
  }
  saveState(state);
  drawHud();
  return true;
}

function updateCamera() {
  const aspect = screen.width / screen.height;
  // Cutaway: lift the hut roof once the player zooms in close enough to see inside.
  const keepRoof = !state.shelter.inside && !forceCutaway && viewSize >= 34;
  for (const roof of hutRoofs) roof.visible = keepRoof;
  camera.left = -viewSize * aspect / 2;
  camera.right = viewSize * aspect / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.near = .1;
  camera.far = 100;
  const focus = voyage?.focus;
  const x = focus?.x || 0, z = focus?.z || 0;
  camera.position.set(x + Math.cos(azimuth) * 24, 24, z + Math.sin(azimuth) * 24);
  camera.lookAt(x, 0, z);
  camera.updateProjectionMatrix();
}

function resize() {
  screen = viewport();
  renderer.setPixelRatio(screen.dpr);
  renderer.setSize(screen.width, screen.height, false);
  updateCamera();
  hudCamera.left = 0; hudCamera.right = screen.width;
  hudCamera.top = screen.height; hudCamera.bottom = 0;
  hudCamera.near = -1; hudCamera.far = 1;
  hudCamera.updateProjectionMatrix();
  restShade.position.set(screen.width / 2, screen.height / 2, 0);
  restShade.scale.set(screen.width, screen.height, 1);
  restSprite.position.set(screen.width / 2, screen.height / 2, 0);
  const restWidth = Math.min(600, screen.width - 28);
  restSprite.scale.set(restWidth, restWidth * 280 / 640, 1);
  const narrow = screen.width < 600;
  hudCanvas.height = narrow ? Math.max(MOBILE_HUD_HEIGHT, COOKING_MOBILE_HEIGHT) : HUD_HEIGHT;
  hudWidth = Math.min(screen.width - (narrow ? 16 : 32), narrow ? 440 : 520);
  hudHeight = hudWidth * hudCanvas.height / HUD_WIDTH;
  const navWidth = Math.min(screen.width - (narrow ? 8 : 32), narrow ? 440 : 520);
  const navHeight = narrow ? Math.max(64, navWidth * navCanvas.height / navCanvas.width) : navWidth * navCanvas.height / navCanvas.width;
  const navX = narrow ? (screen.width - navWidth) / 2 : screen.width - navWidth - 16;
  const navY = screen.height - navHeight - (narrow ? 8 : 16);
  hudNavRect = { x: navX, y: navY, width: navWidth, height: navHeight };
  navSprite.scale.set(navWidth, navHeight, 1);
  navSprite.position.set(navX + navWidth / 2, screen.height - navY - navHeight, 0);
  const panelX = narrow ? (screen.width - hudWidth) / 2 : screen.width - hudWidth - 16;
  const panelY = navY - hudHeight - 8;
  hudPanelRect = { x: panelX, y: panelY, width: hudWidth, height: hudHeight };
  hudSprite.scale.set(hudWidth, hudHeight, 1);
  hudSprite.position.set(panelX + hudWidth / 2, screen.height - panelY - hudHeight, 0);
  const statusWidth = Math.min(screen.width - 16, narrow ? 440 : 520);
  const statusHeight = statusWidth * statusCanvas.height / statusCanvas.width;
  const statusX = narrow ? (screen.width - statusWidth) / 2 : 16;
  statusSprite.scale.set(statusWidth, statusHeight, 1);
  statusSprite.position.set(statusX, screen.height - (narrow ? 60 : HUD_TOP), 0);
  drawHud();
  voyage?.resize();
  if (fishingSession || fishingResult) drawFishingPanel();
}

function findAction(object) {
  while (object && !object.userData.action) object = object.parent;
  return object;
}

function pick(x, y) {
  if (restTransition || bedApproach || fishingSession || cookingJob) return;
  raycaster.setFromCamera(new THREE.Vector2(x / screen.width * 2 - 1, 1 - y / screen.height * 2), camera);
  const hit = raycaster.intersectObjects(interactive.filter((item) => item.visible), true)[0];
  const root = hit && findAction(hit.object);
  if (root?.userData.action.type === 'hut-bed') { requestBedRest(); return; }
  const point = raycaster.intersectObjects([...walkGroundMeshes, water], false)[0]?.point;
  if (voyage?.pick(root?.userData.action, point)) return;
  if (state.shelter.inside && root?.userData.action.type !== 'hut-door' && root?.userData.action.type !== 'kitchen') {
    if (state.shelter.doorOpen && isOutsideHut(point)) startHutCrossing(false, { x: point.x, z: point.z });
    else flash(state.shelter.doorOpen ? '点击小屋门或屋外地面走出' : '小屋门已关闭，请先点击门打开');
    return;
  }
  if (root) {
    if (root.userData.action.type === 'voyage-board') { boardVoyageFromHome(); return; }
    if (root.userData.action.type === 'hut-door') { activateHutDoor(); return; }
    if (root.userData.action.type === 'kitchen') { hudPage = 'kitchen'; hudOpen = true; drawHud(); return; }
    if (state.shelter.inside) { flash('先开门离开小屋'); return; }
    if (root.userData.action.type === 'wave-barrier-site') {
      if (state.defenses.waveBarrier) flash('消浪护栏已安装在海中，正在保护码头');
      else if (state.inventory.waveBarrier > 0) beginInstallStock('waveBarrier');
      else if (state.storage.waveBarrier > 0) flash('消浪护栏在仓库，请先取回背包再来安装');
      else { flash('需要先购买消浪护栏，正前往交易站'); buyAtDock('waveBarrier'); }
      return;
    }
    if (root.userData.action.type === 'trade') { openDockTrade('buy'); return; }
    if (root.userData.action.type === 'freshwater') {
      hudOpen = false;
      walkTo(FRESHWATER_SITE.x + 1.35, FRESHWATER_SITE.z, { type: 'water-station' }, .9);
      return;
    }
    if (root.userData.action.type === 'tree') {
      selectedTreeId = root.userData.action.treeId;
      hudPage = 'trees'; hudOpen = true;
      drawHud();
      return;
    }
    if (root.userData.action.type === 'marine') {
      const target = marineTargets.find((entry) => entry.id === root.userData.action.targetId);
      if (targetAvailable(target)) beginCapture(target.speciesId, SEAFOOD[target.speciesId].tool, target);
      else flash('这只海产已经离开，等它重新出现');
      return;
    }
    if (root.userData.action.type === 'gather' && !root.userData.action.active) { flash('这堆物资还在整理，稍后会补充'); return; }
    const point = root.getWorldPosition(new THREE.Vector3());
    walkTo(point.x, point.z, { type: 'world', root }, root.userData.action.type === 'farmplot' ? .65 : .85);
    return;
  }
  if (point && !state.shelter.inside) walkTo(point.x, point.z);
}

function boardVoyageFromHome() {
  if (!voyage || !avatar || boatTrip || fishingSession || busyAction) { flash('请先完成当前动作'); return; }
  if (state.shelter.inside) { flash('先开门离开小屋，再到码头登船'); return; }
  if (['preparing', 'impact'].includes(storm.phase)) { flash('台风将至，请留在家园避险，风浪平息后出航'); return; }
  if (state.boatDurability <= 0 || state.boatTier === 'wreck') { flash('船只已损坏，先维修再出航'); return; }
  hudOpen = false;
  return walkTo(DOCK_APPROACH.x, DOCK_APPROACH.z, { type: 'voyage-board' }, .8);
}

let gesture = null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
onTouches({
  start(points) {
    if (points.length === 1 && dragFishingForce(points[0].x, points[0].y)) { gesture = { fishingForce: true }; return; }
    if (points.length === 1 && voyage?.beginHold(points[0].x, points[0].y)) { gesture = { helm: true }; return; }
    if (points.length === 1) gesture = { x: points[0].x, y: points[0].y, lastX: points[0].x, moved: 0, time: Date.now() };
    if (points.length === 2) gesture = { pinch: distance(points[0], points[1]), size: viewSize };
  },
  move(points) {
    if (!gesture) return;
    if (gesture.fishingForce) { if (points.length) dragFishingForce(points[0].x, points[0].y, true); return; }
    if (gesture.helm) return;
    if (fishingSession) return;
    if (points.length === 1 && !gesture.pinch) {
      const dx = points[0].x - gesture.lastX;
      gesture.moved += Math.abs(dx) + Math.abs(points[0].y - gesture.y);
      gesture.lastX = points[0].x;
      gesture.y = points[0].y;
      azimuth -= dx * .006;
      updateCamera();
    } else if (points.length === 2 && gesture.pinch) {
      viewSize = THREE.MathUtils.clamp(gesture.size * gesture.pinch / distance(points[0], points[1]), 30, 50);
      updateCamera();
    }
  },
  end(points) {
    if (gesture?.fishingForce) { gesture = null; return; }
    if (voyage?.endHold() || gesture?.helm) { gesture = null; return; }
    if (gesture && !gesture.pinch && gesture.moved < 18 && Date.now() - gesture.time < 450) {
      if (!voyage?.tap(gesture.x, gesture.y) && !handleFishingTap(gesture.x, gesture.y) && !handleHudTap(gesture.x, gesture.y)) pick(gesture.x, gesture.y);
    }
    gesture = points.length ? gesture : null;
  },
});

onResize(resize);

function frame(timeMs) {
  const time = timeMs * .001;
  const stormWind = storm.phase === 'impact' ? 1.8 : storm.phase === 'preparing' ? .95 : storm.phase === 'warning' ? .42 : .08;
  const deltaSeconds = previousFrameMs ? Math.min(.1, Math.max(0, (timeMs - previousFrameMs) / 1000)) : 0;
  previousFrameMs = timeMs;
  if (foreground && deltaSeconds > 0) {
    if (restTransition) updateRestTransition(deltaSeconds);
    else if (!fishingSession && !boatTrip) advanceGameTime(state, deltaSeconds * PASSIVE_TIME_SCALE);
    syncStorm();
    updateFishingSession(deltaSeconds, timeMs);
    updateHutDoor(deltaSeconds);
    updateBedApproach(deltaSeconds);
    updateCooking(deltaSeconds);
    updateAvatar(deltaSeconds);
    animateAvatarFace(avatar, time, Boolean(fishingSession) || avatar?.userData.actionUntil > sceneElapsed);
    updateCoastalAvatar(deltaSeconds);
    updateBoatTrip(deltaSeconds);
    updateCatchEffects(deltaSeconds);
    for (const object of interactive) {
      if (object.userData.indoorBedLabel) object.visible = state.shelter.inside;
      const data = object.userData.action;
      if (data?.type !== 'gather') continue;
      data.active = (state.gatherCooldowns[data.nodeId] || 0) <= state.gameMinutes;
      object.visible = data.active;
    }
    refreshFarmBeds();
    refreshSiteProps();
    refreshFreshwaterVisuals();
    refreshEquipmentVisuals();
    refreshTreeVisuals();
    refreshBoatVisuals();
    if (timeMs - lastSaveMs > 5000) { saveState(state); lastSaveMs = timeMs; }
    if (timeMs - lastHudDrawMs > 700) { drawHud(); lastHudDrawMs = timeMs; }
  }
  water.material.uniforms.uTime.value = time;
  water.material.uniforms.uStorm.value = Math.min(1, stormWind / 1.8);
  for (const uniform of animatedShaderUniforms) uniform.value = time;
  for (const uniform of windShaderUniforms) {
    uniform.time.value = time;
    uniform.strength.value = stormWind;
  }
  water.material.uniforms.uBoatWake.value = boatTrip ? 1 : 0;
  if (boatTrip) {
    const dx = boatTrip.toX - boatTrip.fromX;
    const dz = boatTrip.toZ - boatTrip.fromZ;
    const length = Math.hypot(dx, dz) || 1;
    water.material.uniforms.uBoatDir.value.set(dx / length, dz / length);
  }
  const hour = Number.isFinite(Number(state.clockHours)) ? Number(state.clockHours) : 6;
  const tidePhase = -Math.cos(hour * Math.PI / 6);
  updateWalkDestination();
  water.material.uniforms.uTide.value = tidePhase;
  water.position.y = -.02 + tidePhase * .14;
  if (foreground) voyage?.update(deltaSeconds, water.position.y);
  if (visualProps.barrierMarker) visualProps.barrierMarker.position.y = water.position.y + .12 + Math.sin(time * 1.5) * .035;
  // The baked hull keel sits .27 m above its root; keep that keel at the
  // changing surface while the gunwale and deck stay visibly above it.
  const boatFloatY = boatFloatOffset(water.position.y, time);
  if (heroBoat && !boatTrip && !voyage?.engaged) {
    heroBoat.position.set(BOAT_MOOR.x + Math.sin(time * .42) * (.12 + stormWind * .045),
      BOAT_MESH_ORIGIN.y + boatFloatY, BOAT_MOOR.z + Math.sin(time * .31) * .08);
    heroBoat.rotation.set(Math.sin(time * (1.1 + stormWind)) * (.018 + stormWind * .025), 0,
      Math.sin(time * (.86 + stormWind * .7)) * (.024 + stormWind * .035));
    water.material.uniforms.uBoat.value.set(heroBoat.position.x, heroBoat.position.z);
    refreshBoatVisuals();
  }
  else if (heroBoat && !voyage?.engaged) {
    heroBoat.position.y = BOAT_MESH_ORIGIN.y + boatFloatY;
    avatar.position.y = heroBoat.position.y + .45;
    water.material.uniforms.uBoat.value.set(heroBoat.position.x, heroBoat.position.z);
    refreshBoatVisuals();
  }
  if (voyage?.engaged) {
    water.material.uniforms.uBoat.value.set(heroBoat.position.x, heroBoat.position.z);
    water.material.uniforms.uBoatWake.value = voyage.wake;
    water.material.uniforms.uBoatDir.value.set(Math.sin(voyage.heading), Math.cos(voyage.heading));
    refreshBoatVisuals();
    updateCamera();
  }
  const focus = voyage?.focus;
  const light = environment.update(hour, storm.phase, time, foreground ? deltaSeconds : 0,
    { x: focus?.x || 0, z: focus?.z || 0 }, water.position.y);
  water.material.uniforms.uDaylight.value = light.waterLight;
  water.material.uniforms.uSunlight.value = light.sunlight * (1 - light.cloud * .78);
  water.material.uniforms.uMoonlight.value = light.moonlight * (1 - light.cloud * .94);
  water.material.uniforms.uSunDirection.value.copy(environment.sun.position).sub(environment.sun.target.position).normalize();
  water.material.uniforms.uMoonDirection.value.copy(environment.moon.position).sub(environment.moon.target.position).normalize();
  if (storm.phase === 'impact' || storm.phase === 'preparing') {
    camera.position.set((focus?.x || 0) + Math.cos(azimuth) * 24 + Math.sin(time * 1.7) * stormWind * .018,
      24 + Math.sin(time * 1.3) * stormWind * .012,
      (focus?.z || 0) + Math.sin(azimuth) * 24 + Math.cos(time * 1.5) * stormWind * .018);
    camera.lookAt(focus?.x || 0, 0, focus?.z || 0);
  }
  for (const item of animated) {
    if (item.school) {
      const { inst, data, matrix, pos, quat, bankQuat, scale, crabGait, normal, slopeQuat } = item.school;
      for (let i = 0; i < data.length; i++) {
        const fish = data[i];
        let heading;
        if (fish.target?.reserved) {
          pos.set(fish.target.x, fish.y, fish.target.z);
          heading = fish.crab?.heading ?? fish.roamer?.heading ?? fish.phase;
        } else if (fish.crab) {
          stepSandCrab(fish.crab, foreground ? deltaSeconds : 0);
          pos.set(fish.crab.x, fish.y, fish.crab.z);
          heading = fish.crab.heading;
        } else if (fish.roamer) {
          stepRoamer(fish.roamer, deltaSeconds);
          pos.set(fish.roamer.x, fish.y + Math.sin(time * .85 + fish.bob) * fish.bobble, fish.roamer.z);
          heading = fish.roamer.heading;
        } else {
          const angle = fish.phase + time * fish.speed;
          pos.set(Math.cos(angle) * fish.radius, fish.y + Math.sin(time * 1.4 + fish.bob) * fish.bobble,
                  Math.sin(angle) * fish.radius);
          heading = Math.atan2(Math.cos(angle), -Math.sin(angle)) + (fish.speed < 0 ? Math.PI : 0);
        }
        if (fish.crab) {
          pos.y = groundHeightAt(pos.x, pos.z) - fish.groundMinY * fish.size + .012;
          crabGait.setXY(i, fish.crab.gait, fish.target?.reserved ? 0 : fish.crab.activity);
        }
        if (fish.target) {
          fish.target.x = pos.x; fish.target.y = pos.y; fish.target.z = pos.z;
          const available = targetAvailable(fish.target);
          fish.target.proxy.visible = available;
          fish.target.proxy.position.set(pos.x, pos.y, pos.z);
          if (!available) {
            if (fish.crab) sandTracks?.follow(fish.target.id, pos, { kind: 'crab', enabled: false });
            scale.setScalar(0.0001); matrix.compose(pos, quat, scale); inst.setMatrixAt(i, matrix); continue;
          }
        }
        quat.setFromAxisAngle(Y_AXIS, -heading);
        if (fish.crab) {
          sandTracks?.follow(fish.target.id, pos, { kind: 'crab', angle: -heading,
            enabled: foreground && !fish.target.reserved });
          // Match the sloping beach plane so uphill feet don't disappear in
          // sand while the downhill legs float in the air.
          const dx = (groundHeightAt(pos.x + .16, pos.z) - groundHeightAt(pos.x - .16, pos.z)) / .32;
          const dz = (groundHeightAt(pos.x, pos.z + .16) - groundHeightAt(pos.x, pos.z - .16)) / .32;
          normal.set(-dx, 1, -dz).normalize();
          slopeQuat.setFromUnitVectors(Y_AXIS, normal).multiply(quat);
          quat.copy(slopeQuat);
        }
        if (fish.bank) {
          bankQuat.setFromAxisAngle(X_AXIS, fish.bank * Math.sin(time * 1.7 + fish.bob));
          quat.multiply(bankQuat);
        }
        scale.setScalar(fish.size);
        matrix.compose(pos, quat, scale);
        inst.setMatrixAt(i, matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (crabGait) crabGait.needsUpdate = true;
      continue;
    }
    if (item.bob) item.object.position.y = item.baseY + Math.sin(time * item.speed) * item.amount;
    if (item.spin) item.object.rotation.z = time * item.speed;
    if (item.grow && item.object.scale.x < item.target) {
      const scale = Math.min(item.target, item.object.scale.x + .045);
      item.object.scale.setScalar(scale);
    }
    if (!item.bob && !item.spin && !item.grow) item.object.rotation.z = Math.sin(time * item.speed) * item.amount;
  }
  if (activeMarineTarget && marineTargetMarker) marineTargetMarker.position.set(activeMarineTarget.x, water.position.y + .12, activeMarineTarget.z);
  if (avatar && sandTracks) {
    sandTracks.follow('avatar', avatar.position, { enabled: foreground && avatar.visible
      && !hutCrossing && !state.shelter.inside && !boatTrip
      && (voyage?.engaged ? voyage.ashore : marineMode === 'land') });
    sandTracks.update(foreground ? deltaSeconds : 0, time, tidePhase, water.material.uniforms.uStorm.value);
    sandTrackVisual.sync();
  }
  positionFeedback();
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(hudScene, hudCamera);
  nextFrame(frame);
}

async function start() {
  await loadSceneAssets();
  state.boatMoored = true;
  createResources();
  Object.keys(plots).forEach(addPlot);
  createSiteProps();
  createTradeSign();
  createFreshwaterCollector();
  createHutDoorSign();
  createCookingStation();
  createAvatar();
  voyage = createVoyageScene({ scene, hudScene, state, interactive, surfUniforms: water.material.uniforms, palmSource: voyagePalmSource, artAssets: voyageArtAssets, getAvatar: () => avatar, getBoat: () => heroBoat,
    flash, save: saveState, boardFromHome: boardVoyageFromHome, getScreen: () => screen,
    closeHud: () => { hudOpen = false; drawHud(); }, isBlocked: () => busyAction || !foreground, isHudOpen: () => hudOpen,
    useSupply: (kind) => {
      const result = kind === 'drink' ? drinkWater(state) : eatMeal(state);
      flash(result.ok ? kind === 'drink' ? `饮水完成 · 水分 ${Math.floor(state.freshwater.hydration)}/100`
        : `吃下${result.label} · 饱腹 ${Math.floor(state.satiety)}/100；返家休息恢复体力`
        : result.reason === 'full' ? '当前水分或饱腹充足，暂时无需补充' : kind === 'drink' ? '水壶已空，请到泉眼岛装水' : '食物不足，可去椰林岛采集椰果');
      saveState(state);
    },
    onHome: () => {
      avatarTarget = null; avatarRoute = []; arrivalAction = null; marineMode = 'land';
      avatar.rotation.set(0, 0, 0); avatar.visible = true;
      avatar.position.set(DOCK_APPROACH.x, groundHeightAt(DOCK_APPROACH.x, DOCK_APPROACH.z) + .02, DOCK_APPROACH.z);
      updateCamera();
    },
  });
  walkGroundMeshes.push(...voyage.remoteGround);
  sandTracks = createSandTracks({ sampleSand: sampleTrackSand });
  sandTrackVisual = createSandTrackVisual(sandTracks);
  scene.add(sandTrackVisual.mesh);
  voyage.resume();
  createFarmBeds();
  onForegroundChange((visible) => {
    foreground = visible;
    previousFrameMs = 0;
    voyage?.releaseControls();
    if (!visible) saveState(state);
  });
  ensureStormSchedule();
  syncStorm();
  resize();
  setTimeout(resize, 120);
  drawHud();
  saveState(state);
  nextFrame(frame);
}

start().catch((error) => {
  console.error('Island assets failed to load', error);
  resize();
  flash('岛屿资源加载失败，请重新编译');
  nextFrame(frame);
});

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    if (event.target?.closest?.('input, textarea, dialog, [contenteditable="true"]')) return;
    if (voyage?.key(event, true)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (fishingSession) {
      if (event.repeat && !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const force = ({ 1: 'light', 2: 'steady', 3: 'strong' })[event.key];
      if (event.key === 'Escape') handleFishingAction('cancel');
      else if (event.key === ' ' || event.key === 'Enter') handleFishingAction('hook');
      else if (force) handleFishingAction(force);
      else if (event.key === 'ArrowLeft') handleFishingAction('force-down');
      else if (event.key === 'ArrowRight') handleFishingAction('force-up');
      else if (event.key.toLowerCase() === 'f') handleFishingAction('assist');
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    const pages = ['activity', 'voyage', 'farm', 'inventory', 'kitchen', 'trees', 'storm', 'logistics', 'orders'];
    const index = Number(event.key) - 1;
    if (event.key === 'Escape' && voyage?.mapOpen) { voyage.dismiss(); return; }
    if (event.key === 'Escape' && hudOpen) { hudOpen = false; drawHud(); return; }
    if (index >= 0 && index < (state.shopLevel >= 2 ? 9 : 8)) {
      handlePageAction(`tab-${pages[index]}`);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => voyage?.key(event, false));
  window.addEventListener('blur', () => voyage?.releaseControls());
}
