// 카카오 회원 로그인: 키는 .env 의 KAKAO_REST_KEY · KAKAO_CLIENT_SECRET.
// 저장하는 건 카카오 회원번호와 닉네임뿐. 비밀번호도, 카카오 토큰도 저장하지 않는다.
// 로그인 상태는 HMAC 서명 쿠키(ailo_member)로 기억한다.
import crypto from 'node:crypto';
import { parseCookies, purposeKey } from './auth.js';

export const MEMBER_COOKIE = 'ailo_member';
const STATE_COOKIE = 'ailo_kakao_state';
const MEMBER_MAX_AGE = 30 * 24 * 3600;   // 30일
const STATE_MAX_AGE = 10 * 60;           // 카카오 다녀오는 데 10분

// 테스트 때만 가짜 카카오 서버로 바꿀 수 있다 (dev-server --kakao-base)
const AUTH_BASE = () => process.env.KAKAO_AUTH_BASE || 'https://kauth.kakao.com';
const API_BASE = () => process.env.KAKAO_API_BASE || 'https://kapi.kakao.com';

export const isKakaoConfigured = () => Boolean(process.env.KAKAO_REST_KEY && process.env.KAKAO_CLIENT_SECRET);

const sign = (purpose, payload) => crypto.createHmac('sha256', purposeKey(purpose)).update(payload).digest('base64url');
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket && req.socket.encrypted);
const cookie = (req, name, value, maxAge, extra = '') =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}${extra}`;

/** 카카오가 로그인 뒤 돌려보낼 주소. 카카오 콘솔에 등록한 주소와 글자 하나까지 같아야 한다 */
export function redirectUri(req) {
  const base = process.env.PUBLIC_BASE_URL || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
  return `${base.replace(/\/$/, '')}/api/auth/kakao/callback`;
}

/** 로그인 뒤 돌아갈 사이트 안 주소만 허용 (다른 사이트로 튕겨 보내기 방지) */
export const safeNext = value => (typeof value === 'string' && /^\/(?![\/\\])[^\s\\]{0,300}$/.test(value) ? value : '/my.html');

/* ── 회원 쿠키 ── 형식: v1.<회원ID>.<만료>.<서명> */
export function memberCookie(req, memberId) {
  const payload = `v1.${memberId}.${Math.floor(Date.now() / 1000) + MEMBER_MAX_AGE}`;
  return cookie(req, MEMBER_COOKIE, `${payload}.${sign('member', payload)}`, MEMBER_MAX_AGE);
}
export const clearMemberCookie = req => cookie(req, MEMBER_COOKIE, '', 0);

/** 쿠키가 유효하면 회원ID, 아니면 null */
export function memberIdFrom(req) {
  if (!purposeKey('member')) return null;
  const parts = String(parseCookies(req)[MEMBER_COOKIE] || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^k-\d{1,20}$/.test(parts[1])) return null;
  if (!safeEqual(parts[3], sign('member', parts.slice(0, 3).join('.')))) return null;
  return Number(parts[2]) > Date.now() / 1000 ? parts[1] : null;
}

/* ── 카카오 다녀오기 ── state 를 쿠키에 서명해 두고, 돌아왔을 때 같은지 확인한다(위조 요청 차단).
   intent: 'login' | 'withdraw'(탈퇴는 카카오에서 한 번 더 확인받은 뒤 연결을 끊는다) */
export function startKakao(req, { intent = 'login', next = '/my.html' } = {}) {
  const state = crypto.randomBytes(16).toString('base64url');
  const payload = `${state}.${intent}.${Buffer.from(safeNext(next)).toString('base64url')}`;
  const params = new URLSearchParams({ response_type: 'code', client_id: process.env.KAKAO_REST_KEY, redirect_uri: redirectUri(req), state });
  if (intent === 'withdraw') params.set('prompt', 'login');   // 탈퇴는 카카오 로그인을 다시 하게 한다
  return {
    url: `${AUTH_BASE()}/oauth/authorize?${params}`,
    cookie: cookie(req, STATE_COOKIE, `${payload}.${sign('kakao-state', payload)}`, STATE_MAX_AGE),
  };
}

/** 돌아온 state 확인. 맞으면 { intent, next } */
export function readState(req, state) {
  const parts = String(parseCookies(req)[STATE_COOKIE] || '').split('.');
  if (parts.length !== 4 || !state || !safeEqual(parts[0], state)) return null;
  if (!safeEqual(parts[3], sign('kakao-state', parts.slice(0, 3).join('.')))) return null;
  if (!['login', 'withdraw'].includes(parts[1])) return null;
  return { intent: parts[1], next: safeNext(Buffer.from(parts[2], 'base64url').toString('utf8')) };
}
export const clearStateCookie = req => cookie(req, STATE_COOKIE, '', 0);

/* ── 카카오 API ── */
export async function exchangeCode(req, code) {
  const response = await fetch(`${AUTH_BASE()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: process.env.KAKAO_REST_KEY, client_secret: process.env.KAKAO_CLIENT_SECRET,
      redirect_uri: redirectUri(req), code: String(code).slice(0, 512),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw Object.assign(new Error('kakao token failed'), { kakao: data.error_code || data.error || response.status });
  return data.access_token;   // 이 요청 안에서만 쓰고 버린다
}

export async function fetchProfile(accessToken) {
  const response = await fetch(`${API_BASE()}/v2/user/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw Object.assign(new Error('kakao profile failed'), { kakao: data.code || response.status });
  const raw = (data.kakao_account && data.kakao_account.profile && data.kakao_account.profile.nickname) || (data.properties && data.properties.nickname) || '';
  const nickname = String(raw).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 30) || '카카오 회원';
  return { kakaoId: String(data.id), nickname };
}

export async function unlink(accessToken) {
  const response = await fetch(`${API_BASE()}/v1/user/unlink`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error('kakao unlink failed');
}

export function redirect(res, location, cookies = []) {
  res.statusCode = 302;
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
