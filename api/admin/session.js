// GET /api/admin/session  → 로그인 상태만 알려준다 (데이터는 주지 않음)
import { isAuthed, send } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  return send(res, 200, { loggedIn: isAuthed(req) });
}
