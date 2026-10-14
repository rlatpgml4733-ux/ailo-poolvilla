// 카카오 로그인 점검 — 테스트 서버(8797, --kakao-base http://localhost:8800 --toss-base http://localhost:8798)에서만.
// 이 스크립트가 8800에 가짜 카카오, 8798에 가짜 토스를 띄운다.  사용: node tests/kakao-auth.test.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://localhost:8797';
if (new URL(BASE).port === '8796') { console.error('✘ 8796(실제 데이터) 서버에서는 테스트를 돌리지 않습니다.'); process.exit(2); }
const ORIGIN = new URL(BASE).origin;
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const DATA_FILE = path.join(ROOT, 'data-test', 'admin-store.json');

// 지난 실행에서 이 테스트가 만든 회원·예약만 걷어 낸다
if (fs.existsSync(DATA_FILE)) {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  data.members = (data.members || []).filter(m => !['k-9001', 'k-9002'].includes(m.id));
  data.bookings = (data.bookings || []).filter(b => b.name !== '카카오 테스트');
  data.orders = (data.orders || []).filter(o => o.name !== '카카오 테스트');
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── 가짜 카카오: code 'user1' → 회원 9001, 'user2' → 9002 ──
const kakaoCalls = [];
const USERS = { user1: { id: 9001, nickname: '바다손님' }, user2: { id: 9002, nickname: '다른손님' } };
const kakao = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const url = new URL(req.url, 'http://x');
  kakaoCalls.push({ path: url.pathname, auth: req.headers.authorization || '', body: raw });
  if (url.pathname === '/oauth/token') {
    const form = new URLSearchParams(raw);
    if (form.get('client_secret') !== env.KAKAO_CLIENT_SECRET || form.get('client_id') !== env.KAKAO_REST_KEY) return reply(401, { error: 'invalid_client', error_code: 'KOE010' });
    if (!USERS[form.get('code')]) return reply(400, { error: 'invalid_grant', error_code: 'KOE320' });
    return reply(200, { access_token: `tok-${form.get('code')}`, token_type: 'bearer' });
  }
  const user = Object.entries(USERS).find(([code]) => req.headers.authorization === `Bearer tok-${code}`)?.[1];
  if (!user) return reply(401, { code: -401 });
  if (url.pathname === '/v2/user/me') return reply(200, { id: user.id, kakao_account: { profile: { nickname: user.nickname } } });
  if (url.pathname === '/v1/user/unlink') return reply(200, { id: user.id });
  return reply(404, {});
});
await new Promise(r => kakao.listen(8800, r));
// ── 가짜 토스 (결제 승인만) ──
const toss = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'DONE', orderId: body.orderId, totalAmount: body.amount, method: '카드', approvedAt: new Date().toISOString() }));
});
await new Promise(r => toss.listen(8798, r));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const req = (p, { method = 'GET', body, cookie, origin = method === 'GET' ? null : ORIGIN } = {}) => fetch(BASE + p, {
  method, redirect: 'manual',
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, location: r.headers.get('location') || '', cookies: r.headers.getSetCookie(), body: await r.json().catch(() => ({})) }));
const pick = (cookies, name) => (cookies.find(c => c.startsWith(`${name}=`)) || '').split(';')[0];

// 카카오 로그인 한 바퀴: login → (카카오) → callback
async function signIn(code, next = '/booking.html') {
  const start = await req(`/api/auth/kakao/login?next=${encodeURIComponent(next)}`);
  const state = new URL(start.location).searchParams.get('state');
  const back = await req(`/api/auth/kakao/callback?code=${code}&state=${state}`, { cookie: pick(start.cookies, 'ailo_kakao_state') });
  return { start, back, cookie: pick(back.cookies, 'ailo_member') };
}

