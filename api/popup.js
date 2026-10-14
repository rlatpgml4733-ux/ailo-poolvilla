// GET /api/popup  → 사이트에 띄울 팝업 목록 (없으면 빈 배열). 누구나 볼 수 있는 공개 정보만 준다.
import { send } from './_lib/auth.js';
import { activePopups } from './_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  const popups = await activePopups();
  return send(res, 200, { popups: popups.map(p => ({ id: p.id, imageUrl: p.imageUrl, alt: p.alt, link: p.link })) });
}
