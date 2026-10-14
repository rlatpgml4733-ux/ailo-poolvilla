// GET /api/availability → { reef: ['YYYY-MM-DD', …], cove: [...] }
// 이미 결제된 예약과 결제 진행 중(10분)인 주문이 잡은 밤. 날짜만 내보내고 이름·연락처는 내보내지 않는다.
// '두 독채 함께' 예약은 리프·코브 양쪽에 모두 들어간다.
import { send } from './_lib/auth.js';
import { takenNights } from './_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  return send(res, 200, await takenNights());
}
