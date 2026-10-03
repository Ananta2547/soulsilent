/**
 * Share links for draft articles. A draft is readable by anyone holding
 * /articles/<slug>?share=<token>, where the token is an HMAC of the article id
 * under the site secret — nothing is stored, the link keeps working when the
 * slug changes, and it stops mattering once the article is published.
 * Server-only (reads the secret).
 */
import { getEnv } from './db';

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  const env = await getEnv();
  const secret = env.JWT_SECRET || 'dev-secret-change-in-production';
  return crypto.subtle.importKey('raw', enc.encode('article-share:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function articleShareToken(articleId: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(articleId)));
  let bin = '';
  sig.slice(0, 16).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time check of a share token against the article id. */
export async function isArticleShareToken(articleId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const want = await articleShareToken(articleId);
  if (want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
