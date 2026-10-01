// Visual seconds only: swash never advances the survival clock or moves terrain.
// Positive distances are inland, negative distances are seaward of the coast.
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function swashCycle(time, phaseOffset = 0, storm = 0, tide = 0, limit = 3.2) {
  const period = 6.8 - Math.max(0, Math.min(1, storm)) * 1.8;
  const phase = ((time / period + phaseOffset) % 1 + 1) % 1;
  const advance = smooth(0, .32, phase), retreat = smooth(.38, 1, phase);
  const pulse = advance * (1 - retreat);
  const reach = Math.min(limit, 2.3 + storm * .9 + tide * .35);
  return { phase, period, pulse, retreat, front: -.65 + reach * pulse, maxFront: reach - .65 };
}

const fract = v => v - Math.floor(v);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function swashNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(0, 1, fract(x)), fy = smooth(0, 1, fract(y));
  const a = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx;
  const b = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
  return a * (1 - fy) + b * fy;
}

// CPU contact test uses the same world-space phase and ragged front as GLSL.
// Consumers count entering each wave, not every frame spent under water.
export function swashContact(x, z, inland, time, tide = 0, storm = 0, limit = 3.2) {
  const offset = .18 * Math.sin(x * .18 + z * .13) + .09 * Math.sin(z * .27 - x * .10);
  const cycle = swashCycle(time, offset, storm, tide, limit);
  const fringe = (swashNoise(x * 2.1 + time * .035, z * 2.1 - time * .02) - .5) * .18
    + Math.sin(x * 4.3 + z * 3.7) * .035;
  const front = cycle.front + fringe;
  const activity = smooth(0, .055, cycle.phase) * (1 - smooth(.90, 1, cycle.phase));
  return { front, phase: cycle.phase, waveId: Math.floor(time / cycle.period + offset),
    wet: activity > .15 && inland < front - .025 };
}

// Identical helper is inserted into ocean and terrain shaders so the leading
// foam edge cannot diverge at their seam. World-position phases wrap naturally
// around bays (unlike atan-based random segments with a +/-PI discontinuity).
export const COAST_SWASH_GLSL = `
  float swashHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float swashNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(swashHash(i),swashHash(i+vec2(1.,0.)),f.x),
      mix(swashHash(i+vec2(0.,1.)),swashHash(i+vec2(1.,1.)),f.x),f.y);
  }
  // x=water sheet, y=foam, z=receding wet sand, w=signed runup front.
  vec4 coastSwash(vec2 worldP,float inland,float time,float tide,float storm,float limit){
    float offset=.18*sin(worldP.x*.18+worldP.y*.13)
      +.09*sin(worldP.y*.27-worldP.x*.10);
    float phase=fract(time/(6.8-clamp(storm,0.,1.)*1.8)+offset);
    float advance=smoothstep(0.,.32,phase);
    float retreat=smoothstep(.38,1.,phase);
    float pulse=advance*(1.-retreat);
    float reach=min(limit,2.3+storm*.9+tide*.35);
    float fringe=(swashNoise(worldP*2.1+vec2(time*.035,-time*.02))-.5)*.18
      +sin(worldP.x*4.3+worldP.y*3.7)*.035;
    float front=-.65+reach*pulse+fringe;
    float distanceToFront=inland-front;
    float swashActivity=smoothstep(0.,.055,phase)*(1.-smoothstep(.90,1.,phase));
    float sheet=(1.-smoothstep(-.05,.12,distanceToFront))*swashActivity;
    float width=.11+storm*.065+.05*swashNoise(worldP*1.5);
    float lace=.48+.52*smoothstep(.20,.72,swashNoise(worldP*5.5-vec2(time*.09)));
    float brokenLip=smoothstep(.25,.63,swashNoise(worldP*.8+vec2(time*.025)));
    float foam=(1.-smoothstep(width,width+.12,abs(distanceToFront)))*lace*brokenLip;
    float bubbles=smoothstep(.57,.78,swashNoise(worldP*12.+time*.12))
      *(1.-smoothstep(.25,.7,abs(distanceToFront+.32)));
    foam=(foam+bubbles*.20)*swashActivity*(.95-retreat*.55);
    float wetTrail=(1.-smoothstep(reach-.65,reach-.25,inland))
      *smoothstep(.32,.43,phase)*(1.-smoothstep(.62,1.,phase));
    return vec4(sheet,clamp(foam,0.,1.),max(sheet,wetTrail),front);
  }
`;
