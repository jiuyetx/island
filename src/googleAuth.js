import { CloudSaveController, cloudRequest } from './cloudSave.js';
import { createSaveStorage } from './saveStorage.js';
import { summarizeSave } from './saveFormat.js';

const SESSION_KEY = 'island-google-session';

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseGoogleCredentialPayload(credential) {
  if (typeof credential !== 'string') throw new Error('Google 登录凭证无效');
  const parts = credential.split('.');
  if (parts.length !== 3) throw new Error('Google 登录凭证格式错误');
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    throw new Error('无法读取 Google 登录凭证');
  }
}

export function normalizeGoogleProfile(payload, clientId, nowSeconds = Date.now() / 1000) {
  if (!payload || typeof payload !== 'object') throw new Error('Google 用户资料无效');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!clientId || !audiences.includes(clientId)) throw new Error('Google 登录来源不匹配');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('Google 登录签发方无效');
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= nowSeconds) throw new Error('Google 登录已过期');
  if (!payload.sub || (payload.email_verified !== true && payload.email_verified !== 'true')) {
    throw new Error('Google 邮箱尚未验证');
  }
  return {
    id: String(payload.sub),
    name: String(payload.name || payload.given_name || payload.email || 'Google 用户'),
    email: String(payload.email || ''),
    picture: typeof payload.picture === 'string' ? payload.picture : '',
  };
}

async function verifyCredential(credential, clientId) {
  // The server verifies Google's signature; decoded browser claims cannot authorize writes.
  const { profile } = await cloudRequest('/api/account', credential, { method: 'POST' });
  if (!profile?.id || !clientId) throw new Error('Google 登录验证失败，请重试');
  return profile;
}

function readClientId() {
  return document.querySelector('meta[name="google-client-id"]')?.content?.trim() || '';
}

function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.google), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google 登录服务加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve(globalThis.google);
    script.onerror = () => reject(new Error('Google 登录服务加载失败'));
    document.head.append(script);
  });
}

function safeSession() {
  try { return sessionStorage; } catch { return null; }
}

