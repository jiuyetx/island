export const MAX_SAVE_BYTES = 256 * 1024;

export function validateSave(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || value.schemaVersion !== 2) {
    throw new Error('存档格式或版本不支持');
  }
  for (const [key, min, max] of [['gameMinutes', 360, 1e10], ['stamina', 0, 100], ['gold', 0, 1e12]]) {
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error('存档数值无效');
  }
  if (!value.inventory || Array.isArray(value.inventory) || typeof value.inventory !== 'object'
    || !Array.isArray(value.plots) || !Array.isArray(value.trees)) throw new Error('存档内容不完整');
  const visit = (item, depth = 0) => {
    if (depth > 32) throw new Error('存档结构过深');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('存档数值无效');
    if (item && typeof item === 'object') {
      for (const [key, nested] of Object.entries(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('存档字段无效');
        visit(nested, depth + 1);
      }
    }
  };
  visit(value);
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_SAVE_BYTES) throw new Error('存档文件过大');
  return value;
}

export function summarizeSave(state) {
  const minutes = state.gameMinutes;
  const hour = Math.floor((minutes % 1440) / 60);
  const minute = Math.floor(minutes % 60);
  return {
    day: Math.floor((minutes - 360) / 1440) + 1,
    clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    gold: state.gold, stamina: Math.floor(state.stamina),
  };
}
