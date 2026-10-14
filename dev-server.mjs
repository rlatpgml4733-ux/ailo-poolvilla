// 로컬 개발 서버: 사이트(site/), 관리자 페이지(/admin), 관리자 API(/api/admin/*)를 한 번에 띄운다.
// 실행: node dev-server.mjs   (포트는 .env 의 PORT, 기본 8796)
// 배포(Vercel)에서는 api/ 폴더의 같은 함수가 서버리스 함수로 동작한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// .env 읽기 (비밀번호는 코드가 아니라 여기서만 들어온다)
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnv(path.join(ROOT, '.env'));

// 테스트용 실행: node dev-server.mjs --port 8797 --data <테스트 전용 파일>
// (자동 점검은 반드시 별도 파일로 돌려, 사장님이 올린 예약·문의·팝업을 건드리지 않는다)
const arg = name => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
if (arg('--data')) process.env.ADMIN_DATA_FILE = path.resolve(arg('--data'));
if (arg('--toss-base')) process.env.TOSS_API_BASE = arg('--toss-base');   // 테스트 때만: 가짜 토스 서버
if (arg('--kakao-base')) process.env.KAKAO_AUTH_BASE = process.env.KAKAO_API_BASE = arg('--kakao-base');   // 테스트 때만: 가짜 카카오 서버
process.env.ADMIN_DATA_FILE ||= path.join(ROOT, 'data', 'admin-store.json');

const PORT = Number(arg('--port') || process.env.PORT || 8796);
const API = {
  '/api/admin/login': 'api/admin/login.js',
  '/api/admin/logout': 'api/admin/logout.js',
  '/api/admin/session': 'api/admin/session.js',
  '/api/admin/items': 'api/admin/items.js',
  '/api/admin/status': 'api/admin/status.js',
  '/api/admin/popups': 'api/admin/popups.js',
  '/api/popup': 'api/popup.js',
  '/api/popup-image': 'api/popup-image.js',
  '/api/inquiries': 'api/inquiries.js',
  '/api/availability': 'api/availability.js',
  '/api/health': 'api/health.js',
  '/api/payments/config': 'api/payments/config.js',
  '/api/payments/quote': 'api/payments/quote.js',
  '/api/payments/prepare': 'api/payments/prepare.js',
  '/api/payments/confirm': 'api/payments/confirm.js',
  '/api/payments/stop': 'api/payments/stop.js',
  '/api/auth/kakao/login': 'api/auth/kakao/login.js',
  '/api/auth/kakao/callback': 'api/auth/kakao/callback.js',
  '/api/auth/me': 'api/auth/me.js',
  '/api/auth/logout': 'api/auth/logout.js',
  '/api/auth/withdraw': 'api/auth/withdraw.js',
  '/api/my/bookings': 'api/my/bookings.js',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

// 요청 경로 → 실제 파일 (폴더 밖으로 나가는 경로는 막는다)
function resolveFile(pathname) {
  if (pathname === '/admin' || pathname === '/admin/') return path.join(ROOT, 'site', 'admin', 'index.html');
  const [base, rel] = pathname.startsWith('/02_assets/')
    ? [path.join(ROOT, '02_assets'), pathname.slice('/02_assets/'.length)]
    : [path.join(ROOT, 'site'), pathname === '/' ? 'index.html' : pathname.slice(1)];
  const file = path.resolve(base, rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.statusCode = 400; return res.end('Bad request');
  }

  if (API[pathname]) {
    try {
      const mod = await import(pathToFileURL(path.join(ROOT, API[pathname])).href);
      return await mod.default(req, res);
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }));
    }
  }
  if (pathname.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const file = resolveFile(pathname);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404; return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  // 사진·영상·글꼴은 1시간 캐시(배포 서버 속도·데이터 절약), 화면 파일은 수정이 바로 보이게 캐시 안 함
  res.setHeader('Cache-Control', pathname.startsWith('/02_assets/') ? 'public, max-age=3600' : 'no-store');
  if (pathname === '/admin' || pathname.startsWith('/admin/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`아일로 개발 서버: http://localhost:${PORT}/  ·  관리자: http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠ .env 에 ADMIN_PASSWORD 가 없습니다. 관리자 로그인이 막혀 있습니다.');
});
