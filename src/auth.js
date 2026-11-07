// Shared-password gate. The cookie holds HMAC(SESSION_SECRET, CLUB_PASSWORD), so
// changing either secret logs everyone out.
export const COOKIE = 'geb_member';
const YEAR = 60 * 60 * 24 * 365;

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const token = (env) => hmac(env.SESSION_SECRET, `member:${env.CLUB_PASSWORD}`);

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function isMember(request, env) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]+)`));
  return !!m && safeEqual(m[1], await token(env));
}

export async function passwordMatches(pw, env) {
  // compare HMACs so timing doesn't leak the password length
  return safeEqual(await hmac(env.SESSION_SECRET, `pw:${pw}`), await hmac(env.SESSION_SECRET, `pw:${env.CLUB_PASSWORD}`));
}

export async function loginCookie(env) {
  return `${COOKIE}=${await token(env)}; Max-Age=${YEAR}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const logoutCookie = `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

// ---------------------------------------------------------------- member accounts
// Accounts live inside the club gate. A password is optional; an account without
// one can be used by anyone who has the club password.
export const ACCOUNT_COOKIE = 'geb_account';
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

export async function hashPassword(pw, salt = toHex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: 100000 }, key, 256);
  return { salt, hash: toHex(bits) };
}

export async function verifyPassword(pw, member) {
  if (!member.pw_hash) return true;
  const { hash } = await hashPassword(pw, member.pw_salt);
  return safeEqual(hash, member.pw_hash);
}

// Token includes the password hash, so changing a password signs out other browsers.
const accountToken = (env, m) => hmac(env.SESSION_SECRET, `acct:${m.id}:${m.pw_hash ?? ''}`);

export async function accountCookie(env, m) {
  return `${ACCOUNT_COOKIE}=${m.id}.${await accountToken(env, m)}; Max-Age=${YEAR}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const accountLogoutCookie = `${ACCOUNT_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

export async function currentAccount(request, env, db) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${ACCOUNT_COOKIE}=(\\d+)\\.([0-9a-f]+)`));
  if (!m) return null;
  const member = await db.prepare('SELECT * FROM members WHERE id = ?').bind(Number(m[1])).first();
  if (!member || !safeEqual(m[2], await accountToken(env, member))) return null;
  return member;
}
