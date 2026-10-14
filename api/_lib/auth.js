// 관리자 인증: 비밀번호는 .env 의 ADMIN_PASSWORD 에서만 읽는다. 로그인하면 HMAC 서명 쿠키를 준다.
import crypto from 'node:crypto';
import { countHits, addHit, clearHits } from './kv.js';

export const COOKIE_NAME = 'ailo_admin';
const MAX_AGE_SECONDS = 8 * 60 * 60;          // 8시간 뒤 다시 로그인
const MIN_PASSWORD_LENGTH = 8;

/** ADMIN_PASSWORD 가 설정돼 있는지 (없으면 로그인 자체를 막는다) */
export function isConfigured() {
  const password = process.env.ADMIN_PASSWORD;
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

// 서명 키: ADMIN_SESSION_SECRET 이 있으면 그 값, 없으면 비밀번호에서 만든다(비밀번호를 바꾸면 기존 쿠키는 모두 무효).
function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (typeof secret === 'string' && secret.length >= 16) return secret;
  if (!isConfigured()) return null;
  return crypto.createHash('sha256').update(`ailo-admin-session:${process.env.ADMIN_PASSWORD}`).digest('hex');
}

/** 용도별 서명 키 (관리자 쿠키와 회원 쿠키가 서로 바꿔 쓰일 수 없게 용도마다 다른 키) */
export function purposeKey(purpose) {
  const key = signingKey();
  return key ? crypto.createHash('sha256').update(`${purpose}:${key}`).digest('hex') : null;
}

const hmac = (key, payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkPassword(input) {
  if (!isConfigured() || typeof input !== 'string') return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(input), digest(process.env.ADMIN_PASSWORD));
}

/** 토큰 형식: v1.<만료 유닉스초>.<무작위>.<서명> */
export function createToken(now = Date.now()) {
  const key = signingKey();
  if (!key) throw new Error('ADMIN_PASSWORD is not configured');
  const expires = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const payload = `v1.${expires}.${crypto.randomBytes(12).toString('base64url')}`;
  return `${payload}.${hmac(key, payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  const key = signingKey();
  if (!key || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const payload = parts.slice(0, 3).join('.');
  if (!safeEqual(parts[3], hmac(key, payload))) return false;
  const expires = Number(parts[1]);
  return Number.isFinite(expires) && expires > Math.floor(now / 1000);
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

/** 요청에 유효한 관리자 쿠키가 있는가 */
export function isAuthed(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket && req.socket.encrypted);

export function setSessionCookie(req, res, token) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}${secure}`);
}

export function clearSessionCookie(req, res) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

/** 값을 바꾸는 요청은 같은 사이트에서 온 것만 받는다 (다른 사이트가 몰래 보내는 요청 차단) */
export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// 로그인 실패 제한: 같은 주소에서 10분 안에 5번 틀리면 10분간 막는다. (배포에서는 Redis 에 센다)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
export const clientKey = req => String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'local').split(',')[0].trim();

export async function isLockedOut(req) { return (await countHits('login', clientKey(req))) >= MAX_FAILURES; }
export async function recordFailure(req) { await addHit('login', clientKey(req), WINDOW_MS); }
export async function clearFailures(req) { await clearHits('login', clientKey(req)); }

/** JSON 응답 (관리자 응답은 저장·색인 금지) */
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

/** JSON 본문 읽기 (10KB 제한). Vercel 처럼 이미 파싱된 req.body 가 있으면 그대로 쓴다. */
export async function readJson(req, limit = 10 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (!String(req.headers['content-type'] || '').includes('application/json')) return null;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}
