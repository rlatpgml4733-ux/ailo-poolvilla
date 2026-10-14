// GET /api/payments/quote?villa=&guests=&in=&out= → 서버가 계산한 결제 금액 (결제 화면 표시용)
import { send } from '../_lib/auth.js';
import { quote } from '../_lib/pricing.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  const q = new URL(req.url, 'http://localhost').searchParams;
  const result = quote({ villa: q.get('villa'), guests: q.get('guests'), checkIn: q.get('in'), checkOut: q.get('out') });
  if (!result.ok) return send(res, 400, { error: result.error });
  return send(res, 200, result);
}
