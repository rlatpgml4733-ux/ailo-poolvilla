// GET /api/auth/kakao/callback?code=&state=  — 카카오가 로그인 뒤 돌려보내는 주소
// state 확인 → 코드로 토큰 받기 → 회원번호·닉네임만 저장 → 서명 쿠키. 토큰은 저장하지 않는다.
// 탈퇴(intent=withdraw)면 같은 회원인지 확인한 뒤 카카오 연결을 끊고 회원 정보를 지운다.
import { readState, clearStateCookie, exchangeCode, fetchProfile, unlink, memberCookie, clearMemberCookie, memberIdFrom, redirect } from '../../_lib/member.js';
import { upsertMember, deleteMember } from '../../_lib/store.js';

const withFlag = (path, flag) => `${path}${path.includes('?') ? '&' : '?'}${flag}`;

export default async function handler(req, res) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const state = readState(req, query.get('state'));
  const clear = clearStateCookie(req);
  if (!state) return redirect(res, '/my.html?login=expired', [clear]);
  if (query.get('error') || !query.get('code')) {
    return redirect(res, withFlag(state.intent === 'withdraw' ? '/my.html' : state.next, state.intent === 'withdraw' ? 'withdraw=cancel' : 'login=cancel'), [clear]);
  }

  let token, profile;
  try {
    token = await exchangeCode(req, query.get('code'));
    profile = await fetchProfile(token);
  } catch (error) {
    console.error('kakao login failed', error.kakao || error.message);
    return redirect(res, '/my.html?login=error', [clear]);
  }

  if (state.intent === 'withdraw') {
    const memberId = memberIdFrom(req);
    if (!memberId || memberId !== `k-${profile.kakaoId}`) return redirect(res, '/my.html?withdraw=mismatch', [clear]);
    try { await unlink(token); } catch (error) { console.error(error.message); return redirect(res, '/my.html?withdraw=error', [clear]); }
    await deleteMember(memberId);
    return redirect(res, '/my.html?withdrawn=1', [clear, clearMemberCookie(req)]);
  }

  const member = await upsertMember(profile);
  return redirect(res, state.next, [clear, memberCookie(req, member.id)]);
}
