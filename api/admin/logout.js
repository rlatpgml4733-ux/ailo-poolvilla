// POST /api/admin/logout  → 쿠키 삭제
import { clearSessionCookie, isSameOrigin, send } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  clearSessionCookie(req, res);
  return send(res, 200, { ok: true });
}
