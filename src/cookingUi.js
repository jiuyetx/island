import { RECIPES, recipeQuote, edibleDishCount } from './cooking.js';
export const COOKING_MOBILE_HEIGHT = 1240;

function box(ctx, x, y, w, h, fill, stroke = null) {
  ctx.fillStyle = fill; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(16, h / 2));
  else ctx.rect(x, y, w, h);
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function oval(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
export function drawDishIcon(ctx, dish, x, y, size) {
  box(ctx, x, y, size, size, '#496d64', '#a4c7a0');
  ctx.save(); ctx.translate(x + size / 2, y + size / 2); ctx.scale(size / 80, size / 80);
  oval(ctx, 0, 17, 30, 12, '#253f39');
  const soup = ['soup', 'crab', 'lobster'].includes(dish.style);
  oval(ctx, 0, 9, 30, 20, '#dfded0'); oval(ctx, 0, soup ? -1 : 5, 27, 15, '#fff1ce');
  if (soup) {
    oval(ctx, 0, 1, 24, 11, dish.style === 'soup' ? '#d6a349' : '#c27b3f');
    for (let i = 0; i < 5; i++) oval(ctx, -16 + i * 8, (i % 2) * 7 - 3, 4, 3, i % 2 ? '#69a06a' : '#efd27a');
    ctx.strokeStyle = '#bbd6c0'; ctx.lineWidth = 2;
    for (const sx of [-10, 2, 14]) { ctx.beginPath(); ctx.moveTo(sx, -13); ctx.quadraticCurveTo(sx - 5, -22, sx + 2, -29); ctx.stroke(); }
    if (dish.style !== 'soup') {
      oval(ctx, 0, -6, dish.style === 'lobster' ? 6 : 10, 6, '#ea8653');
      oval(ctx, -13, -9, 5, 4, '#f89960'); oval(ctx, 13, -9, 5, 4, '#f89960');
    }
  } else if (dish.style === 'roast') {
    oval(ctx, -7, 0, 17, 9, '#ad6b54'); oval(ctx, 10, 5, 14, 8, '#a4544a'); oval(ctx, 9, 3, 9, 5, '#f3c466');
  } else if (dish.style === 'corn') {
    oval(ctx, 0, 1, 23, 9, '#e9ad39');
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) oval(ctx, -17 + i * 7, -4 + j * 5, 2.2, 1.6, '#ffe27e');
    oval(ctx, -25, 3, 7, 4, '#76a457');
  } else if (dish.style === 'salad') {
    for (let i = 0; i < 7; i++) oval(ctx, Math.cos(i * 2.2) * 17, Math.sin(i * 2.2) * 8, 9, 5, '#70a75b');
    for (const sx of [-13, 2, 15]) oval(ctx, sx, sx % 3, 5, 4, sx === 2 ? '#f2cb5e' : '#e16d50');
  } else {
    oval(ctx, 0, 1, 21, 8, '#b9c5ad');
    ctx.fillStyle = '#86a89b'; ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(-28, -7); ctx.lineTo(-28, 8); ctx.fill();
    oval(ctx, 13, -1, 2, 2, '#324b45');
    ctx.strokeStyle = '#947847'; ctx.lineWidth = 2;
    for (const sx of [-10, -1, 8]) { ctx.beginPath(); ctx.moveTo(sx, -4); ctx.lineTo(sx + 3, 4); ctx.stroke(); }
    oval(ctx, 17, 12, 5, 4, '#f1d57b'); oval(ctx, -11, 12, 9, 3, '#75a557');
    if (dish.style === 'platter') oval(ctx, 1, 13, 6, 4, '#df6952');
  }
  ctx.restore();
}

