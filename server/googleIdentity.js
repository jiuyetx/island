import { createRemoteJWKSet, jwtVerify } from 'jose';
import { normalizeGoogleProfile } from '../src/googleAuth.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function verifyGoogleToken(token, clientId, keys = googleKeys) {
  if (!clientId) throw new Error('Google 登录尚未配置');
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'], audience: clientId,
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    requiredClaims: ['exp', 'sub', 'iat'],
  });
  return normalizeGoogleProfile(payload, clientId);
}

export async function authenticate(request, env) {
  const match = /^Bearer ([^\s]{1,8192})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new Error('请先登录 Google 账号');
  return verifyGoogleToken(match[1], env.GOOGLE_CLIENT_ID);
}
