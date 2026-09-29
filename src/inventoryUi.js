import { CROPS, SEAFOOD, SHOP, repairQuote } from './economy.js';

const STOCK_NAMES = {
  diveSupply: '潜水耗材', windNet: '防风网', drainage: '排水渠', anchor: '加固锚绳',
  waterproofCabinet: '防水柜', waveBarrier: '消浪护栏', windowReinforcement: '门窗加固件',
  raisedBed: '高畦建材', palmSeed: '椰树种子', legacyFish: '旧鱼获', wood: '木材', shells: '贝壳', food: '食物',
};
const DEFENSE_NAMES = {
  windNet: '已安装防风网', drainage: '已建排水渠', anchor: '已安装锚绳',
  waterproofCabinet: '已安装防水柜', waveBarrier: '已安装消浪护栏', shutters: '已加固门窗',
};
const DEFENSE_COSTS = { ...SHOP, shutters: SHOP.windowReinforcement };
export const INSTALLABLE_STOCK = {
  windNet: { place: '田地', use: '给最多 6 块未防护田地架网，减轻台风作物损失' },
  drainage: { place: '田地', use: '给最多 6 块田地挖渠，减轻潮害和台风积水' },
  anchor: { place: '码头', use: '固定回港船只，减轻台风造成的船体损伤' },
  waterproofCabinet: { place: '小屋', use: '保护仓库货物，减少台风期间的库存损失' },
  waveBarrier: { place: '近岸浅海', use: '点击海中黄色安装浮标，从安全岸边施工；降低台风期间的码头损伤' },
  windowReinforcement: { place: '小屋', use: '加固门窗，降低台风期间的小屋损伤' },
  raisedBed: { place: '田地', use: '把一块低地田改为高畦，减轻日常高潮影响' },
};

export function inventoryAction(itemId, mode) {
  if (mode === 'storage') return { label: '从仓库取回 1 件，再到对应地点使用', id: `inventory-retrieve:${itemId}` };
  if (mode !== 'bag') return null;
  if (INSTALLABLE_STOCK[itemId]) return { label: `前往${INSTALLABLE_STOCK[itemId].place}安装${STOCK_NAMES[itemId]}`, id: `inventory-use:${itemId}` };
  if (itemId === 'palmSeed') return { label: '前往空树位种植椰树', id: `inventory-use:${itemId}` };
  if (itemId.endsWith('Seed') && CROPS[itemId.slice(0, -4)]) return { label: '前往空田播种', id: `inventory-use:${itemId}` };
  if (itemId === 'wood') return { label: '查看木材抢修选项', id: 'inventory-use:wood' };
  if (itemId === 'diveSupply') return { label: '查看出海与潜水', id: 'inventory-use:diveSupply' };
  if (CROPS[itemId] || SEAFOOD[itemId]) return { label: '食用 · 补充饱腹（出售请到交易站）', id: `inventory-use:${itemId}` };
  if (itemId === 'legacyFish') return { label: '前往码头售出', id: `inventory-use:${itemId}` };
  return null;
}