export function drawCookingPanel(ctx, state, { selectedId, narrow, offset, progress = null, labels, page = 0 }) {
  const buttons = [];
  const button = (id, title, x, y, w, h, enabled = true) => {
    box(ctx, x, y, w, h, enabled ? '#b1833f' : '#385e59', '#9abbaa');
    ctx.fillStyle = enabled ? '#fff4d6' : '#b4c6ba'; ctx.font = `700 ${narrow ? 36 : 25}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + h / 2 + 9, w - 18); ctx.textAlign = 'start';
    buttons.push({ id, x, y: y + offset, width: w, height: h });
  };
  if (narrow) {
    ctx.fillStyle = '#d4d9b8'; ctx.font = '32px sans-serif'; ctx.fillText(`菜谱 ${page + 1}/2 · 点击查看详情`, 38, 212, 465);
    button('kitchen-prev', '上一页', 520, 142, 229, 121);
    button('kitchen-next', '下一页', 765, 142, 229, 121);
  }
  const cols = narrow ? 2 : 4, w = narrow ? 474 : 229, h = narrow ? 180 : 113;
  const entries = Object.entries(RECIPES);
  (narrow ? entries.slice(page * 4, page * 4 + 4) : entries).forEach(([id, recipe], index) => {
    const quote = recipeQuote(state, id);
    const x = 30 + index % cols * (w + 16), y = (narrow ? 278 : 142) + Math.floor(index / cols) * (h + (narrow ? 16 : 12));
    box(ctx, x, y, w, h, id === selectedId ? '#6e7950' : '#204f4d', id === selectedId ? '#efd795' : '#548078');
    drawDishIcon(ctx, recipe, x + 12, y + (narrow ? 30 : 13), narrow ? 112 : 58);
    ctx.fillStyle = '#fff2d3'; ctx.font = `700 ${narrow ? 36 : 22}px sans-serif`;
    const tx = x + (narrow ? 142 : 80);
    ctx.fillText(recipe.name, tx, y + (narrow ? 56 : 37), w - (tx - x) - 10);
    ctx.fillStyle = quote.level ? '#cce2ab' : '#dcc78f'; ctx.font = `${narrow ? 32 : 19}px sans-serif`;
    ctx.fillText(quote.level ? `Lv.${quote.level} · 饱腹 +${quote.satiety}` : `未学会 · ${recipe.price} 金`, tx, y + (narrow ? 100 : 66), w - (tx - x) - 10);
    ctx.fillText(quote.level ? `已制作 ${quote.cooked} 次` : '选择查看食材', tx, y + (narrow ? 142 : 92), w - (tx - x) - 10);
    buttons.push({ id: `kitchen-select:${id}`, x, y: y + offset, width: w, height: h });
  });
  const quote = recipeQuote(state, selectedId), dy = narrow ? 677 : 403;
  box(ctx, 30, dy, 964, narrow ? 250 : 158, '#174643', '#668b76');
  ctx.fillStyle = '#fff2d3'; ctx.font = `700 ${narrow ? 37 : 29}px sans-serif`;
  ctx.fillText(`${quote.recipe.name} · ${quote.level ? `Lv.${quote.level}` : '待解锁'} · 饱腹 +${quote.satiety}`, 48, dy + (narrow ? 48 : 35), 925);
  ctx.font = `${narrow ? 35 : 24}px sans-serif`; ctx.fillStyle = quote.ok ? '#c6e0b1' : '#edc5a0';
  const ingredients = quote.ingredients.map(({ itemId, quantity, owned }) => `${labels[itemId]} ${owned}/${quantity}`).join('  ·  ');
  ctx.fillText(`背包食材：${ingredients}`, 48, dy + (narrow ? 98 : 70), 925);
  ctx.fillStyle = '#c5dcbd'; ctx.font = `${narrow ? 33 : 22}px sans-serif`;
  ctx.fillText(quote.level === 3 ? '已达满级 · 升级不会改变已做好的料理'
    : quote.level ? `升级至 Lv.${quote.level + 1}：饱腹 +${quote.nextSatiety} · 制作 ${quote.cooked}/${quote.requiredCooks} 次 + ${quote.upgradeCost} 金`
      : `花 ${quote.recipe.price} 金永久学会 · 食材需自行种植或捕获`, 48, dy + (narrow ? 151 : 103), 925);
  if (progress != null) {
    box(ctx, 48, dy + (narrow ? 195 : 119), 916, 17, '#315f54'); box(ctx, 48, dy + (narrow ? 195 : 119), Math.max(4, 916 * progress), 17, '#d5bf75');
  } else {
    ctx.fillText('每次制作 1 份，装入背包；食用后休息才恢复体力', 48, dy + (narrow ? 204 : 136), 925);
  }
  const ay = narrow ? 945 : 578, ah = narrow ? 121 : 67;
  button('kitchen-cook', progress != null ? '正在烹饪…' : quote.ok ? '制作 1 份' : quote.reason === 'locked' ? '先学会菜谱' : quote.reason === 'capacity' ? '背包空间不足' : '食材不足', 30, ay, 474, ah, quote.ok && progress == null);
  button(quote.level ? 'kitchen-upgrade' : 'kitchen-learn', !quote.level ? `学习 · ${quote.recipe.price} 金` : quote.level === 3 ? '菜谱已满级' : `升级 · ${quote.upgradeCost} 金`, 520, ay, 474, ah,
    progress == null && (!quote.level ? state.gold >= quote.recipe.price : quote.level < 3 && quote.cooked >= quote.requiredCooks && state.gold >= quote.upgradeCost));
  const meals = edibleDishCount(state) + (state.food || 0);
  button('kitchen-eat', `食用 1 份 · 存有 ${meals} 份 · 饱腹 ${Math.floor(state.satiety)}/100`, 30, narrow ? 1083 : 658, 964, narrow ? 121 : 63, progress == null && meals > 0);
  return buttons;
}
