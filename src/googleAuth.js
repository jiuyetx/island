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
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw new Error('Google 登录验证失败，请重试');
  return normalizeGoogleProfile(await response.json(), clientId);
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

export function initGoogleAuth() {
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
  let signedInProfile = null;
  let initialized = false;

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
  };

  const acceptCredential = async (credential, persist = true) => {
    setStatus('正在验证 Google 账号…');
    signedInProfile = await verifyCredential(credential, clientId);
    if (persist) storage?.setItem(SESSION_KEY, credential);
    render();
    setStatus('登录成功。游戏进度仍保存在当前设备。', 'success');
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
      } else setStatus('登录后会显示账号身份；游戏存档仍保存在本机。');
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
    initialize();
  });
  closeButton?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  logoutButton.addEventListener('click', () => {
    globalThis.google?.accounts?.id?.disableAutoSelect();
    storage?.removeItem(SESSION_KEY);
    signedInProfile = null;
    render();
    setStatus('已退出 Google 账号。');
  });
  render();
}
