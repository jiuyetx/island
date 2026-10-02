import { json } from '../../server/cloudSaves.js';

// This probes only schema availability, never account identities or save data.
export async function onRequestGet({ env }) {
  if (!env.SAVES_DB || !env.GOOGLE_CLIENT_ID) return json({ available: false }, 503);
  try {
    await env.SAVES_DB.prepare('SELECT 1 FROM save_versions LIMIT 1').first();
    return json({ available: true });
  } catch { return json({ available: false }, 503); }
}