function box(ctx, x, y, w, h, r, fill, stroke = null) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function itemFromStock(id, quantity, state) {
  const crop = CROPS[id];
  const seafood = SEAFOOD[id];
  const seedCrop = id.endsWith('Seed') ? CROPS[id.slice(0, -4)] : null;
  const treeSeed = id === 'palmSeed';
  const sellPrice = crop?.price ?? seafood?.price ?? null;
  const legacyValue = id === 'legacyFish' ? Math.max(0, Number(state.legacyFishValue) || 0) : null;
  const purchasePrice = seedCrop?.seedPrice ?? SHOP[id] ?? null;
  const name = crop?.label ?? seafood?.label ?? (seedCrop ? `${seedCrop.label}种子` : STOCK_NAMES[id] ?? id);
  const kind = seafood ? 'seafood' : crop ? 'crop' : seedCrop || treeSeed ? 'seed' : 'material';
  return {
    id, name, quantity, kind, icon: seedCrop ? id.slice(0, -4) : id,
    summary: INSTALLABLE_STOCK[id] ? `待安装 · 去${INSTALLABLE_STOCK[id].place}`
      : id === 'diveSupply' ? '潜水时自动消耗' : id === 'wood' ? '建材 · 风灾后可应急抢修'
        : legacyValue != null ? `可售 · 合计 ${legacyValue} 金` : sellPrice != null ? `可售 · ${sellPrice} 金/件` : purchasePrice != null ? `购入 · ${purchasePrice} 金/件` : '岛上采集资源',
    detail: INSTALLABLE_STOCK[id] ? `${INSTALLABLE_STOCK[id].place}安装 · ${INSTALLABLE_STOCK[id].use}`
      : id === 'diveSupply' ? '捕捞深海海产时自动消耗，无需手动装备'
      : id === 'wood' ? '维修仓储中抢修船、码头或小屋：每 1 木修 10 耐久，最多修到 40'
      : treeSeed ? `林木专用 · 可种椰树（购入 ${purchasePrice} 金/件）`
      : seedCrop ? `农田专用 · 不能种椰树（购入 ${purchasePrice} 金/件）`
      : legacyValue != null ? `预计出售 ${legacyValue} 金（旧版汇总鱼获）`
      : sellPrice != null ? `可食用补充饱腹，也可到交易站出售 ${sellPrice * quantity} 金（${sellPrice} 金/件）`
      : purchasePrice != null ? `购入参考 ${purchasePrice * quantity} 金（${purchasePrice} 金/件）`
        : id === 'shells' ? '旧建筑建材 · 基础建筑已建成，目前不能消耗或出售'
        : id === 'food' ? '储备食物 · 可在出海页“准备一餐”中食用' : '当前没有使用方式或售出价',
    status: `当前拥有 ${quantity} 件`,
  };
}

