import { validateSave } from './saveFormat.js';

export async function cloudRequest(path, credential, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options, signal: AbortSignal.timeout(15000), credentials: 'same-origin',
      headers: { Authorization: `Bearer ${credential}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch { throw new Error('网络连接失败，本机进度已保留，请稍后重试'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('云存档服务尚未连接，本机进度仍然保留'); }
  if (!response.ok) {
    const error = new Error(data.error || '云存档请求失败');
    error.status = response.status;
    error.save = data.save;
    throw error;
  }
  return data;
}

export class CloudSaveController {
  constructor({ readState, storage, normalize, reload, request = cloudRequest }) {
    Object.assign(this, { readState, storage, normalize, reload, request });
    this.profile = null;
    this.credential = null;
    this.cloud = null;
    this.pending = null;
  }
  call(path, options) {
    if (!this.profile || !this.credential) throw new Error('请先登录 Google 账号');
    return this.request(path, this.credential, options);
  }
  connect(profile, credential) {
    this.profile = profile;
    this.credential = credential;
    this.baseRevision = this.storage.owner() === profile.id ? this.storage.revision(profile.id) : null;
    this.cloud = null;
    this.pending = null;
  }
  snapshot() { return validateSave(JSON.parse(JSON.stringify({ ...this.readState(), updatedAt: Date.now() }))); }
  async refresh() {
    const { save } = await this.call('/api/saves');
    this.cloud = save;
    return save;
  }
  canUpload() { const owner = this.storage.owner(); return !owner || owner === this.profile?.id; }
  async upload() {
    if (!this.canUpload()) throw new Error('当前进度属于其他账号，请先切换到此账号进度');
    const state = this.snapshot();
    await this.refresh();
    if (this.cloud && this.baseRevision !== this.cloud.revision) {
      this.pending = { kind: 'upload', local: state, cloud: this.cloud };
      return 'choose';
    }
    return this.write(state, this.cloud?.revision || 0);
  }
  async write(state, expectedRevision, restoreId = null) {
    try {
      const { save } = await this.call('/api/saves', {
        method: restoreId ? 'POST' : 'PUT',
        body: JSON.stringify({ state: restoreId ? undefined : state, restoreId, expectedRevision, requestId: crypto.randomUUID() }),
      });
      this.cloud = save;
      this.pending = null;
      if (restoreId) { this.apply(save); return 'restored'; }
      this.storage.activate(this.profile.id, state, save.revision);
      this.storage.setRevision(this.profile.id, save.revision);
      this.baseRevision = save.revision;
      return 'uploaded';
    } catch (error) {
      if (error.status !== 409 || !error.save) throw error;
      this.cloud = error.save;
      this.pending = { kind: restoreId ? 'restore-conflict' : 'upload', local: state, cloud: error.save, restoreId };
      return 'choose';
    }
  }
  async download() {
    await this.refresh();
    if (!this.cloud) throw new Error('此账号还没有云存档，可先上传当前进度');
    validateSave(this.cloud.state);
    this.pending = { kind: 'download', local: this.snapshot(), cloud: this.cloud };
    return 'choose';
  }
  async history() { return (await this.call('/api/saves?history=1')).versions; }
  localHistory() { return this.storage.backups(this.profile.id); }
  previewLocalRestore(index) {
    const record = this.localHistory()[index];
    if (!record) throw new Error('本机备份不存在');
    validateSave(record.state);
    this.pending = { kind: 'local-restore', local: this.snapshot(), cloud: { ...record, revision: null } };
    return 'choose';
  }
  async previewRestore(id) {
    const { save } = await this.call(`/api/saves?version=${encodeURIComponent(id)}`);
    validateSave(save.state);
    await this.refresh();
    this.pending = { kind: 'restore', local: this.snapshot(), cloud: save, expectedRevision: this.cloud?.revision || 0 };
    return 'choose';
  }
  async keepLocal() {
    const pending = this.pending;
    if (!pending) return;
    if (pending.kind === 'upload') return this.write(pending.local, pending.cloud.revision);
    this.pending = null;
    return 'kept';
  }
  async useCloud() {
    const pending = this.pending;
    if (!pending) return;
    if (pending.kind === 'restore') return this.write(pending.local, pending.expectedRevision, pending.cloud.id);
    this.apply(pending.cloud);
    return 'downloaded';
  }
  apply(save) {
    validateSave(save.state);
    const state = this.normalize(save.state);
    this.storage.backup(this.snapshot(), this.profile.id);
    this.storage.activate(this.profile.id, state, save.revision);
    this.storage.setRevision(this.profile.id, save.revision);
    this.pending = null;
    this.reload();
  }
  switchLocal() {
    const state = this.storage.readAccount(this.profile.id);
    if (!state) throw new Error('此账号没有本地存档，请下载云存档');
    validateSave(state);
    this.storage.backup(this.snapshot(), this.profile.id);
    this.storage.activate(this.profile.id, state);
    this.reload();
  }
  logout() {
    this.profile = null;
    this.credential = null;
    this.cloud = null;
    this.pending = null;
    if (this.storage.owner()) {
      this.storage.save(this.snapshot());
      // Return to the original guest progress, keeping account saves intact.
      this.storage.activate(null, this.storage.readAccount(null) || this.normalize(null));
      this.reload();
    }
  }
}
