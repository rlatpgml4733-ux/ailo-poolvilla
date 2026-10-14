// 예약 문의 API 점검 — 테스트 서버(8797)에서만.  사용: node tests/inquiry-api.test.mjs [http://localhost:8797]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://localhost:8797';
if (new URL(BASE).port === '8796') { console.error('✘ 8796(실제 데이터) 서버에서는 테스트를 돌리지 않습니다.'); process.exit(2); }
const ORIGIN = new URL(BASE).origin;
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const send = (body, { origin = ORIGIN, forwardedFor } = {}) => fetch(BASE + '/api/inquiries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) },
  body: JSON.stringify(body),
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const good = { name: '테스트 손님', phone: '010-2222-3333', checkIn: '2026-10-20', checkOut: '2026-10-22', guests: 3, message: '아이 둘과 가는데 풀 수심 괜찮을까요?', consent: true };

// 서버 재검사 (각각 다른 주소처럼 보내 도배 제한에 안 걸리게)
check('동의 안 함 → 400', (await send({ ...good, consent: false }, { forwardedFor: '10.0.0.1' })).status === 400);
check('휴대폰 형식 틀림 → 400', (await send({ ...good, phone: '1234' }, { forwardedFor: '10.0.0.2' })).status === 400);
check('문의 내용 너무 짧음 → 400', (await send({ ...good, message: '?' }, { forwardedFor: '10.0.0.3' })).status === 400);
check('체크아웃이 체크인보다 앞 → 400', (await send({ ...good, checkIn: '2026-10-22', checkOut: '2026-10-20' }, { forwardedFor: '10.0.0.4' })).status === 400);
check('인원 범위 밖(11인) → 400', (await send({ ...good, guests: 11 }, { forwardedFor: '10.0.0.5' })).status === 400);
check('다른 사이트에서 보낸 문의 → 403', (await send(good, { origin: 'https://evil.example', forwardedFor: '10.0.0.6' })).status === 403);

// 정상 접수 → 문의번호
const ok = await send(good, { forwardedFor: '10.0.0.7' });
check('정상 문의 → 200 + 문의번호', ok.status === 200 && /^AQ-\d{6}-[0-9A-F]{4}$/.test(ok.body.number), ok.body.number);
const onlyNeed = await send({ name: '날짜 없음', phone: '01044445555', message: '바비큐 숯도 준비되나요?', consent: true }, { forwardedFor: '10.0.0.8' });
check('희망 날짜·인원 없이도 접수', onlyNeed.status === 200);

// 스팸(숨은 칸 채움) → 저장 안 함
const spam = await send({ ...good, name: '스팸봇', website: 'http://spam.example' }, { forwardedFor: '10.0.0.9' });

// 관리자 목록에 보이는지
const login = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const list = (await (await fetch(BASE + '/api/admin/items', { headers: { Cookie: cookie } })).json()).inquiries;
const saved = list.find(q => q.number === ok.body.number);
check('관리자 문의 목록에 "신규"로 들어감', saved && saved.status === 'new' && saved.guests === 3 && saved.checkIn === '2026-10-20');
check('동의 시각 기록', saved && typeof saved.consentAt === 'string');
check('스팸은 저장 안 됨', spam.status === 200 && !list.some(q => q.name === '스팸봇'));
check('문의 목록은 로그인 없이 못 봄 → 401', (await fetch(BASE + '/api/admin/items')).status === 401);

// 도배 제한: 같은 곳에서 10분에 5건
let limited = false;
for (let i = 0; i < 7; i++) {
  const r = await send({ ...good, message: `연속 문의 테스트 ${i}` }, { forwardedFor: '10.9.9.9' });
  if (r.status === 429) { limited = true; break; }
}
check('같은 곳에서 연속 6건째 → 429', limited);

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
