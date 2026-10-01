import COASTLINE from '../assets/coastline.json' with { type: 'json' };

export function coastlineRadius(angle) {
  return coastlineBandRadius(angle, COASTLINE.shoreRadius);
}

export function coastlineBandRadius(angle, radius) {
  const harmonics = COASTLINE.radialHarmonics.reduce((sum, wave) =>
    sum + wave.amplitude * Math.sin(angle * wave.frequency + wave.phase), 0);
  const features = COASTLINE.shoreFeatures.reduce((sum, feature) => {
    const delta = Math.atan2(Math.sin(angle - feature.angle), Math.cos(angle - feature.angle));
    return sum + feature.offset * Math.exp(-.5 * (delta / feature.width) ** 2);
  }, 0);
  const weight = Math.max(0, Math.min(1, (radius - 8.5) / 6.2));
  const crossSlope = (radius - COASTLINE.shoreRadius) * (.15 * Math.sin(angle * 2 + .45)
    + .09 * Math.sin(angle * 5 - 1.1) + .05 * Math.sin(angle * 11 + .8));
  return radius * (1 + harmonics) + crossSlope + features * weight;
}

// The water and beach shaders share exactly the same shoreline as navigation
// and the Blender export, including wrapped, localized coves and sand spits.
export function coastlineShaderRadius(angle = 'ang') {
  const number = value => Number(value).toFixed(6);
  const harmonics = COASTLINE.radialHarmonics.map(wave =>
    `${number(wave.amplitude)}*sin(${angle}*${number(wave.frequency)}+${number(wave.phase)})`).join('+');
  const features = COASTLINE.shoreFeatures.map(feature => {
    const delta = `atan(sin(${angle}-(${number(feature.angle)})),cos(${angle}-(${number(feature.angle)})))`;
    return `(${number(feature.offset)})*exp(-0.5*pow(${delta}/${number(feature.width)},2.0))`;
  }).join('+');
  return `${number(COASTLINE.shoreRadius)}*(1.0+${harmonics})+${features}`;
}

export function islandCoastlineShaderRadius(radius, angle, phaseX, phaseZ) {
  return `(${radius})*(.955+.025*sin((${angle})*3.+(${phaseX}))+.015*sin((${angle})*5.+(${phaseZ})))`;
}