function equippedRows(state) {
  const gearUse = {
    boat: '已装备 · 出海捕远洋鱼时自动搭乘', rod: '已装备 · 出海选择鱼类后自动使用',
    shovel: '已装备 · 在农田播种时自动使用', dive: '已装备 · 下潜时自动使用',
    net: '出海页点击“高级渔网”捕珊瑚鱼或银鲹', lamp: '夜间自动照明',
    dock: '走近交易站购买和出售', hut: '回小屋休息和使用仓库',
  };
  const boatLevel = ({ wood: 1, iron: 2, speed: 3, wreck: 1 })[state.boatTier] || 1;
  const boatName = ({ wood: '木船', iron: '小铁船', speed: '快艇', wreck: '受损木船' })[state.boatTier] || '木船';
  const rows = [
    { id: 'boat', name: boatName, icon: 'boat', kind: 'gear', level: boatLevel, durability: state.boatDurability, price: boatLevel === 3 ? SHOP.ironBoat + SHOP.speedBoat : boatLevel === 2 ? SHOP.ironBoat : 0, note: '出海载具' },
    { id: 'rod', name: '鱼竿', icon: 'rod', kind: 'gear', level: state.rodLevel, price: state.rodLevel === 3 ? SHOP.rod2 + SHOP.rod3 : state.rodLevel === 2 ? SHOP.rod2 : 0, note: '海钓工具' },
    { id: 'shovel', name: '铁锹', icon: 'shovel', kind: 'gear', level: state.shovelLevel, price: state.shovelLevel === 3 ? SHOP.shovel2 + SHOP.shovel3 : state.shovelLevel === 2 ? SHOP.shovel2 : 0, note: '农田工具' },
    { id: 'dock', name: '码头', icon: 'dock', kind: 'gear', level: state.dockLevel, durability: state.dockDurability, price: state.dockLevel === 2 ? SHOP.dock2 : 0, note: '海岸建筑' },
    { id: 'hut', name: '小屋', icon: 'hut', kind: 'gear', level: state.hutLevel, durability: state.hutDurability, price: state.hutLevel === 2 ? SHOP.hut2 : 0, note: '居住建筑' },
  ];
  if (state.diveLevel > 0) rows.push({ id: 'dive', name: '潜水服', icon: 'dive', kind: 'gear', level: state.diveLevel, price: state.diveLevel === 2 ? SHOP.dive1 + SHOP.dive2 : SHOP.dive1, note: `氧气 ${Math.floor(state.oxygen || 0)}` });
  if (state.hasNet) rows.push({ id: 'net', name: '高级渔网', icon: 'net', kind: 'gear', level: 1, price: SHOP.net, note: `今日已用 ${state.netUsesDay || 0}/3 次` });
  if (state.hasLamp) rows.push({ id: 'lamp', name: '手提灯', icon: 'lamp', kind: 'gear', level: 1, price: SHOP.lamp, note: '夜间照明' });
  if (state.backpackCapacity > 20) rows.push({ id: 'backpack', name: '扩容背包', icon: 'backpack', kind: 'gear', level: 2, price: SHOP.backpack, note: `容量 ${state.backpackCapacity} 件` });
  if (state.storageCapacity > 40) rows.push({ id: 'warehouse', name: '扩容仓库', icon: 'warehouse', kind: 'gear', level: 2, price: SHOP.warehouse, note: `容量 ${state.storageCapacity} 件` });
  if (state.shopLevel > 1) rows.push({ id: 'shop', name: '无线电商店', icon: 'shop', kind: 'gear', level: state.shopLevel, price: SHOP.shop2 + (state.shopLevel > 2 ? SHOP.shop3 : 0), note: '交易设施' });
  const defenses = state.defenses || {};
  for (const id of Object.keys(DEFENSE_NAMES)) {
    const installed = id === 'windNet' || id === 'drainage'
      ? (defenses.plots || []).map((plot) => plot[id]).filter((value) => value === true || Number(value) > 0)
      : [defenses[id]].filter((value) => value === true || Number(value) > 0);
    if (!installed.length) continue;
    const condition = installed.map((value) => value === true ? 100 : Number(value));
    rows.push({ id: `defense-${id}`, name: DEFENSE_NAMES[id], icon: id, kind: 'gear', quantity: installed.length,
      durability: Math.round(condition.reduce((sum, value) => sum + value, 0) / condition.length),
      price: (DEFENSE_COSTS[id] || 0) * installed.length, note: `已安装 ${installed.length} 处`, level: 1 });
  }
  return rows.map((row) => {
    const repair = ['boat', 'dock', 'hut'].includes(row.id) && row.durability < 100 ? repairQuote(state, row.id) : null;
    return {
      ...row,
      quantity: row.quantity || 1,
      summary: row.durability == null ? `Lv.${row.level} · ${row.note}` : `Lv.${row.level} · 耐久 ${row.durability}/100`,
      detail: repair?.ok ? `可维修 · 需 ${repair.cost} 金（维修仓储）`
        : gearUse[row.id] ? gearUse[row.id]
        : row.durability === 100 ? '状态完好 · 无需维修'
          : row.price ? `购入参考 ${row.price} 金 · 不可直接出售` : '初始拥有 · 不可直接出售',
      status: row.durability == null ? `等级 Lv.${row.level} · ${row.note}` : `等级 Lv.${row.level} · 耐久 ${row.durability}/100`,
    };
  });
}

export function getInventoryRows(state, mode) {
  if (mode === 'gear') return equippedRows(state);
  const bag = mode === 'storage' ? state.storage || {} : state.inventory || {};
  const entries = Object.entries(bag).filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0);
  if (mode === 'bag') for (const id of ['wood', 'shells', 'food']) {
    if (Number.isFinite(state[id]) && state[id] > 0) entries.push([id, state[id]]);
  }
  return entries.map(([id, quantity]) => itemFromStock(id, quantity, state));
}

