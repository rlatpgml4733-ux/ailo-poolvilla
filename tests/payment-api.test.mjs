// 결제 흐름 점검 — 테스트 서버(8797, --toss-base http://localhost:8798)에 대고 돌린다.
// 이 스크립트가 8798에 "가짜 토스 서버"를 띄워 승인·거절·금액 위조 상황을 만든다.
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

// ── 가짜 토스 서버 ──
const calls = [];
const mock = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  calls.push({ path: req.url, auth: req.headers.authorization || '', body });
  const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (req.url.endsWith('/cancel')) return reply(200, { status: 'CANCELED' });
  const key = String(body.paymentKey);
  if (key.startsWith('fail_')) return reply(400, { code: 'REJECT_CARD_COMPANY', message: '카드사에서 결제를 거절했습니다.' });
  const totalAmount = key.startsWith('tamper_') ? body.amount + 1000 : body.amount;
  return reply(200, { status: 'DONE', orderId: body.orderId, totalAmount, method: '카드', approvedAt: new Date().toISOString(),
    card: { number: '43301234****123*', issuerCode: '71' }, receipt: { url: 'https://example.test/receipt' } });
});
await new Promise(r => mock.listen(8798, r));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const req = (p, { method = 'GET', body, origin = ORIGIN, cookie } = {}) => fetch(BASE + p, {
  method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// 지난번 실행에서 이 테스트가 만든 예약·주문만 테스트 데이터에서 걷어 낸다 (날짜가 계속 차지 않게)
const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeData = data => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
if (fs.existsSync(DATA_FILE)) {
  const data = readData();
  data.bookings = (data.bookings || []).filter(b => b.name !== '테스트 손님');
  data.orders = (data.orders || []).filter(o => o.name !== '테스트 손님');
  writeData(data);
}
// 주문 시각을 n분 앞으로 돌린다 (10분 잡아 두기 확인용, 테스트 서버 데이터에서 이 테스트의 주문만)
const rewind = (orderId, minutes) => {
  const data = readData();
  const order = data.orders.find(o => o.orderId === orderId);
  order.createdAt = new Date(Date.now() - minutes * 60e3).toISOString();
  writeData(data);
};

// 예약 가능한 날짜 찾기 (서로 겹치지 않게 하나씩 꺼내 쓴다)
const free = [];
for (let off = 1; off < 90 && free.length < 12; off++) {
  const d = new Date(Date.now() + 9 * 3600e3 + off * 864e5).toISOString().slice(0, 10);
  const n = new Date(Date.now() + 9 * 3600e3 + (off + 1) * 864e5).toISOString().slice(0, 10);
  const q = await req(`/api/payments/quote?villa=reef&guests=2&in=${d}&out=${n}`);
  if (q.status === 200) { free.push({ in: d, out: n, total: q.body.total }); off++; }
}
const nextDates = () => free.shift();
const customer = { name: '테스트 손님', phone: '010-1234-5678', consentPrivacy: true, consentRefund: true };
const prepare = (dates, extra = {}) => req('/api/payments/prepare', { method: 'POST', body: { villa: 'reef', guests: 2, ...dates, ...customer, ...extra } });

// 1) 금액은 서버 계산
check('잘못된 독채 → 400', (await req('/api/payments/quote?villa=penthouse&guests=2&in=2030-01-01&out=2030-01-02')).status === 400);
const d1 = nextDates();
const o1 = await prepare(d1, { amount: 1 });   // 브라우저가 금액을 보내도 무시
check('주문 금액 = 서버 계산 금액 (보낸 금액 무시)', o1.status === 200 && o1.body.amount === d1.total, `${o1.body.amount}원`);
check('다른 사이트에서 온 주문 → 403', (await req('/api/payments/prepare', { method: 'POST', origin: 'https://evil.example', body: { villa: 'reef', guests: 2, ...nextDates(), ...customer } })).status === 403);
check('휴대폰 번호 형식 틀림 → 400', (await prepare(free[0], { phone: '12345' })).status === 400);

// 1-2) 동의는 서버에서도 확인
const nc1 = await prepare(free[0], { consentPrivacy: false });
check('개인정보 동의 안 함 → 400', nc1.status === 400 && /개인정보/.test(nc1.body.error || ''));
const nc2 = await prepare(free[0], { consentRefund: undefined });
check('환불 규정 동의 안 함 → 400', nc2.status === 400 && /환불/.test(nc2.body.error || ''));
check('동의를 문자열 "true"로 보내도 → 400', (await prepare(free[0], { consentPrivacy: 'true' })).status === 400);

// 2) 성공 화면 금액이 서버 금액과 다르면 → 토스 승인 자체를 하지 않음
const before = calls.length;
const mm = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_mismatch', orderId: o1.body.orderId, amount: o1.body.amount + 100 } });
check('금액 위조 → 400, 토스 승인 호출 안 함', mm.status === 400 && calls.length === before);

// 3) 정상 결제 → 토스 승인(서버 금액) → 금액 일치 → 확정
const d2 = nextDates();
const o2 = await prepare(d2);
const ok = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_123', orderId: o2.body.orderId, amount: o2.body.amount } });
const confirmCall = calls.find(c => c.body.paymentKey === 'ok_123');
check('정상 결제 → 200 확정', ok.status === 200 && ok.body.ok === true);
check('토스 승인 API에 서버 금액으로 요청 + 시크릿 키 인증', confirmCall && confirmCall.body.amount === o2.body.amount && confirmCall.auth.startsWith('Basic '));
const again = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_123', orderId: o2.body.orderId, amount: o2.body.amount } });
check('성공 화면 새로고침 → 같은 결과, 중복 승인 없음', again.status === 200 && calls.filter(c => c.body.paymentKey === 'ok_123').length === 1);

// 4) 관리자 예약 목록에 결제 완료로 들어감
const login = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const items = await req('/api/admin/items', { cookie });
const booked = items.body.bookings?.find(b => b.orderId === o2.body.orderId);
check('관리자 예약 목록에 "결제 완료"로 표시', booked && booked.payment.status === 'paid' && booked.total === o2.body.amount);
check('예약에 동의 시각 기록', booked && typeof booked.consent?.privacyAt === 'string' && typeof booked.consent?.refundAt === 'string');

// 4-2) 달력용 공개 API: 결제된 날짜가 마감으로 나옴, 개인정보는 없음
const avail = await req('/api/availability');
check('달력 API에 결제된 밤이 들어감', avail.status === 200 && avail.body.reef.includes(d2.in) && !avail.body.reef.includes(d2.out));
check('달력 API에는 날짜만 (이름·연락처 없음)', !JSON.stringify(avail.body).includes('테스트') && !JSON.stringify(avail.body).includes('010'));

// 5) 카드번호 저장 안 함
const stored = fs.readFileSync(DATA_FILE, 'utf8');
check('저장 파일에 카드 정보 없음', !stored.includes('43301234') && !/"card"/.test(stored) && !/issuerCode/.test(stored));

// 6) 같은 날짜 다시 예약 → 막힘
check('이미 결제된 날짜 → 409', (await prepare(d2)).status === 409);

// 7) 토스는 승인했는데 금액이 다름 → 확정 안 하고 즉시 결제 취소
const o3 = await prepare(nextDates());
const tamper = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'tamper_1', orderId: o3.body.orderId, amount: o3.body.amount } });
check('승인 금액 불일치 → 400 + 결제 자동 취소', tamper.status === 400 && calls.some(c => c.path.includes('tamper_1') && c.path.endsWith('/cancel')));
check('불일치 주문은 예약에 안 들어감', !(await req('/api/admin/items', { cookie })).body.bookings.some(b => b.orderId === o3.body.orderId));

