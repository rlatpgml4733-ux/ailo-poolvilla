// 관리자 API 보안 점검. 실행 중인 개발 서버에 요청을 보내 확인한다.
// 사용: node tests/admin-api.test.mjs [http://localhost:8797]  (테스트 전용 서버)   (비밀번호는 .env 에서 읽고 화면에 출력하지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://localhost:8797';
// 안전장치: 실제 데이터가 있는 사장님 서버(8796)에서는 돌지 않는다. 테스트 서버: node dev-server.mjs --port 8797 --data data-test/admin-store.json
if (new URL(BASE).port === '8796') { console.error('✘ 8796(실제 데이터) 서버에서는 테스트를 돌리지 않습니다. 테스트 서버(8797)를 쓰세요.'); process.exit(2); }
const ORIGIN = new URL(BASE).origin;
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const PASSWORD = process.env.ADMIN_PASSWORD;
const { createToken } = await import(new URL('../api/_lib/auth.js', import.meta.url));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const req = (p, { method = 'GET', body, cookie, origin } = {}) => fetch(BASE + p, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
  body: body ? JSON.stringify(body) : undefined,
  redirect: 'manual',
});

// 1) 쿠키 없이 → 전부 거절
check('쿠키 없이 목록 요청 → 401', (await req('/api/admin/items')).status === 401);
check('쿠키 없이 상태 변경 → 401', (await req('/api/admin/status', { method: 'POST', origin: ORIGIN, body: { type: 'booking', id: 'b-1001', status: 'confirmed' } })).status === 401);
check('세션 확인은 로그인 여부만 (false)', (await (await req('/api/admin/session')).json()).loggedIn === false);

// 2) 로그인
check('틀린 비밀번호 → 401', (await req('/api/admin/login', { method: 'POST', origin: ORIGIN, body: { password: 'wrong-password' } })).status === 401);
check('다른 사이트에서 온 로그인 요청 → 403', (await req('/api/admin/login', { method: 'POST', origin: 'https://evil.example', body: { password: PASSWORD } })).status === 403);
const login = await req('/api/admin/login', { method: 'POST', origin: ORIGIN, body: { password: PASSWORD } });
const setCookie = login.headers.get('set-cookie') || '';
const cookie = setCookie.split(';')[0];
check('맞는 비밀번호 → 200', login.status === 200);
check('쿠키: HttpOnly · SameSite=Strict · Path=/', /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Path=\//.test(setCookie));
check('쿠키에 비밀번호가 들어 있지 않음', !setCookie.includes(PASSWORD));
check('쿠키 형식 v1.만료.무작위.서명', /^ailo_admin=v1\.\d+\.[\w-]+\.[\w-]+$/.test(cookie));

// 3) 쿠키 있으면 허용
const items = await req('/api/admin/items', { cookie });
const list = items.status === 200 ? await items.json() : {};
check('쿠키로 목록 요청 → 200', items.status === 200, `예약 ${list.bookings?.length ?? 0}건 · 문의 ${list.inquiries?.length ?? 0}건`);
const target = list.bookings?.[0];
const original = target?.status;
const next = original === 'confirmed' ? 'new' : 'confirmed';
const change = await req('/api/admin/status', { method: 'POST', cookie, origin: ORIGIN, body: { type: 'booking', id: target?.id, status: next } });
const afterList = await (await req('/api/admin/items', { cookie })).json();
check('쿠키로 상태 변경 → 200, 저장됨', change.status === 200 && afterList.bookings.find(b => b.id === target.id)?.status === next);
await req('/api/admin/status', { method: 'POST', cookie, origin: ORIGIN, body: { type: 'booking', id: target?.id, status: original } });  // 원래대로
check('없는 상태 값 → 400', (await req('/api/admin/status', { method: 'POST', cookie, origin: ORIGIN, body: { type: 'booking', id: target?.id, status: 'deleted' } })).status === 400);
check('쿠키가 있어도 다른 사이트에서 온 변경 → 403', (await req('/api/admin/status', { method: 'POST', cookie, origin: 'https://evil.example', body: { type: 'booking', id: target?.id, status: next } })).status === 403);

// 4) 위조·만료 쿠키 → 거절
const token = cookie.split('=')[1];
const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
check('서명을 바꾼 쿠키 → 401', (await req('/api/admin/items', { cookie: `ailo_admin=${tampered}` })).status === 401);
const [v, exp, nonce, sig] = token.split('.');
check('만료 시각만 늘린 쿠키 → 401', (await req('/api/admin/items', { cookie: `ailo_admin=${v}.${Number(exp) + 99999}.${nonce}.${sig}` })).status === 401);
const expired = createToken(Date.now() - 9 * 3600 * 1000);
check('만료된 쿠키 → 401', (await req('/api/admin/items', { cookie: `ailo_admin=${expired}` })).status === 401);

// 5) 로그아웃
const logout = await req('/api/admin/logout', { method: 'POST', cookie, origin: ORIGIN });
check('로그아웃 → 쿠키 삭제(Max-Age=0)', logout.status === 200 && /Max-Age=0/.test(logout.headers.get('set-cookie') || ''));

// 6) 페이지·코드 점검
const adminPage = await fetch(BASE + '/admin');
check('/admin 페이지 열림 + 검색 제외(noindex)', adminPage.status === 200 && /noindex/.test(await adminPage.text()));
const home = await (await fetch(BASE + '/')).text();
const booking = await (await fetch(BASE + '/booking.html')).text();
check('사이트 메뉴·본문에 /admin 링크 없음', !/href="[^"]*admin/i.test(home) && !/href="[^"]*admin/i.test(booking));
const codeFiles = ['api/_lib/auth.js', 'api/_lib/store.js', 'api/admin/login.js', 'api/admin/status.js', 'site/admin/admin.js', 'site/admin/index.html', 'dev-server.mjs'];
check('코드 어디에도 비밀번호 값이 없음', codeFiles.every(f => !fs.readFileSync(path.join(ROOT, f), 'utf8').includes(PASSWORD)));

// 7) 로그인 실패 제한 (마지막에: 이 주소가 10분간 잠기므로 서버를 다시 켜면 풀린다)
let locked = false;
for (let i = 0; i < 6; i++) {
  const r = await req('/api/admin/login', { method: 'POST', origin: ORIGIN, body: { password: `wrong-${i}` } });
  if (r.status === 429) { locked = true; break; }
}
check('비밀번호를 연속으로 틀리면 잠김 → 429', locked);

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
