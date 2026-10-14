// POST /api/admin/status  { type: 'booking'|'inquiry', id, status }  → 상태 변경. 유효한 관리자 쿠키가 없으면 거절.
import { isAuthed, isSameOrigin, readJson, send } from '../_lib/auth.js';
import { STATUSES, updateStatus } from '../_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isAuthed(req)) return send(res, 401, { error: '로그인이 필요합니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });

  const body = await readJson(req);
  const type = body && body.type;
  const id = body && body.id;
  const status = body && body.status;
  if (!STATUSES[type] || typeof id !== 'string' || !STATUSES[type].includes(status)) {
    return send(res, 400, { error: '잘못된 상태 값입니다.' });
  }
  const item = await updateStatus(type, id, status);
  if (!item) return send(res, 404, { error: '해당 항목을 찾을 수 없습니다.' });
  return send(res, 200, { ok: true, item });
}
