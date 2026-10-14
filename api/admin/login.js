// POST /api/admin/login  { password }  → 맞으면 서명 쿠키 발급
import { isConfigured, checkPassword, createToken, setSessionCookie, isSameOrigin, isLockedOut, recordFailure, clearFailures, readJson, send } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  if (!isConfigured()) return send(res, 503, { error: '관리자 비밀번호가 설정되지 않았습니다. .env 의 ADMIN_PASSWORD 를 확인하세요.' });
  if (await isLockedOut(req)) return send(res, 429, { error: '비밀번호를 여러 번 틀렸습니다. 10분 뒤 다시 시도하세요.' });

  const body = await readJson(req);
  if (!body || !checkPassword(body.password)) {
    await recordFailure(req);
    return send(res, 401, { error: '비밀번호가 맞지 않습니다.' });
  }
  await clearFailures(req);
  setSessionCookie(req, res, createToken());
  return send(res, 200, { ok: true });
}
