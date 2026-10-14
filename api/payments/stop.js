// POST /api/payments/stop { orderId, code } — 실패·취소 화면에서 결제 진행 중이던 주문을 정리한다(잡아 둔 날짜 풀기).
import { isSameOrigin, readJson, send } from '../_lib/auth.js';
import { markOrderStopped } from '../_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  const body = await readJson(req);
  const orderId = body && typeof body.orderId === 'string' ? body.orderId.slice(0, 64) : '';
  if (!orderId) return send(res, 400, { error: '주문 정보가 없습니다.' });
  await markOrderStopped(orderId, body.code);
  return send(res, 200, { ok: true });
}