export function drawIcon(ctx, item, x, y, size) {
  const icon = item.icon;
  const sea = item.kind === 'seafood';
  const crop = item.kind === 'crop' || item.kind === 'seed';
  box(ctx, x, y, size, size, Math.max(10, size * .18), sea ? '#2c777c' : crop ? '#877646' : '#476c68', '#c6d8ac');
  ctx.save(); ctx.translate(x + size / 2, y + size / 2); const s = size / 72; ctx.scale(s, s);
  if (item.kind === 'seed') {
    box(ctx, -19, -20, 38, 42, 6, '#ead5a0', '#89653b');
    ctx.fillStyle = '#a28253'; ctx.fillRect(-17, -19, 34, 7);
    circle(ctx, 0, 3, 9, icon === 'tomato' ? '#d9523b' : icon === 'corn' ? '#eac050' : icon === 'pineapple' ? '#d9a84a' : '#b3763b');
    ctx.strokeStyle = '#426b39'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, -11); ctx.stroke();
  } else if (icon === 'crab') {
    ctx.strokeStyle = '#f8c27e'; ctx.lineWidth = 3;
    for (let side of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(side * 13, -4 + i * 6); ctx.lineTo(side * (27 + i * 2), -12 + i * 12); ctx.stroke(); }
    circle(ctx, 0, 3, 16, '#e9835c'); circle(ctx, -8, -15, 3, '#fff0ce'); circle(ctx, 8, -15, 3, '#fff0ce');
  } else if (sea && icon !== 'pearlOyster' && icon !== 'lobster') {
    ctx.fillStyle = icon === 'silverJack' ? '#c8e2de' : '#e9aa55';
    ctx.beginPath(); ctx.ellipse(-3, 0, 23, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(29, -12); ctx.lineTo(29, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = icon === 'silverJack' ? '#5f8f95' : '#7c9c66'; ctx.lineWidth = 3;
    for (let i = -11; i < 13; i += 10) { ctx.beginPath(); ctx.moveTo(i, -9); ctx.lineTo(i + 5, 9); ctx.stroke(); }
    circle(ctx, -17, -2, 2.5, '#162f35');
  } else if (icon === 'lobster') {
    ctx.fillStyle = '#e5754a'; ctx.beginPath(); ctx.ellipse(0, 2, 13, 23, 0, 0, Math.PI * 2); ctx.fill();
    circle(ctx, -19, -14, 8, '#ec9364'); circle(ctx, 19, -14, 8, '#ec9364');
    ctx.strokeStyle = '#f5b47e'; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-9, i * 10); ctx.lineTo(-24, i * 12 + 3); ctx.moveTo(9, i * 10); ctx.lineTo(24, i * 12 + 3); ctx.stroke(); }
  } else if (icon === 'pearlOyster' || icon === 'shells') {
    ctx.fillStyle = '#f3d6c1'; ctx.beginPath(); ctx.moveTo(-25, 16); ctx.quadraticCurveTo(-22, -19, 0, -24); ctx.quadraticCurveTo(22, -19, 25, 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#bb9a92'; ctx.lineWidth = 2;
    for (let i = -12; i <= 12; i += 12) { ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(i, -14); ctx.stroke(); }
    circle(ctx, 0, 4, 6, '#fff8ed');
  } else if (crop) {
    const colors = { sweetPotato: '#b77c61', tomato: '#db6044', corn: '#e5c25c', pineapple: '#d9a755', pumpkin: '#d68742' };
    const color = colors[icon] || '#deb45e';
    if (icon === 'corn' || icon === 'pineapple') {
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 3, 14, 21, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8f7c3e'; ctx.lineWidth = 2;
      for (let i = -9; i <= 9; i += 9) { ctx.beginPath(); ctx.moveTo(i, -12); ctx.lineTo(i, 18); ctx.stroke(); }
    } else { circle(ctx, 0, 4, icon === 'pumpkin' ? 22 : 18, color); }
    ctx.fillStyle = '#5c913d'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-13, -26); ctx.lineTo(1, -23); ctx.lineTo(12, -27); ctx.lineTo(4, -12); ctx.fill();
  } else if (icon === 'boat' || icon === 'dock') {
    ctx.fillStyle = '#b37b45'; ctx.beginPath(); ctx.moveTo(-28, 3); ctx.lineTo(27, 3); ctx.lineTo(19, 19); ctx.lineTo(-19, 19); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e4c486'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(16, 0); ctx.stroke();
    if (icon === 'boat') { ctx.strokeStyle = '#e8e1c3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1, -25); ctx.lineTo(1, 2); ctx.stroke(); ctx.fillStyle = '#f0ead6'; ctx.beginPath(); ctx.moveTo(3, -24); ctx.lineTo(20, -4); ctx.lineTo(3, -4); ctx.fill(); }
  } else if (icon === 'rod' || icon === 'shovel') {
    ctx.strokeStyle = '#d8bc85'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-18, 25); ctx.lineTo(15, -23); ctx.stroke();
    if (icon === 'rod') { ctx.strokeStyle = '#d9e3d5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(15, -23); ctx.quadraticCurveTo(31, -11, 23, 16); ctx.stroke(); circle(ctx, 22, 17, 3, '#edd884'); }
    else { ctx.fillStyle = '#aebcc0'; ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(22, -30); ctx.lineTo(29, -24); ctx.lineTo(21, -14); ctx.closePath(); ctx.fill(); }
  } else if (icon === 'hut' || icon === 'warehouse' || icon === 'shop') {
    box(ctx, -19, -4, 38, 30, 2, '#e8d8ae'); ctx.fillStyle = '#a8583d'; ctx.beginPath(); ctx.moveTo(-25, -5); ctx.lineTo(0, -26); ctx.lineTo(25, -5); ctx.closePath(); ctx.fill(); box(ctx, -5, 7, 10, 19, 1, '#8c5d3f');
  } else if (icon === 'backpack' || icon === 'dive') {
    box(ctx, -18, -16, 36, 42, 9, icon === 'dive' ? '#7ca6a4' : '#bd8151', '#e5cf9b');
    box(ctx, -11, 1, 22, 18, 4, icon === 'dive' ? '#365b69' : '#8a583b');
    ctx.strokeStyle = '#f1d5a0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -15, 9, Math.PI, Math.PI * 2); ctx.stroke();
  } else if (icon === 'net' || icon === 'windNet' || icon === 'drainage') {
    ctx.strokeStyle = '#d4debb'; ctx.lineWidth = 3;
    for (let i = -22; i <= 22; i += 11) { ctx.beginPath(); ctx.moveTo(i, -20); ctx.lineTo(i, 20); ctx.moveTo(-22, i); ctx.lineTo(22, i); ctx.stroke(); }
  } else if (icon === 'wood') {
    box(ctx, -24, -15, 45, 12, 5, '#a87248'); box(ctx, -17, 1, 45, 12, 5, '#c18a55');
    circle(ctx, -17, -9, 4, '#d1a472'); circle(ctx, -10, 7, 4, '#d8a774');
  } else if (icon === 'anchor') {
    ctx.strokeStyle = '#d5e4df'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -20, 5, 0, Math.PI * 2); ctx.moveTo(0, -15); ctx.lineTo(0, 21);
    ctx.moveTo(-21, 8); ctx.quadraticCurveTo(-18, 27, 0, 23); ctx.quadraticCurveTo(18, 27, 21, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-24, 12); ctx.lineTo(-17, 7); ctx.moveTo(24, 12); ctx.lineTo(17, 7); ctx.stroke();
  } else if (icon === 'waveBarrier') {
    ctx.strokeStyle = '#d6c596'; ctx.lineWidth = 6;
    for (let i = -20; i <= 20; i += 20) { ctx.beginPath(); ctx.moveTo(i, -17); ctx.lineTo(i, 18); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-25, -7); ctx.lineTo(25, -7); ctx.moveTo(-25, 10); ctx.lineTo(25, 10); ctx.stroke();
    ctx.strokeStyle = '#a9dcd3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 29, 19, Math.PI, Math.PI * 2); ctx.stroke();
  } else if (icon === 'waterproofCabinet') {
    box(ctx, -22, -26, 44, 52, 3, '#cfaa72', '#f6e3ba');
    box(ctx, -16, -19, 32, 39, 2, '#8e7658', '#e8d1a5'); circle(ctx, 9, 1, 3, '#f5df9e');
  } else if (icon === 'windowReinforcement') {
    box(ctx, -25, -25, 50, 50, 3, '#d9bd86', '#f3deb0');
    box(ctx, -17, -18, 34, 36, 2, '#6dabb4');
    ctx.strokeStyle = '#8c603d'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, 23); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.stroke();
  } else if (icon === 'raisedBed' || icon === 'lowPlot' || icon === 'highPlot') {
    ctx.fillStyle = '#7b4d2d'; ctx.beginPath(); ctx.ellipse(0, 13, 27, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#76b650'; ctx.lineWidth = 5;
    for (const px of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(px, 8); ctx.lineTo(px, -18); ctx.moveTo(px, -11); ctx.lineTo(px - 7, -17); ctx.moveTo(px, -8); ctx.lineTo(px + 7, -15); ctx.stroke(); }
  } else if (icon === 'lamp') {
    box(ctx, -15, -13, 30, 37, 5, '#e9c35d', '#fbe2a4');
    ctx.strokeStyle = '#d9e0c5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -12, 13, Math.PI, Math.PI * 2); ctx.stroke();
    circle(ctx, 0, 5, 7, '#fff2af');
  } else {
    box(ctx, -17, -17, 34, 34, 7, '#e5bf76');
    ctx.strokeStyle = '#8b663e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(10, -3); ctx.moveTo(-10, 7); ctx.lineTo(10, 7); ctx.stroke();
  }
  ctx.restore();
}

