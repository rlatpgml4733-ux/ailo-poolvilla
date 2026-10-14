// GET /api/payments/config → 결제위젯용 클라이언트 키 (공개해도 되는 키). 시크릿 키는 절대 내보내지 않는다.
import { send } from '../_lib/auth.js';
import { isTossConfigured } from '../_lib/toss.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isTossConfigured()) return send(res, 503, { error: '결제 설정이 아직 되어 있지 않습니다.' });
  return send(res, 200, { clientKey: process.env.TOSS_CLIENT_KEY });
}
