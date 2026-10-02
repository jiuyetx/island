const ACTIVE_KEY = 'island-active-save';
const GUEST_KEY = 'island-state';
const accountKey = (owner) => owner ? `island-state:google:${owner}` : GUEST_KEY;

export function createSaveStorage(storage) {
  // A second tab changing accounts must not redirect this tab's periodic writes.
  let activeOwner = storage.getItem(ACTIVE_KEY) || null;
  const owner = () => activeOwner;
  const revisions = new Map();
  const storedRevision = (id) => {
    const text = storage.getItem(accountKey(id));
    if (text) {
      const state = JSON.parse(text);
      if (Object.hasOwn(state, '_cloudRevision')) return state._cloudRevision;
    }
    return null;
  };
  if (activeOwner) revisions.set(activeOwner, storedRevision(activeOwner));
  const read = (key) => {
    const text = storage.getItem(key);
    return text ? JSON.parse(text) : null;
  };
  // Keep the base revision in the same atomic write as its snapshot. A stale
  // tab cannot accidentally label old progress with another tab's new revision.
  const save = (state) => storage.setItem(accountKey(owner()), JSON.stringify({ ...state, updatedAt: Date.now(), _cloudRevision: revisions.get(owner()) ?? null }));
  return {
    owner,
    load: () => read(accountKey(owner())),
    readAccount: (id) => read(accountKey(id)),
    save,
    backups: (id = owner()) => read(`${accountKey(id)}:backups`) || [],
    backup(state, id = owner()) {
      const key = `${accountKey(id)}:backups`;
      const records = read(key) || [];
      storage.setItem(key, JSON.stringify([{ savedAt: Date.now(), state }, ...records].slice(0, 5)));
    },
    activate(id, state, revision = state._cloudRevision ?? null) {
      // Write the destination first: a quota error cannot switch to a missing save.
      storage.setItem(accountKey(id), JSON.stringify({ ...state, _cloudRevision: revision }));
      if (id) storage.setItem(ACTIVE_KEY, id);
      else storage.removeItem(ACTIVE_KEY);
      activeOwner = id || null;
      revisions.set(id, revision);
    },
    setRevision(id, revision) {
      const key = `island-cloud-revision:${id}`;
      if (revision === null) storage.removeItem(key);
      else storage.setItem(key, String(revision));
      revisions.set(id, revision);
    },
    revision(id) {
      if (!revisions.has(id)) revisions.set(id, storedRevision(id));
      return revisions.get(id);
    },
  };
}
