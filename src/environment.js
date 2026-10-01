const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
export const wrap = (n, span) => ((n % span) + span) % span;

export function stormWeather(phase) {
  return phase === 'impact' ? { cloud: 1, rain: 1 }
    : phase === 'preparing' || phase === 'preparation' ? { cloud: .72, rain: .6 }
      : phase === 'warning' ? { cloud: .22, rain: 0 } : { cloud: 0, rain: 0 };
}

// Lighting alone: never changes the survival/game clock or saved weather.
export function environmentAt(hour, phase = 'calm', cloudOverride = null) {
  const h = wrap(Number.isFinite(hour) ? hour : 6, 24);
  const cloud = clamp(cloudOverride ?? stormWeather(phase).cloud);
  const solarAngle = (h - 6) / 12 * Math.PI;
  const elevation = Math.max(0, Math.sin(solarAngle));
  const sunlight = h > 6 && h < 18 ? elevation ** 1.1 : 0;
  const moonlight = clamp(1 - smooth(4.8, 6.5, h) + smooth(17.8, 19.2, h));
  const twilight = Math.max(0, 1 - Math.abs(h - 6) / 1.5, 1 - Math.abs(h - 18) / 1.5);
  const lunarAngle = wrap(h - 18, 24) / 12 * Math.PI;
  return { hour: h, cloud, sunlight, moonlight, twilight,
    sunIntensity: sunlight * 3.8 * (1 - cloud * .78),
    moonIntensity: moonlight * .46 * (1 - cloud * .94),
    ambientIntensity: sunlight * 1.65 * (1 - cloud * .62) + moonlight * .055 * (1 - cloud * .94),
    waterLight: sunlight * (1 - cloud * .78) + moonlight * .085 * (1 - cloud * .94),
    fogDensity: .005 + cloud * .018,
    sunPosition: { x: Math.cos(solarAngle) * 28, y: 1 + elevation * 30, z: -13 },
    moonPosition: { x: Math.cos(lunarAngle) * -26, y: 9 + Math.max(0, Math.sin(lunarAngle)) * 25, z: 18 },
  };
}

export function rainSeed(index) {
  const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
  return { x: (hash(index + 3) - .5) * 64, z: (hash(index + 71) - .5) * 64,
    y: hash(index + 139) * 32, speed: .8 + hash(index + 227) * .4 };
}

// Wrap inside a camera-following volume. The old unbounded time*x drift
// moved every drop out of view after the app had been running a while.
export function rainDrop(seed, time, strength, focus = { x: 0, z: 0 }) {
  const speed = (17 + strength * 11) * seed.speed;
  const cycle = wrap(time * speed + seed.y, 32);
  const gust = .7 + .3 * Math.sin(time * .8);
  const dx = .5 + strength * .8 * gust, dz = .25 + strength * .4;
  return { x: focus.x + wrap(seed.x + time * (2 + strength * 4) + 32, 64) - 32,
    y: 31 - cycle, z: focus.z + wrap(seed.z + time * (1 + strength * 2) + 32, 64) - 32,
    dx, dy: .65 + strength * .7, dz };
}
