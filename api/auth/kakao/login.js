// GET /api/auth/kakao/login?next=/booking.html  → 카카오 로그인 화면으로 보낸다
import { send } from '../../_lib/auth.js';
import { isKakaoConfigured, startKakao, redirect } from '../../_lib/member.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isKakaoConfigured()) return send(res, 503, { error: '카카오 로그인 설정이 아직 되어 있지 않습니다. .env 의 KAKAO_REST_KEY · KAKAO_CLIENT_SECRET 를 확인하세요.' });
  const next = new URL(req.url, 'http://localhost').searchParams.get('next');
  const { url, cookie } = startKakao(req, { intent: 'login', next: next || '/my.html' });
  return redirect(res, url, [cookie]);
}