export function drawInventoryPanel(ctx, state, { mode, page, selectedId, narrow, offset }) {
  const buttons = [];
  const modes = [['bag', '随身背包'], ['storage', '仓库'], ['gear', '已拥有装备']];
  modes.forEach(([id, title], index) => {
    const x = 30 + index * 325;
    box(ctx, x, 125, 315, 55, 14, mode === id ? '#b6853b' : '#286968', '#b5d4ae');
    ctx.fillStyle = '#fff6d9'; ctx.font = `700 ${narrow ? 31 : 26}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(title, x + 157, 161);
    buttons.push({ id: `inventory-mode:${id}`, x, y: 125 + offset, width: 315, height: 55 });
  });
  const rows = getInventoryRows(state, mode);
  const perPage = narrow ? 4 : 6;
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const used = mode === 'bag' ? Object.values(state.inventory || {}).reduce((sum, n) => sum + (Number(n) || 0), 0)
    : mode === 'storage' ? Object.values(state.storage || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) : rows.length;
  const capacity = mode === 'bag' ? state.backpackCapacity : mode === 'storage' ? state.storageCapacity + (state.hutLevel > 1 ? 20 : 0) : null;
  ctx.fillStyle = '#cae9da'; ctx.textAlign = 'start'; ctx.font = `${narrow ? 29 : 22}px sans-serif`;
  const countLabel = mode === 'bag' ? `背包货物 ${used}/${capacity} 格 · 建材另存`
    : mode === 'storage' ? `仓库货物 ${used}/${capacity} 格` : `已拥有装备 ${used} 件`;
  ctx.fillText(`${countLabel} · 金币 ${state.gold}`, 35, 213, 745);
  box(ctx, 818, 187, 74, 41, 10, '#3c7774'); box(ctx, 902, 187, 74, 41, 10, '#3c7774');
  ctx.font = '700 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff6d9';
  ctx.fillText('‹', 855, 216); ctx.fillText('›', 939, 216);
  ctx.font = '18px sans-serif'; ctx.fillText(`${safePage + 1}/${pageCount}`, 784, 217);
  buttons.push({ id: 'inventory-prev', x: 818, y: 187 + offset, width: 74, height: 41 }, { id: 'inventory-next', x: 902, y: 187 + offset, width: 74, height: 41 });
  const visible = rows.slice(safePage * perPage, safePage * perPage + perPage);
  const actualSelected = visible.find((row) => row.id === selectedId) || visible[0] || null;
  if (!rows.length) {
    box(ctx, 30, 240, 964, narrow ? 330 : 175, 18, '#205a58', '#668e7d');
    ctx.fillStyle = '#fff6d9'; ctx.font = '700 30px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(mode === 'storage' ? '仓库还是空的' : '这里还没有物品', 512, narrow ? 390 : 320);
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#c5e4d8';
    ctx.fillText(mode === 'storage' ? '在“维修仓储”中存入货物' : '捕鱼、种植或购买后会出现在这里', 512, narrow ? 432 : 357);
  }
  visible.forEach((item, index) => {
    const x = narrow ? 30 : 30 + (index % 2) * 490;
    const y = narrow ? 236 + index * 94 : 236 + Math.floor(index / 2) * 65;
    const w = narrow ? 964 : 474, h = narrow ? 86 : 60;
    const selected = actualSelected?.id === item.id;
    box(ctx, x, y, w, h, 14, selected ? '#386e58' : '#205b5b', selected ? '#f3d377' : '#668e7d');
    const iconSize = narrow ? 70 : 51;
    drawIcon(ctx, item, x + 8, y + (h - iconSize) / 2, iconSize);
    ctx.textAlign = 'start'; ctx.fillStyle = '#fff6d9';
    ctx.font = `700 ${narrow ? 32 : 23}px sans-serif`;
    ctx.fillText(item.name, x + (narrow ? 95 : 72), y + (narrow ? 35 : 27), w - 160);
    ctx.font = `${narrow ? 26 : 18}px sans-serif`; ctx.fillStyle = '#c9e9d9';
    ctx.fillText(item.summary, x + (narrow ? 95 : 72), y + (narrow ? 67 : 50), w - 170);
    box(ctx, x + w - 75, y + (h - 31) / 2, 62, 31, 8, '#8f7542');
    ctx.textAlign = 'center'; ctx.font = `700 ${narrow ? 24 : 18}px sans-serif`; ctx.fillStyle = '#fff6d9';
    ctx.fillText(`×${item.quantity}`, x + w - 44, y + h / 2 + 7, 55);
    buttons.push({ id: `inventory-select:${item.id}`, x, y: y + offset, width: w, height: h });
  });
  if (actualSelected) {
    const y = narrow ? 628 : 441;
    const h = narrow ? 166 : 105;
    box(ctx, 30, y, 964, h, 18, '#164d50', '#ddb967');
    const iconSize = narrow ? 120 : 84;
    drawIcon(ctx, actualSelected, 47, y + (h - iconSize) / 2, iconSize);
    ctx.textAlign = 'start'; ctx.fillStyle = '#fff6d9'; ctx.font = `700 ${narrow ? 36 : 28}px sans-serif`;
    ctx.fillText(actualSelected.name, narrow ? 192 : 154, y + (narrow ? 44 : 35), 785);
    ctx.fillStyle = '#f5d78b'; ctx.font = `${narrow ? 30 : 22}px sans-serif`;
    ctx.fillText(actualSelected.detail, narrow ? 192 : 154, y + (narrow ? 91 : 67), 785);
    ctx.fillStyle = '#b9e5da'; ctx.font = `${narrow ? 27 : 22}px sans-serif`; ctx.fillText(actualSelected.status, narrow ? 192 : 154, y + (narrow ? 134 : 94), 785);
    const action = inventoryAction(actualSelected.id, mode);
    if (action) {
      const actionY = narrow ? 807 : 555;
      box(ctx, 30, actionY, 964, narrow ? 68 : 64, 17, '#287f74', '#d1e6b5');
      ctx.fillStyle = '#fff6d9'; ctx.font = `700 ${narrow ? 32 : 27}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(action.label, 512, actionY + (narrow ? 46 : 43), 920);
      buttons.push({ id: action.id, x: 30, y: actionY + offset, width: 964, height: narrow ? 68 : 64 });
    }
  }
  ctx.textAlign = 'start';
  return { buttons, page: safePage, selectedId: actualSelected?.id ?? null, pageCount };
}