// 8) 카드사 거절
const o4 = await prepare(nextDates());
const rej = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'fail_1', orderId: o4.body.orderId, amount: o4.body.amount } });
check('카드사 거절 → 400 + 토스 안내 문구 전달', rej.status === 400 && /거절/.test(rej.body.error || ''));

// 9) 취소 화면 → 잡아 둔 날짜 풀림
const d5 = nextDates();
const o5 = await prepare(d5);
check('결제 진행 중인 날짜는 다른 주문이 못 잡음 → 409', (await prepare(d5)).status === 409);
await req('/api/payments/stop', { method: 'POST', body: { orderId: o5.body.orderId, code: 'PAY_PROCESS_CANCELED' } });
check('취소하면 그 날짜 다시 예약 가능', (await prepare(d5)).status === 200);

// 9-2) 결제 전 날짜 잡아 두기는 10분
const d6 = nextDates();
const o6 = await prepare(d6);
check('잡아 둔 날짜가 달력 API에도 마감으로', (await req('/api/availability')).body.reef.includes(d6.in));
rewind(o6.body.orderId, 9);
check('9분 지남 → 아직 잡혀 있음 (409)', (await prepare(d6)).status === 409);
rewind(o6.body.orderId, 11);
check('11분 지남 → 날짜 풀림, 다른 주문 가능', (await prepare(d6)).status === 200);
const lateBefore = calls.length;
const late = await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_late', orderId: o6.body.orderId, amount: o6.body.amount } });
check('10분 지나 그 사이 날짜가 잡혔으면 확정 안 함 (409, 토스 승인 호출 안 함)', late.status === 409 && calls.length === lateBefore && /10분/.test(late.body.error || ''));
const o8 = await prepare(nextDates());
rewind(o8.body.orderId, 11);
check('10분 지났어도 날짜가 비어 있으면 결제 확정', (await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_late2', orderId: o8.body.orderId, amount: o8.body.amount } })).status === 200);

// 10) 기타
check('없는 주문 승인 → 404', (await req('/api/payments/confirm', { method: 'POST', body: { paymentKey: 'ok_x', orderId: 'ailo-nope', amount: 1000 } })).status === 404);
const cfg = await req('/api/payments/config');
check('공개 설정에는 클라이언트 키만 (시크릿 키 노출 없음)', cfg.status === 200 && cfg.body.clientKey && !JSON.stringify(cfg.body).includes(env.TOSS_SECRET_KEY));

mock.close();
console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
