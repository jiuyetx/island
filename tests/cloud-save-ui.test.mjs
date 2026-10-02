import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { initGoogleAuth } from '../src/googleAuth.js';
import { freshState, normalizeState } from '../src/economy.js';
import { summarizeSave } from '../src/saveFormat.js';

// Isolated DOM fixture: this never reads or changes a player's browser save.
const window = new Window({ url: 'https://game.example/', settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true } });
window.document.write((await readFile(new URL('../web/index.html', import.meta.url), 'utf8')).replace('__GOOGLE_CLIENT_ID__', 'test.apps.googleusercontent.com'));
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
let identityCallback, paused = false, reloads = 0, expire = false, offline = false;
let pendingFetch;
globalThis.google = { accounts: { id: {
  initialize(options) { identityCallback = options.callback; },
  renderButton(mount) {
    const button = document.createElement('button');
    button.textContent = 'Test Google sign in';
    button.addEventListener('click', () => identityCallback({ credential: 'test-credential' }));
    mount.append(button);
  }, disableAutoSelect() {},
} } };
const local = freshState();
const initialCloud = { ...freshState(), gold: 120, gameMinutes: 1800 };
const make = (state, revision) => ({ state, summary: summarizeSave(state), id: `version-${revision}`, revision, savedAt: Date.now(), source: 'upload' });
let cloud = make(initialCloud, 1);
const versions = [cloud];
globalThis.fetch = async (path, options = {}) => {
  if (pendingFetch) await pendingFetch;
  if (expire) return Response.json({ error: '登录已过期，请重新登录' }, { status: 401 });
  if (path === '/api/account') return Response.json({ profile: { id: 'user-a', name: '测试岛民', email: 'test@example.com' } });
  if (offline) return Response.json({ error: '云存档暂不可用，本机进度未被覆盖' }, { status: 503 });
  if (path.includes('history')) return Response.json({ versions: versions.map(({ state, ...metadata }) => metadata) });
  if (path.includes('version=')) return Response.json({ save: versions.find((version) => version.id === path.split('version=')[1]) });
  if (options.method === 'PUT' || options.method === 'POST') {
    const body = JSON.parse(options.body);
    assert.equal(body.expectedRevision, cloud.revision);
    const state = options.method === 'POST' ? versions.find((version) => version.id === body.restoreId).state : body.state;
    cloud = make(state, cloud.revision + 1);
    versions.unshift(cloud);
    return Response.json({ save: cloud });
  }
  return Response.json({ save: cloud });
};
const el = (id) => document.getElementById(id);
const idle = async () => {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (!el('google-auth-close').disabled) return;
  }
  throw new Error('UI did not settle');
};
try {
  initGoogleAuth({ readState: () => local, normalize: normalizeState, onPause: (value) => { paused = value; }, reload: () => reloads++ });
  assert.equal(el('google-profile').hidden, true);
  assert.equal(el('cloud-save-panel').hidden, true);
  el('google-account-button').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(paused, true);
  el('google-signin-button').querySelector('button').click();
  await idle();
  assert.equal(el('cloud-save-panel').hidden, false);
  assert.match(el('cloud-remote-summary').textContent, /金币 120/);
  el('cloud-save-upload').click();
  await idle();
  assert.equal(el('cloud-save-choice').hidden, false);
  assert.match(el('cloud-keep-local').textContent, /上传/);
  assert.equal(el('cloud-save-upload').disabled, true);
  el('cloud-keep-local').click();
  await idle();
  assert.match(el('google-auth-status').textContent, /上传成功/);
  assert.equal(cloud.state.gold, 80);
  assert.equal(versions.length, 2);
  el('cloud-save-versions').click();
  await idle();
  assert.equal(el('cloud-save-history').querySelectorAll('button').length, 2);
  el('cloud-save-history').querySelectorAll('button')[1].click();
  await idle();
  assert.match(el('cloud-choice-title').textContent, /历史/);
  el('cloud-use-remote').click();
  await idle();
  assert.equal(cloud.revision, 3);
  assert.equal(reloads, 1);
  assert.equal(JSON.parse(localStorage.getItem('island-state:google:user-a')).gold, 120);
  assert.equal(JSON.parse(localStorage.getItem('island-state:google:user-a:backups'))[0].state.gold, 80);
  offline = true;
  el('cloud-save-versions').click();
  await idle();
  assert.match(el('google-auth-status').textContent, /暂不可用/);
  assert.equal(el('cloud-save-history').querySelectorAll('button').length, 1, 'local recovery remains available offline');
  el('cloud-save-history').querySelector('button').click();
  await idle();
  assert.match(el('cloud-choice-title').textContent, /本机备份/);
  el('cloud-use-remote').click();
  await idle();
  assert.equal(reloads, 2);
  assert.equal(JSON.parse(localStorage.getItem('island-state:google:user-a')).gold, 80);
  assert.equal(localStorage.getItem('island-cloud-revision:user-a'), null, 'a restored local backup has an unknown cloud base');
  offline = false;
  let unblock;
  pendingFetch = new Promise((resolve) => { unblock = resolve; });
  el('cloud-save-download').click();
  assert.equal(el('google-auth-close').disabled, true);
  const cancel = new window.Event('cancel', { cancelable: true });
  el('google-auth-dialog').dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true, 'a snapshot operation must not resume gameplay while in flight');
  unblock(); pendingFetch = null;
  await idle();
  el('cloud-keep-local').click();
  await idle();
  expire = true;
  el('cloud-save-download').click();
  await idle();
  assert.equal(el('cloud-save-panel').hidden, true);
  assert.equal(el('google-profile').hidden, true);
  assert.match(el('google-auth-status').textContent, /过期/);
  el('google-auth-close').click();
  assert.equal(paused, false);
  console.log('Cloud save UI: upload choice, history restore, offline local backup, busy locking, expiry and pause passed');
} finally { await window.happyDOM.close(); }
