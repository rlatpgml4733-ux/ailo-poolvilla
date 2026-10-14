// GET /api/auth/me → { member: { nickname } | null, kakao: 설정 여부 }
import { send } from '../_lib/auth.js';
import { memberIdFrom, isKakaoConfigured } from '../_lib/member.js';
import { getMember } from '../_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  const id = memberIdFrom(req);
  const member = id ? await getMember(id) : null;
  return send(res, 200, { member: member ? { nickname: member.nickname } : null, kakao: isKakaoConfigured() });
}
