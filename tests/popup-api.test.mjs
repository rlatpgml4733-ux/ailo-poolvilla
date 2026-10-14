// 팝업 API 점검. 사용: node tests/popup-api.test.mjs [http://localhost:8797]  (테스트 전용 서버)  (비밀번호는 .env 에서 읽고 출력하지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://localhost:8797';
// 안전장치: 실제 데이터가 있는 사장님 서버(8796)에서는 돌지 않는다. 테스트 서버: node dev-server.mjs --port 8797 --data data-test/admin-store.json
if (new URL(BASE).port === '8796') { console.error('✘ 8796(실제 데이터) 서버에서는 테스트를 돌리지 않습니다. 테스트 서버(8797)를 쓰세요.'); process.exit(2); }
const ORIGIN = new URL(BASE).origin;
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const req = (p, { method = 'GET', body, cookie, origin = ORIGIN } = {}) => fetch(BASE + p, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// 쿠키 없이 → 전부 거절
check('쿠키 없이 팝업 목록 → 401', (await req('/api/admin/popups')).status === 401);
check('쿠키 없이 팝업 올리기 → 401', (await req('/api/admin/popups', { method: 'POST', body: { image: PNG } })).status === 401);
check('쿠키 없이 게시 변경 → 401', (await req('/api/admin/popups', { method: 'PATCH', body: { id: 'x', active: true } })).status === 401);
check('쿠키 없이 삭제 → 401', (await req('/api/admin/popups', { method: 'DELETE', body: { id: 'x' } })).status === 401);

const login = await req('/api/admin/login', { method: 'POST', body: { password: env.ADMIN_PASSWORD } });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
check('로그인', login.status === 200);

const beforeIds = (await (await req('/api/popup')).json()).popups.map(p => p.id);

// 잘못된 파일 거절
const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
check('SVG(스크립트 넣을 수 있는 형식) 거절 → 400', (await req('/api/admin/popups', { method: 'POST', cookie, body: { image: svg } })).status === 400);
const fakePng = 'data:image/png;base64,' + Buffer.from('this is not an image').toString('base64');
check('이름만 이미지인 가짜 파일 거절 → 400', (await req('/api/admin/popups', { method: 'POST', cookie, body: { image: fakePng } })).status === 400);
const big = 'data:image/png;base64,' + Buffer.alloc(3.2 * 1024 * 1024, 1).toString('base64');
check('3MB 넘는 이미지 거절 → 413', (await req('/api/admin/popups', { method: 'POST', cookie, body: { image: big } })).status === 413);
check('javascript: 이동 주소 거절 → 400', (await req('/api/admin/popups', { method: 'POST', cookie, body: { image: PNG, link: 'javascript:alert(1)' } })).status === 400);
check('다른 사이트에서 온 올리기 → 403', (await req('/api/admin/popups', { method: 'POST', cookie, origin: 'https://evil.example', body: { image: PNG } })).status === 403);

// 올리기 → 사이트에 뜸
const up = await req('/api/admin/popups', { method: 'POST', cookie, body: { image: PNG, alt: '테스트 팝업', link: '#reserve', active: true } });
const created = up.status === 200 ? (await up.json()).popup : null;
check('올리기 → 200', Boolean(created));
const pub = (await (await req('/api/popup')).json()).popups.find(p => p.id === created?.id);
check('사이트용 API에 게시된 팝업이 나옴', pub && pub.link === '#reserve');

// 여러 개 동시 게시
const up2 = await req('/api/admin/popups', { method: 'POST', cookie, body: { image: PNG, alt: '테스트 팝업 2', active: true } });
const second = up2.status === 200 ? (await up2.json()).popup : null;
const both = (await (await req('/api/popup')).json()).popups.map(p => p.id);
check('두 개를 게시하면 둘 다 나옴 (먼저 올린 것이 앞)', both.includes(created.id) && both.includes(second.id) && both.indexOf(created.id) < both.indexOf(second.id));
await req('/api/admin/popups', { method: 'DELETE', cookie, body: { id: second.id } });
const image = await fetch(BASE + pub.imageUrl);
check('팝업 이미지 파일 응답 (image/png)', image.status === 200 && image.headers.get('content-type') === 'image/png');

// 내리기 → 사이트에서 사라짐
await req('/api/admin/popups', { method: 'PATCH', cookie, body: { id: created.id, active: false } });
check('내리면 사이트에 안 나옴', !(await (await req('/api/popup')).json()).popups.some(p => p.id === created.id));

// 삭제 → 목록·이미지 모두 사라짐
const del = await req('/api/admin/popups', { method: 'DELETE', cookie, body: { id: created.id } });
const list = (await (await req('/api/admin/popups', { cookie })).json()).popups;
check('삭제 → 200, 목록에서 사라짐', del.status === 200 && !list.some(p => p.id === created.id));
check('삭제 후 이미지 주소 → 404', (await fetch(BASE + pub.imageUrl)).status === 404);
check('이미지 주소에 엉뚱한 값 → 404', (await fetch(BASE + '/api/popup-image?id=../../.env')).status === 404);

// 원래 게시 상태 복원
for (const id of beforeIds) await req('/api/admin/popups', { method: 'PATCH', cookie, body: { id, active: true } });
await req('/api/admin/logout', { method: 'POST', cookie });

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