export function initGoogleAuth({ readState, normalize, saveStorage, onPause = () => {}, reload = () => location.reload() } = {}) {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('google-auth-root');
  const accountButton = document.getElementById('google-account-button');
  const dialog = document.getElementById('google-auth-dialog');
  const closeButton = document.getElementById('google-auth-close');
  const signInMount = document.getElementById('google-signin-button');
  const profile = document.getElementById('google-profile');
  const logoutButton = document.getElementById('google-logout');
  const status = document.getElementById('google-auth-status');
  if (!root || !accountButton || !dialog || !signInMount || !profile || !logoutButton || !status) return;

  const clientId = readClientId();
  const storage = safeSession();
  let cloud;
  try {
    cloud = new CloudSaveController({ readState, normalize, storage: saveStorage || createSaveStorage(localStorage), reload });
  } catch { /* Local storage availability is reported when the menu is opened. */ }
  let signedInProfile = null;
  let initialized = false;
  let working = false;
  const cloudPanel = document.getElementById('cloud-save-panel');
  const choicePanel = document.getElementById('cloud-save-choice');
  const historyPanel = document.getElementById('cloud-save-history');
  const cloudStatus = document.getElementById('cloud-save-status');
  const format = (state, savedAt) => {
    const summary = state.schemaVersion ? summarizeSave(state) : state;
    return `第 ${summary.day} 天 ${summary.clock} · 金币 ${summary.gold} · 体力 ${summary.stamina}${savedAt ? ` · ${new Date(savedAt).toLocaleString('zh-CN')}` : ''}`;
  };
  const renderCloud = () => {
    if (!cloudPanel) return;
    closeButton.disabled = working;
    logoutButton.disabled = working;
    signInMount.style.pointerEvents = working ? 'none' : '';
    cloudPanel.hidden = !signedInProfile;
    for (const button of cloudPanel.querySelectorAll('button')) button.disabled = working || !cloud;
    if (!cloud || !signedInProfile) return;
    document.getElementById('cloud-local-summary').textContent = format(cloud.snapshot(), Date.now());
    document.getElementById('cloud-remote-summary').textContent = cloud.cloud ? format(cloud.cloud.summary, cloud.cloud.savedAt) : '还没有读取到云存档';
    document.getElementById('cloud-save-upload').disabled = working || !cloud.canUpload();
    const switchButton = document.getElementById('cloud-switch-local');
    switchButton.hidden = cloud.canUpload();
    cloudStatus.textContent = cloud.canUpload() ? '手动上传后才会同步。云端保留最近 30 个版本。' : '当前进度属于其他账号，请切换此账号的本地进度或下载云存档。';
    choicePanel.hidden = !cloud.pending;
    if (cloud.pending) {
      const pending = cloud.pending;
      document.getElementById('cloud-choice-title').textContent = pending.kind === 'local-restore' ? '恢复这份本机备份？' : pending.kind === 'restore' ? '恢复这份历史进度？' : pending.kind === 'restore-conflict' ? '恢复期间云端已更新，请先选择进度' : pending.kind === 'upload' ? '本地与云端进度不同，请选择保留哪份' : '下载云端进度？';
      document.getElementById('cloud-choice-local').textContent = format(pending.local, pending.local.updatedAt);
      document.getElementById('cloud-choice-remote').textContent = format(pending.cloud.summary || pending.cloud.state, pending.cloud.savedAt);
      document.getElementById('cloud-keep-local').textContent = pending.kind === 'upload' ? '保留本地并上传' : '保留本地，取消';
      document.getElementById('cloud-use-remote').textContent = pending.kind === 'local-restore' ? '恢复本机备份并重新载入' : pending.kind === 'restore' ? '恢复历史并重新载入' : '使用云端并重新载入';
    }
    for (const id of ['cloud-save-upload', 'cloud-save-download', 'cloud-save-versions', 'cloud-switch-local']) {
      document.getElementById(id).disabled ||= Boolean(cloud.pending);
    }
    for (const button of historyPanel.querySelectorAll('button')) button.disabled ||= Boolean(cloud.pending);
  };
  const run = async (action) => {
    if (working || !cloud) return;
    working = true;
    renderCloud();
    setStatus('正在处理存档，请稍候…');
    try {
      const result = await action();
      renderCloud();
      setStatus(({ uploaded: '上传成功，旧版已保留在历史存档中。', restored: '历史进度已恢复，正在重新载入…', downloaded: '已备份本地进度，正在载入云存档…', kept: '继续使用本地进度。', choose: '请选择保留哪份进度，资源不会相加。' })[result] || '云存档已更新。', 'success');
    } catch (error) {
      setStatus(error.message || '云存档操作失败，本机进度已保留', 'error');
      if (error.status === 401) {
        storage?.removeItem(SESSION_KEY);
        initialized = false;
        signedInProfile = null;
        cloud.profile = null;
        cloud.credential = null;
        render();
      }
    } finally { working = false; renderCloud(); }
  };

  const setStatus = (message, tone = '') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const render = () => {
    root.dataset.signedIn = signedInProfile ? 'true' : 'false';
    if (!signedInProfile) {
      accountButton.innerHTML = '<span class="google-g">G</span><span>Google 登录</span>';
      profile.hidden = true;
      logoutButton.hidden = true;
      if (cloudPanel) cloudPanel.hidden = true;
      return;
    }
    const avatar = signedInProfile.picture
      ? `<img src="${signedInProfile.picture.replace(/"/g, '&quot;')}" alt="">`
      : '<span class="google-avatar-fallback">G</span>';
    accountButton.innerHTML = `${avatar}<span>${signedInProfile.name.replace(/[<>&]/g, '')}</span>`;
    profile.hidden = false;
    logoutButton.hidden = false;
    profile.querySelector('[data-profile-avatar]').innerHTML = avatar;
    profile.querySelector('[data-profile-name]').textContent = signedInProfile.name;
    profile.querySelector('[data-profile-email]').textContent = signedInProfile.email;
    renderCloud();
  };

  const acceptCredential = async (credential, persist = true) => {
    setStatus('正在验证 Google 账号…');
    signedInProfile = await verifyCredential(credential, clientId);
    if (persist) storage?.setItem(SESSION_KEY, credential);
    if (cloud) {
      cloud.connect(signedInProfile, credential);
      historyPanel.replaceChildren(); historyPanel.hidden = true;
    }
    render();
    setStatus('登录成功。可手动上传、下载或恢复游戏存档。', 'success');
    if (cloud) await run(() => cloud.refresh());
  };

  const initialize = async () => {
    if (initialized || !clientId) return;
    initialized = true;
    try {
      const identity = await loadGoogleIdentity();
      identity.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try { await acceptCredential(credential); }
          catch (error) { setStatus(error.message || 'Google 登录失败', 'error'); }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      identity.accounts.id.renderButton(signInMount, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: Math.max(220, Math.min(300, dialog.clientWidth - 48)),
        text: 'signin_with',
      });
      const cached = storage?.getItem(SESSION_KEY);
      if (cached) {
        try { await acceptCredential(cached, false); }
        catch { storage?.removeItem(SESSION_KEY); setStatus('请重新登录 Google 账号。'); }
      } else setStatus('登录后可管理云存档。本地进度不会自动被覆盖。');
    } catch (error) {
      initialized = false;
      setStatus(error.message || 'Google 登录服务暂不可用', 'error');
    }
  };

  accountButton.addEventListener('click', () => {
    if (!clientId) {
      setStatus('Google 登录尚未配置，请联系站点管理员。', 'error');
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    onPause(true);
    renderCloud();
    if (!cloud) setStatus('浏览器存储不可用，无法管理存档。', 'error');
    initialize();
  });
  dialog.addEventListener('close', () => { onPause(false); cloud && (cloud.pending = null); });
  closeButton?.addEventListener('click', () => { if (!working) dialog.close(); });
  dialog.addEventListener('cancel', (event) => { if (working) event.preventDefault(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !working) dialog.close(); });
  logoutButton.addEventListener('click', () => {
    if (working) return;
    globalThis.google?.accounts?.id?.disableAutoSelect();
    storage?.removeItem(SESSION_KEY);
    try { cloud?.logout(); }
    catch { setStatus('账号已退出，但存储不可用，请刷新页面后继续。', 'error'); }
    signedInProfile = null;
    render();
    setStatus('已退出 Google 账号。');
  });
  document.getElementById('cloud-save-upload')?.addEventListener('click', () => run(() => cloud.upload()));
  document.getElementById('cloud-save-download')?.addEventListener('click', () => run(() => cloud.download()));
  document.getElementById('cloud-keep-local')?.addEventListener('click', () => run(() => cloud.keepLocal()));
  document.getElementById('cloud-use-remote')?.addEventListener('click', () => run(() => cloud.useCloud()));
  document.getElementById('cloud-switch-local')?.addEventListener('click', () => run(() => cloud.switchLocal()));
  document.getElementById('cloud-save-versions')?.addEventListener('click', () => run(async () => {
    historyPanel.replaceChildren();
    historyPanel.hidden = false;
    const local = cloud.localHistory();
    local.forEach((record, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = `本机备份 · ${format(record.state, record.savedAt)}`;
      item.addEventListener('click', () => run(() => cloud.previewLocalRestore(index)));
      historyPanel.append(item);
    });
    const versions = await cloud.history();
    if (!versions.length && !local.length) historyPanel.textContent = '尚无历史存档，上传后会保留版本。';
    for (const version of versions) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = `${version.source === 'restore' ? '恢复记录' : '上传记录'} #${version.revision} · ${format(version.summary, version.savedAt)}`;
      item.addEventListener('click', () => run(() => cloud.previewRestore(version.id)));
      historyPanel.append(item);
    }
  }));
  render();
  // Resume a tab session without requiring the account menu to be opened first.
  if (storage?.getItem(SESSION_KEY) && clientId) initialize();
}
