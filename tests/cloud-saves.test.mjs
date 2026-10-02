import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyGoogleToken } from '../server/googleIdentity.js';
import { createCloudHandlers } from '../server/cloudSaves.js';
import { freshState, normalizeState } from '../src/economy.js';
import { CloudSaveController } from '../src/cloudSave.js';
import { createSaveStorage } from '../src/saveStorage.js';
import { validateSave } from '../src/saveFormat.js';
import { onRequestGet as saveStatus } from '../functions/api/save-status.js';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] });
const clientId = 'client.apps.googleusercontent.com';
const token = (claims = {}) => new SignJWT({ email_verified: true, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
  .setSubject('google-user').setAudience(clientId).setIssuer('https://accounts.google.com').setIssuedAt().setExpirationTime('1h').sign(privateKey);
assert.equal((await verifyGoogleToken(await token(), clientId, keys)).id, 'google-user');
await assert.rejects(verifyGoogleToken(await token(), 'wrong-client', keys));
const expired = await new SignJWT({ email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
  .setSubject('google-user').setAudience(clientId).setIssuer('https://accounts.google.com').setIssuedAt(1).setExpirationTime(2).sign(privateKey);
await assert.rejects(verifyGoogleToken(expired, clientId, keys));
await assert.rejects(verifyGoogleToken(`${(await token()).slice(0, -12)}invalid-signature`, clientId, keys));
await assert.rejects(verifyGoogleToken(await token({ email_verified: false }), clientId, keys));

const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}',
  compatibilityDate: '2026-10-01', d1Databases: { SAVES_DB: 'local-cloud-save-test' } }));
