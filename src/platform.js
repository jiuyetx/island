import { createSaveStorage } from './saveStorage.js';

const isWeChat = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';

export const canvas = isWeChat ? wx.createCanvas() : document.querySelector('#game');
if (isWeChat) {
  canvas.style ||= {};
  canvas.addEventListener ||= () => {};
  canvas.removeEventListener ||= () => {};
  canvas.setAttribute ||= () => {};
}

export function viewport() {
  if (isWeChat) {
    let info;
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); }
    catch { info = { windowWidth: canvas.width || 960, windowHeight: canvas.height || 540, pixelRatio: 1 }; }
    return { width: info.windowWidth, height: info.windowHeight, dpr: Math.min(info.pixelRatio || 1, 1.75) };
  }
  return { width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio || 1, 1.75) };
}

export function offscreen(width, height) {
  const result = isWeChat && wx.createOffscreenCanvas
    ? wx.createOffscreenCanvas({ type: '2d', width, height })
    : isWeChat ? wx.createCanvas() : document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = isWeChat ? wx.createImage() : new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    if (isWeChat) {
      const ext = src.endsWith('.webp') ? 'webp' : 'png';
      const path = `${wx.env.USER_DATA_PATH}/tropical-atlas.${ext}`;
      try {
        const fs = wx.getFileSystemManager();
        fs.writeFileSync(path, fs.readFileSync(src, 'base64'), 'base64');
      }
      catch (error) { reject(error); return; }
      image.src = path;
      return;
    }
    image.src = src;
  });
}

let browserSaveStorage;
export function getBrowserSaveStorage() {
  if (isWeChat) return null;
  return browserSaveStorage ||= createSaveStorage(localStorage);
}

export function loadState() {
  try {
    if (!isWeChat) return getBrowserSaveStorage().load();
    const value = wx.getStorageSync('island-state');
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch { return null; }
}

let localSavesSuspended = false;
export function suspendLocalSaves() { localSavesSuspended = true; }

export function saveState(value) {
  if (localSavesSuspended) return;
  try {
    const text = JSON.stringify(value);
    if (isWeChat) wx.setStorageSync('island-state', text);
    else getBrowserSaveStorage().save(value);
  } catch { /* Storage failure must not stop play. */ }
}

export function onResize(handler) {
  if (isWeChat && wx.onWindowResize) wx.onWindowResize(handler);
  else addEventListener('resize', handler);
}

export function onForegroundChange(handler) {
  if (isWeChat) {
    wx.onShow?.(() => handler(true));
    wx.onHide?.(() => handler(false));
    return;
  }
  document.addEventListener('visibilitychange', () => handler(document.visibilityState === 'visible'));
}

export function onTouches({ start, move, end }) {
  if (isWeChat) {
    const points = (event) => [...event.touches].map((touch) => ({
      id: touch.identifier, x: touch.clientX, y: touch.clientY,
    }));
    wx.onTouchStart((event) => start(points(event)));
    wx.onTouchMove((event) => move(points(event)));
    wx.onTouchEnd((event) => end(points(event)));
    wx.onTouchCancel((event) => end(points(event)));
    return;
  }
  const active = new Map();
  const points = () => [...active.values()];
  const pointerPoint = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { id: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    active.set(event.pointerId, pointerPoint(event));
    start(points());
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!active.has(event.pointerId)) return;
    active.set(event.pointerId, pointerPoint(event));
    move(points());
  });
  const finish = (event) => {
    active.delete(event.pointerId);
    end(points());
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
}

export function nextFrame(callback) {
  const raf = canvas.requestAnimationFrame?.bind(canvas) || globalThis.requestAnimationFrame;
  return raf ? raf(callback) : setTimeout(() => callback(Date.now()), 16);
}

export { isWeChat };
