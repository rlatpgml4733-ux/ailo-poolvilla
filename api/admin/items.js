// GET /api/admin/items  → 예약·문의 목록. 유효한 관리자 쿠키가 없으면 거절.
import { isAuthed, send } from '../_lib/auth.js';
import { listAll } from '../_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isAuthed(req)) return send(res, 401, { error: '로그인이 필요합니다.' });
  return send(res, 200, await listAll());
}
