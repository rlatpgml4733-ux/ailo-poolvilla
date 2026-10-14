// GET /api/health → 배포 점검용. 각 설정이 들어 있는지와 저장소 연결 여부만 알려 준다 (값은 절대 보여 주지 않는다)
import { send, isConfigured } from './_lib/auth.js';
import { hasKv, redis } from './_lib/kv.js';
import { isTossConfigured } from './_lib/toss.js';
import { isKakaoConfigured } from './_lib/member.js';

export default async function handler(req, res) {
  let storage = hasKv() ? 'upstash' : 'local-file';
  if (hasKv()) {
    try { storage = (await redis('PING')) === 'PONG' ? 'upstash: 연결됨' : 'upstash: 응답 이상'; }
    catch (error) { storage = /401|unauthorized/i.test(error.message) ? 'upstash: 토큰이 맞지 않음' : /ENOTFOUND|fetch failed|Invalid URL/i.test(String(error.cause || error.message)) ? 'upstash: 주소가 맞지 않음' : 'upstash: 연결 실패'; }
  }
  return send(res, 200, { ok: true, storage, admin: isConfigured(), toss: isTossConfigured(), kakao: isKakaoConfigured() });
}
