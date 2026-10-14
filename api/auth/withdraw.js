// POST /api/auth/withdraw → 탈퇴 시작. 카카오에서 다시 로그인해 본인 확인을 받은 뒤(callback) 연결을 끊고 지운다.
// 다른 사이트가 링크 하나로 탈퇴시키지 못하게 POST + 같은 사이트 확인으로만 시작한다.
import { isSameOrigin, send } from '../_lib/auth.js';
import { isKakaoConfigured, memberIdFrom, startKakao } from '../_lib/member.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  if (!memberIdFrom(req)) return send(res, 401, { error: '로그인한 회원만 탈퇴할 수 있습니다.' });
  if (!isKakaoConfigured()) return send(res, 503, { error: '카카오 로그인 설정이 아직 되어 있지 않습니다.' });
  const { url, cookie } = startKakao(req, { intent: 'withdraw', next: '/my.html' });
  res.setHeader('Set-Cookie', cookie);
  return send(res, 200, { url });
}
