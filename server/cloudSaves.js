import { authenticate } from './googleIdentity.js';
import { MAX_SAVE_BYTES, summarizeSave, validateSave } from '../src/saveFormat.js';

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

const latestQuery = 'SELECT * FROM save_versions WHERE user_id = ? ORDER BY revision DESC LIMIT 1';
const pack = (row, includeState = true) => row ? {
  id: row.id, revision: row.revision, savedAt: row.saved_at, source: row.source,
  summary: JSON.parse(row.summary_json), ...(includeState ? { state: JSON.parse(row.state_json) } : {}),
} : null;

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('请使用 JSON 存档');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('存档内容为空');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_SAVE_BYTES + 4096) { await reader.cancel(); throw new Error('存档文件过大'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('存档格式错误'); }
}

export function createCloudHandlers(verify = authenticate) {
  const identify = async (request, env) => {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google 登录尚未配置' }, 503);
    try { return await verify(request, env); }
    catch { return json({ error: 'Google 登录已过期或无效，请重新登录' }, 401); }
  };
  return {
    async account({ request, env }) {
      if (request.method !== 'POST') return json({ error: '请求方式不支持' }, 405);
      const profile = await identify(request, env);
      return profile instanceof Response ? profile : json({ profile });
    },
    async saves({ request, env }) {
      if (!['GET', 'PUT', 'POST'].includes(request.method)) return json({ error: '请求方式不支持' }, 405);
      if (request.method !== 'GET') {
        const origin = request.headers.get('Origin');
        if (origin && origin !== new URL(request.url).origin) return json({ error: '请求来源无效' }, 403);
      }
      const profile = await identify(request, env);
      if (profile instanceof Response) return profile;
      if (!env.SAVES_DB) return json({ error: '云存档尚未连接，请稍后再试；本机进度仍然保留' }, 503);
      const db = env.SAVES_DB;
      const user = profile.id;
      try {
        if (request.method === 'GET') {
          const params = new URL(request.url).searchParams;
          if (params.has('history')) {
            const { results } = await db.prepare('SELECT id, revision, saved_at, source, summary_json FROM save_versions WHERE user_id = ? ORDER BY revision DESC LIMIT 30').bind(user).all();
            return json({ versions: results.map((row) => pack(row, false)) });
          }
          const version = params.get('version');
          const row = version ? await db.prepare('SELECT * FROM save_versions WHERE user_id = ? AND id = ?').bind(user, version).first()
            : await db.prepare(latestQuery).bind(user).first();
          if (version && !row) return json({ error: '该历史存档不存在' }, 404);
          return json({ save: pack(row) });
        }
        let body;
        try { body = await readBody(request); }
        catch (error) { return json({ error: error.message }, 400); }
        if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
          || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId)) {
          return json({ error: '存档版本无效，请刷新云存档后重试' }, 400);
        }
        const existing = await db.prepare('SELECT * FROM save_versions WHERE user_id = ? AND id = ?').bind(user, body.requestId).first();
        if (existing) return json({ save: pack(existing) });
        let state = body.state;
        const restoring = request.method === 'POST';
        if (restoring) {
          if (typeof body.restoreId !== 'string') return json({ error: '请选择历史存档' }, 400);
          const row = await db.prepare('SELECT * FROM save_versions WHERE user_id = ? AND id = ?').bind(user, body.restoreId).first();
          if (!row) return json({ error: '该历史存档不存在' }, 404);
          state = JSON.parse(row.state_json);
        }
        try { validateSave(state); }
        catch (error) { return json({ error: error.message }, 400); }
        const revision = body.expectedRevision + 1;
        const savedAt = Date.now();
        const [insert] = await db.batch([
          db.prepare(`INSERT INTO save_versions (user_id, id, revision, saved_at, source, state_json, summary_json)
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE COALESCE((SELECT MAX(revision) FROM save_versions WHERE user_id = ?), 0) = ?`)
            .bind(user, body.requestId, revision, savedAt, restoring ? 'restore' : 'upload', JSON.stringify(state), JSON.stringify(summarizeSave(state)), user, body.expectedRevision),
          db.prepare(`DELETE FROM save_versions WHERE user_id = ? AND id IN
            (SELECT id FROM save_versions WHERE user_id = ? ORDER BY revision DESC LIMIT -1 OFFSET 30)
            AND EXISTS (SELECT 1 FROM save_versions WHERE user_id = ? AND id = ?)`)
            .bind(user, user, user, body.requestId),
        ]);
        if (!insert.meta.changes) return json({ error: '云端已有新进度，请选择保留哪份', save: pack(await db.prepare(latestQuery).bind(user).first()) }, 409);
        return json({ save: { id: body.requestId, revision, savedAt, source: restoring ? 'restore' : 'upload', summary: summarizeSave(state), state } });
      } catch (error) {
        // Credentials and save contents must never be included in logs.
        console.error('Cloud save storage unavailable', error?.name || 'Error');
        return json({ error: '云存档暂不可用，本机进度未被覆盖，请稍后重试' }, 503);
      }
    },
  };
}

export const handlers = createCloudHandlers();
