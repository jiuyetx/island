import { CROPS, SEAFOOD, usableCropSeed } from './economy.js';
import { DISHES } from './cooking.js';

export function plotGuidance(state, plot, preferredSeed = 'sweetPotato') {
  if (!plot?.crop) {
    const seed = usableCropSeed(state, preferredSeed);
    return { action: seed ? '播种' : '购买种子', status: '空田', detail: seed ? `${CROPS[seed].label}种子 ×${state.inventory[`${seed}Seed`]} · 点击播种` : '背包缺农田种子 · 在码头购入', ready: Boolean(seed) };
  }
  const spec = CROPS[plot.crop.id];
  const remaining = Math.max(0, Math.ceil(spec.minutes - plot.crop.growthMinutes));
  if (!remaining) return { action: '收获', status: `${spec.label} · 已成熟`, detail: '点击收获，作物装入背包', ready: true };
  const dry = state.gameMinutes >= plot.crop.wateredUntil;
  const paused = Math.max(0, Math.ceil((plot.pauseUntil || 0) - state.gameMinutes));
  return { action: dry ? '浇水' : '查看生长', status: `${spec.label} · ${Math.floor(plot.crop.growthMinutes / spec.minutes * 100)}%`,
    detail: dry ? `缺水暂停 · 浇水需 1 L 水 + 1 体力 · 还需生长 ${remaining} 游戏分钟`
      : paused ? `水分充足 · 受灾停长还剩 ${paused} 分钟 · 再生长 ${remaining} 分钟`
        : `水分充足 · 还需生长 ${remaining} 游戏分钟`, ready: dry };
}

export function nextPlayerAction(state) {
  if (state.satiety < 35) return { page: 'inventory', text: '先吃点食物 · 打开背包补充饱腹' };
  if (state.stamina < 20) return { page: 'activity', text: '先恢复体力 · 吃饱后进小屋休息' };
  const ready = state.plots?.find(p => p.crop && p.crop.growthMinutes >= CROPS[p.crop.id]?.minutes);
  if (ready) return { page: 'farm', plotId: ready.id, text: '收获成熟作物 · 装入背包，可烹饪或出售' };
  const dry = state.plots?.find(p => p.crop && p.crop.growthMinutes < CROPS[p.crop.id]?.minutes && state.gameMinutes >= p.crop.wateredUntil);
  if (dry) return { page: state.freshwater?.canteen > 0 ? 'farm' : 'water', plotId: dry.id, text: state.freshwater?.canteen > 0 ? '给缺水作物浇水 · 让作物继续生长' : '先装满水壶 · 缺水作物正在暂停生长' };
  if (state.plots?.some(p => !p.crop) && usableCropSeed(state)) return { page: 'farm', text: '在空田播种 · 使用背包里的农田种子' };
  return { page: 'voyage', text: '探索群岛 · 在海图查看船体和随身补给' };
}

export function voyageSupplies(state) {
  const food = Object.entries(state.inventory || {}).reduce((sum, [id, count]) => sum + ((CROPS[id] || SEAFOOD[id] || DISHES[id]) ? count : 0), 0);
  return { food, summary: `船体 ${Math.round(state.boatDurability)}/100 · 水壶 ${state.freshwater?.canteen || 0} L · 食物 ${food} 份`,
    advice: state.boatDurability <= 0 || state.boatTier === 'wreck' ? '船已损坏 · 先到维修仓储修船'
      : !food || !(state.freshwater?.canteen > 0) ? '建议先补齐背包食物和水壶，再出发'
        : `体力 ${Math.round(state.stamina)} · 饱腹 ${Math.round(state.satiety)} · 航行按正常时间进行` };
}
