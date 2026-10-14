// GET /api/my/bookings → 로그인한 회원 본인의 예약만. 로그인 안 했으면 401.
import { send } from '../_lib/auth.js';
import { memberIdFrom } from '../_lib/member.js';
import { getMember, memberBookings } from '../_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  const id = memberIdFrom(req);
  const member = id ? await getMember(id) : null;
  if (!member) return send(res, 401, { error: '카카오로 로그인해 주세요.' });
  return send(res, 200, { nickname: member.nickname, bookings: await memberBookings(member.id) });
}