try {
  const db = await mf.getD1Database('SAVES_DB');
  await db.exec((await readFile(new URL('../migrations/0001_cloud_saves.sql', import.meta.url), 'utf8')).replace(/\n/g, ' '));
  const handlers = createCloudHandlers(async (request) => {
    const id = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!['user-a', 'user-b'].includes(id)) throw new Error('invalid');
    return { id };
  });
  const env = { SAVES_DB: db, GOOGLE_CLIENT_ID: clientId };
  assert.deepEqual(await (await saveStatus({ env })).json(), { available: true });
  assert.equal((await saveStatus({ env: {} })).status, 503);
  assert.equal((await saveStatus({ env: { GOOGLE_CLIENT_ID: clientId, SAVES_DB: { prepare() { throw new Error('missing table'); } } } })).status, 503);
  const raw = (user, options = {}, path = '/api/saves') => handlers.saves({
    request: new Request(`https://game.example${path}`, { ...options, headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json', ...options.headers } }), env,
  });
  const send = async (user, options, path) => {
    const response = await raw(user, options, path);
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status, save: data.save });
    return data;
  };
  assert.equal((await raw('invalid')).status, 401);
  assert.equal((await raw('user-a', { method: 'PUT', headers: { Origin: 'https://bad.example' }, body: '{}' })).status, 403);
  assert.equal((await raw('user-a', { method: 'PUT', body: '{' })).status, 400);
  assert.equal((await raw('user-a', { method: 'PUT', body: JSON.stringify({ expectedRevision: 0, requestId: crypto.randomUUID(), state: {} }) })).status, 400);
  assert.equal((await handlers.saves({ request: new Request('https://game.example/api/saves', { headers: { Authorization: 'Bearer user-a' } }), env: { GOOGLE_CLIENT_ID: clientId } })).status, 503);

  const memory = () => {
    const entries = new Map();
    return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key), entries };
  };
  const device = (gold) => {
    const backing = memory();
    const storage = createSaveStorage(backing);
    const state = { ...freshState(), gold };
    storage.save(state);
    let reloads = 0;
    const controller = new CloudSaveController({ readState: () => state, storage, normalize: normalizeState,
      reload: () => reloads++, request: (path, user, options) => send(user, options, path) });
    controller.connect({ id: 'user-a' }, 'user-a');
    return { controller, storage, state, backing, reloads: () => reloads };
  };
  const a = device(100), b = device(80);
  assert.equal(await a.controller.upload(), 'uploaded');
  assert.equal(a.storage.owner(), 'user-a');
  assert.equal(a.storage.readAccount(null).gold, 100, 'first binding must preserve guest progress');
  const otherTab = createSaveStorage(a.backing);
  otherTab.activate('user-b', { ...freshState(), gold: 777 });
  a.storage.save(a.state);
  assert.equal(a.storage.readAccount('user-b').gold, 777, 'another tab cannot redirect periodic writes to a different account');
  assert.equal(a.storage.owner(), 'user-a');
  otherTab.activate('user-a', a.state, 10);
  a.storage.save(a.state);
  const restarted = createSaveStorage(a.backing);
  assert.equal(restarted.revision('user-a'), 1, 'a stale tab keeps the revision belonging to its own snapshot');
  assert.equal((await send('user-b')).save, null, 'accounts must have separate saves');
  assert.equal(await b.controller.upload(), 'choose', 'an unknown base revision must not silently overwrite');
  assert.equal(b.controller.pending.cloud.state.gold, 100);
  assert.equal(await b.controller.keepLocal(), 'uploaded');
  assert.equal((await send('user-a')).save.state.gold, 80, 'resources must not be added');
  a.state.gold = 20;
  assert.equal(await a.controller.upload(), 'choose', 'the other device advanced the cloud revision');
  await a.controller.useCloud();
  assert.equal(a.storage.load().gold, 80);
  assert.equal(a.reloads(), 1);
  assert.equal(JSON.parse(a.backing.getItem('island-state:google:user-a:backups'))[0].state.gold, 20);
  const history = await b.controller.history();
  assert.equal(history.length, 2);
  assert.equal((await send('user-b', {}, '/api/saves?history=1')).versions.length, 0);
  await assert.rejects(send('user-b', {}, `/api/saves?version=${history[0].id}`), (error) => error.status === 404);
  await b.controller.previewRestore(history[1].id);
  await b.controller.useCloud();
  assert.equal(b.storage.load().gold, 100);
  assert.equal(b.storage.load().gameMinutes, 360, 'restoring must not advance the game clock');
  assert.equal((await send('user-a')).save.revision, 3);
  assert.equal((await send('user-a', {}, '/api/saves?history=1')).versions.length, 3, 'restore creates a new version');

  const sameBase = { expectedRevision: 3, state: freshState() };
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const raced = await Promise.all(ids.map((requestId) => raw('user-a', { method: 'PUT', body: JSON.stringify({ ...sameBase, requestId }) })));
  assert.deepEqual(raced.map((response) => response.status).sort(), [200, 409], 'only one concurrent writer wins');
  const winner = ids[raced.findIndex((response) => response.status === 200)];
  assert.equal((await send('user-a', { method: 'PUT', body: JSON.stringify({ ...sameBase, requestId: winner }) })).save.revision, 4, 'retry is idempotent');
  await b.controller.previewRestore(history[1].id);
  await send('user-a', { method: 'PUT', body: JSON.stringify({ expectedRevision: 4, requestId: crypto.randomUUID(), state: { ...freshState(), gold: 7 } }) });
  assert.equal(await b.controller.useCloud(), 'choose', 'restore cannot overwrite a concurrent upload');
  assert.equal((await send('user-a')).save.state.gold, 7);
  assert.equal(await b.controller.keepLocal(), 'kept');

  for (let revision = 5; revision < 34; revision++) {
    await send('user-a', { method: 'PUT', body: JSON.stringify({ expectedRevision: revision, requestId: crypto.randomUUID(), state: freshState() }) });
  }
  assert.equal((await send('user-a', {}, '/api/saves?history=1')).versions.length, 30);
  const offline = device(12);
  offline.controller.request = async () => { throw new Error('offline'); };
  await assert.rejects(offline.controller.upload(), /offline/);
  assert.equal(offline.storage.load().gold, 12, 'network failure preserves local progress');
  offline.controller.profile = { id: 'user-b' };
  offline.storage.activate('user-a', offline.state);
  await assert.rejects(offline.controller.upload(), /其他账号/);
  offline.controller.logout();
  assert.equal(offline.storage.owner(), null);
  assert.equal(offline.storage.readAccount('user-a').gold, 12);
  assert.equal(offline.storage.load().gold, 12);
  assert.throws(() => validateSave({ ...freshState(), gold: NaN }));
  assert.throws(() => validateSave({ ...freshState(), schemaVersion: 99 }));
  assert.throws(() => validateSave({ ...freshState(), extra: JSON.parse('{"__proto__":{"polluted":true}}') }));
  console.log('Cloud save authentication, D1 concurrency, history restore, account isolation and offline checks passed');
} finally { await mf.dispose(); }
