import assert from 'node:assert/strict';
import { normalizeGoogleProfile, parseGoogleCredentialPayload } from '../src/googleAuth.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = {
  aud: 'client.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: 2_000_000_000,
  sub: 'google-user-1', email: 'islander@example.com', email_verified: true, name: 'Island User', picture: 'https://example.com/avatar.png',
};
const token = `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
assert.deepEqual(parseGoogleCredentialPayload(token), payload);
assert.deepEqual(normalizeGoogleProfile(payload, payload.aud, 1_900_000_000), {
  id: 'google-user-1', name: 'Island User', email: 'islander@example.com', picture: 'https://example.com/avatar.png',
});
assert.equal(normalizeGoogleProfile({ ...payload, email_verified: 'true' }, payload.aud, 1_900_000_000).id, 'google-user-1');
assert.throws(() => normalizeGoogleProfile(payload, 'other-client', 1_900_000_000), /来源不匹配/);
assert.throws(() => normalizeGoogleProfile({ ...payload, exp: 10 }, payload.aud, 20), /已过期/);
console.log('google auth check passed');
