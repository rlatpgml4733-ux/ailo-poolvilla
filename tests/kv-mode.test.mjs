// Vercel(Redis) 모드 점검: 가짜 Upstash REST 서버(8799)와 그걸 쓰는 개발 서버(8791)를 직접 띄워서 확인한다.
// 실제 데이터(8796)·로컬 JSON 파일은 건드리지 않는다.  사용: node tests/kv-mode.test.mjs
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const MOCK_PORT = 8799, PORT = 8791, BASE = `http://localhost:${PORT}`, ORIGIN = BASE;

// ── 가짜 Upstash (필요한 명령만) ──
const kv = new Map();   // key → { value, until }
const live = key => { const e = kv.get(key); if (e && e.until && e.until <= Date.now()) { kv.delete(key); return null; } return e || null; };
let commands = 0;
const mock = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.headers.authorization !== 'Bearer mock-token') return reply(401, { error: 'unauthorized' });
  const [cmd, ...a] = JSON.parse(raw); commands++;
  switch (cmd.toUpperCase()) {
    case 'GET': return reply(200, { result: live(a[0])?.value ?? null });
    case 'SET': {
      const nx = a.includes('NX'); const px = a.indexOf('PX');
      if (nx && live(a[0])) return reply(200, { result: null });
      kv.set(a[0], { value: a[1], until: px > 0 ? Date.now() + Number(a[px + 1]) : 0 });
      return reply(200, { result: 'OK' });
    }
    case 'DEL': return reply(200, { result: kv.delete(a[0]) ? 1 : 0 });
    case 'INCR': { const e = live(a[0]); const n = (Number(e?.value) || 0) + 1; kv.set(a[0], { value: String(n), until: e?.until || 0 }); return reply(200, { result: n }); }
    case 'PEXPIRE': { const e = live(a[0]); if (e) e.until = Date.now() + Number(a[1]); return reply(200, { result: e ? 1 : 0 }); }
    case 'EVAL': { const key = a[2], token = a[3]; if (live(key)?.value === token) { kv.delete(key); return reply(200, { result: 1 }); } return reply(200, { result: 0 }); }
    default: return reply(400, { error: `unsupported ${cmd}` });
  }
});
await new Promise(r => mock.listen(MOCK_PORT, r));

const server = spawn(process.execPath, ['dev-server.mjs', '--port', String(PORT), '--data', 'data-test/kv-unused.json'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, KV_REST_API_URL: `http://localhost:${MOCK_PORT}`, KV_REST_API_TOKEN: 'mock-token' },
});
for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/popup'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const req = (p, { method = 'GET', body, cookie, ip } = {}) => fetch(BASE + p, {
  method, headers: { ...(body ? { 'Content-Type': 'application/json', Origin: ORIGIN } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) }));

try {
  // 1) 처음 읽으면 예시 데이터가 Redis 에 들어감
  check('공개 팝업 API 동작', (await req('/api/popup')).status === 200);
  check('저장소가 Redis 키에 저장됨', kv.has('ailo:store') && JSON.parse(kv.get('ailo:store').value).bookings.length >= 1);
  check('로컬 JSON 파일은 안 만듦', !fs.existsSync(path.join(ROOT, 'data-test', 'kv-unused.json')));

  // 2) 문의 → Redis 에 저장 → 관리자 목록
  const q = await req('/api/inquiries', { method: 'POST', ip: '10.1.1.1', body: { name: 'KV 손님', phone: '01012345678', message: 'Redis 모드 문의 테스트입니다', consent: true } });
  check('문의 접수', q.status === 200 && /^AQ-/.test(q.body.number));
  const login = await req('/api/admin/login', { method: 'POST', ip: '10.1.1.2', body: { password: env.ADMIN_PASSWORD } });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const items = await req('/api/admin/items', { cookie });
  check('관리자 목록에 Redis 문의가 보임', items.body.inquiries?.some(i => i.number === q.body.number));

  // 3) 동시에 같은 날짜 주문 10건 → 잠금 덕분에 딱 1건만 성공
  let dates;
  for (let off = 3; off < 60 && !dates; off++) {
    const a = new Date(Date.now() + 9 * 3600e3 + off * 864e5).toISOString().slice(0, 10), b = new Date(Date.now() + 9 * 3600e3 + (off + 1) * 864e5).toISOString().slice(0, 10);
    if ((await req(`/api/payments/quote?villa=cove&guests=2&in=${a}&out=${b}`)).status === 200 && !(await req('/api/availability')).body.cove.includes(a)) dates = { in: a, out: b };
  }
  const body = { villa: 'cove', guests: 2, ...dates, name: 'KV 손님', phone: '01012345678', consentPrivacy: true, consentRefund: true };
  const results = await Promise.all(Array.from({ length: 10 }, () => req('/api/payments/prepare', { method: 'POST', body })));
  const okCount = results.filter(r => r.status === 200).length, conflict = results.filter(r => r.status === 409).length;
  check('동시 주문 10건 → 1건만 성공, 9건 409', okCount === 1 && conflict === 9, `성공 ${okCount} · 409 ${conflict}`);
  check('달력 API에 잡힌 날짜', (await req('/api/availability')).body.cove.includes(dates.in));
  check('잠금은 끝나면 풀림', !kv.has('ailo:store:lock'));

  // 3-2) 팝업 이미지도 Redis 에 (Render 처럼 파일이 지워지는 서버용)
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await req('/api/admin/popups', { method: 'POST', cookie, body: { image: `data:image/png;base64,${png.toString('base64')}`, alt: 'KV 팝업', link: '', active: true } });
  const popupId = up.body.popup?.id;
  check('팝업 업로드 → Redis 이미지 키', up.status === 200 && kv.has(`ailo:popup-image:${popupId}`));
  const img = await fetch(`${BASE}/api/popup-image?id=${popupId}`);
  check('팝업 이미지 읽기 (같은 바이트)', img.status === 200 && Buffer.from(await img.arrayBuffer()).equals(png));
  await req('/api/admin/popups', { method: 'DELETE', cookie, body: { id: popupId } });
  check('팝업 삭제 → 이미지 키도 삭제', !kv.has(`ailo:popup-image:${popupId}`));

  // 4) 로그인 실패 제한도 Redis 에서 셈 (서버가 여러 대여도 같이 막힘)
  for (let i = 0; i < 5; i++) await req('/api/admin/login', { method: 'POST', ip: '10.7.7.7', body: { password: 'wrong-password' } });
  check('5번 틀리면 6번째는 429', (await req('/api/admin/login', { method: 'POST', ip: '10.7.7.7', body: { password: env.ADMIN_PASSWORD } })).status === 429);
  check('실패 횟수가 Redis 에 만료시간과 함께 저장', live('ailo:hits:login:10.7.7.7')?.until > Date.now());
  check('다른 주소는 영향 없음', (await req('/api/admin/login', { method: 'POST', ip: '10.7.7.8', body: { password: env.ADMIN_PASSWORD } })).status === 200);
} finally {
  server.kill();
  mock.close();
}
console.log(`\n결과: 통과 ${pass} · 실패 ${fail} (Redis 명령 ${commands}회)`);
process.exit(fail ? 1 : 0);