try {
  // 1) 카카오로 보내기
  const start = await req('/api/auth/kakao/login?next=/booking.html');
  const go = new URL(start.location);
  check('로그인 → 카카오 인증 주소로 302', start.status === 302 && go.pathname === '/oauth/authorize');
  check('REST 키 · 콜백 주소(/api/auth/kakao/callback) · state 포함', go.searchParams.get('client_id') === env.KAKAO_REST_KEY && go.searchParams.get('redirect_uri') === `${ORIGIN}/api/auth/kakao/callback` && go.searchParams.get('state')?.length >= 20);
  check('state 쿠키는 HttpOnly', /HttpOnly/.test(start.cookies.find(c => c.startsWith('ailo_kakao_state=')) || ''));

  // 2) 위조 막기
  const forged = await req('/api/auth/kakao/callback?code=user1&state=forged', { cookie: pick(start.cookies, 'ailo_kakao_state') });
  check('state 가 다르면 로그인 안 됨', forged.status === 302 && forged.location.includes('login=expired') && !pick(forged.cookies, 'ailo_member'));
  const evil = await signIn('user1', 'https://evil.example/steal');
  check('다른 사이트로 튕겨 보내기 차단 → /my.html', evil.back.location === '/my.html');

  // 3) 정상 로그인
  const u1 = await signIn('user1', '/booking.html?villa=reef');
  check('로그인 성공 → 원래 보던 화면으로', u1.back.status === 302 && u1.back.location === '/booking.html?villa=reef');
  check('회원 쿠키 발급 (HttpOnly · SameSite=Lax)', u1.cookie && /HttpOnly/.test(u1.back.cookies.join()) && /SameSite=Lax/.test(u1.back.cookies.join()));
  check('토큰 요청에 시크릿 키 사용', kakaoCalls.some(c => c.path === '/oauth/token' && c.body.includes('client_secret=')));
  check('내 정보 → 닉네임', (await req('/api/auth/me', { cookie: u1.cookie })).body.member?.nickname === '바다손님');
  check('쿠키 위조 → 로그인 안 된 상태', (await req('/api/auth/me', { cookie: u1.cookie.replace(/.$/, c => (c === 'A' ? 'B' : 'A')) })).body.member === null);
  check('회원번호를 바꾼 쿠키 → 거절', (await req('/api/auth/me', { cookie: u1.cookie.replace('k-9001', 'k-9002') })).body.member === null);

  // 4) 저장 내용: 회원번호·닉네임만, 토큰 없음
  const stored = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const m = stored.members.find(x => x.id === 'k-9001');
  check('저장: 회원번호 · 닉네임만 (비밀번호 · 토큰 없음)', m && m.kakaoId === '9001' && m.nickname === '바다손님' && !JSON.stringify(stored).includes('tok-user') && !('password' in m));

  // 5) 로그인하고 예약 → 그 회원 예약
  let dates;
  for (let off = 3; off < 60 && !dates; off++) {
    const a = new Date(Date.now() + 9 * 3600e3 + off * 864e5).toISOString().slice(0, 10), b = new Date(Date.now() + 9 * 3600e3 + (off + 1) * 864e5).toISOString().slice(0, 10);
    if ((await req(`/api/payments/quote?villa=both&guests=7&in=${a}&out=${b}`)).status === 200) {
      const o = await req('/api/payments/prepare', { method: 'POST', cookie: u1.cookie, body: { villa: 'both', guests: 7, in: a, out: b, name: '카카오 테스트', phone: '01033334444', consentPrivacy: true, consentRefund: true } });
      if (o.status === 200) dates = { a, b, order: o.body };
    }
  }
  const paid = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_kakao', orderId: dates.order.orderId, amount: dates.order.amount } });
  check('회원으로 결제 완료', paid.status === 200);
  const mine = await req('/api/my/bookings', { cookie: u1.cookie });
  check("'내 예약'에 내 예약이 보임", mine.status === 200 && mine.body.bookings.some(b => b.checkIn === dates.a && b.paid));
  check("'내 예약'에는 내 것만 (예시·다른 사람 예약 없음)", mine.body.bookings.every(b => b.name === '카카오 테스트'));
  const u2 = await signIn('user2');
  check('다른 회원에게는 안 보임', (await req('/api/my/bookings', { cookie: u2.cookie })).body.bookings.length === 0);
  check('로그인 안 하면 내 예약 → 401', (await req('/api/my/bookings')).status === 401);
  const login = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) });
  const admin = (login.headers.get('set-cookie') || '').split(';')[0];
  const row = (await req('/api/admin/items', { cookie: admin })).body.bookings.find(b => b.orderId === dates.order.orderId);
  check('관리자 목록에 카카오 닉네임', row && row.memberNickname === '바다손님');

  // 6) 로그아웃
  const out = await req('/api/auth/logout', { method: 'POST', cookie: u2.cookie });
  check('로그아웃 → 쿠키 지움', out.status === 200 && /ailo_member=;.*Max-Age=0/.test(out.cookies.join()));

  // 7) 탈퇴
  check('다른 사이트에서 탈퇴 요청 → 403', (await req('/api/auth/withdraw', { method: 'POST', cookie: u1.cookie, origin: 'https://evil.example' })).status === 403);
  check('로그인 안 하고 탈퇴 → 401', (await req('/api/auth/withdraw', { method: 'POST' })).status === 401);
  const w = await req('/api/auth/withdraw', { method: 'POST', cookie: u1.cookie });
  const wUrl = new URL(w.body.url);
  check('탈퇴 시작 → 카카오 재로그인(prompt=login)', w.status === 200 && wUrl.searchParams.get('prompt') === 'login');
  const wrong = await req(`/api/auth/kakao/callback?code=user2&state=${wUrl.searchParams.get('state')}`, { cookie: `${u1.cookie}; ${pick(w.cookies, 'ailo_kakao_state')}` });
  check('다른 카카오 계정으로 확인하면 탈퇴 안 함', wrong.location.includes('withdraw=mismatch') && !kakaoCalls.some(c => c.path === '/v1/user/unlink'));
  const w2 = await req('/api/auth/withdraw', { method: 'POST', cookie: u1.cookie });
  const s2 = new URL(w2.body.url).searchParams.get('state');
  const done = await req(`/api/auth/kakao/callback?code=user1&state=${s2}`, { cookie: `${u1.cookie}; ${pick(w2.cookies, 'ailo_kakao_state')}` });
  check('본인 확인 → 카카오 연결 끊기 + 탈퇴 완료', done.location.includes('withdrawn=1') && kakaoCalls.some(c => c.path === '/v1/user/unlink' && c.auth === 'Bearer tok-user1'));
  const after = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const kept = after.bookings.find(b => b.orderId === dates.order.orderId);
  check('회원 정보 삭제', !after.members.some(x => x.id === 'k-9001'));
  check('예약은 남기되 회원 연결만 뗌', kept && !kept.memberId && !kept.memberNickname && kept.name === '카카오 테스트');
  check('탈퇴 후 옛 쿠키로 내 예약 → 401', (await req('/api/my/bookings', { cookie: u1.cookie })).status === 401);
  check('카카오에서 취소하고 돌아오면 → 안내', (await (async () => { const s = await req('/api/auth/kakao/login'); const st = new URL(s.location).searchParams.get('state'); return req(`/api/auth/kakao/callback?error=access_denied&state=${st}`, { cookie: pick(s.cookies, 'ailo_kakao_state') }); })()).location.includes('login=cancel'));
} finally {
  kakao.close(); toss.close();
}
console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
