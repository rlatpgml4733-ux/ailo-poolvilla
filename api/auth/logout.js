// POST /api/auth/logout → 회원 쿠키 지우기
import { isSameOrigin, send } from '../_lib/auth.js';
import { clearMemberCookie } from '../_lib/member.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  res.setHeader('Set-Cookie', clearMemberCookie(req));
  return send(res, 200, { ok: true });
}
