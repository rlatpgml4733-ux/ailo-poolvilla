// /api/admin/popups — 팝업 관리 (유효한 관리자 쿠키가 없으면 전부 거절)
//   GET    목록
//   POST   { image: 'data:image/...;base64,...', alt, link, active }  → 올리기
//   PATCH  { id, active }  → 게시 켜기/끄기 (게시 중인 팝업은 모두 사이트에 나란히 뜸)
//   DELETE { id }  → 삭제 (이미지 파일도 지움)
import { isAuthed, isSameOrigin, readJson, send } from '../_lib/auth.js';
import { POPUP_MAX_BYTES, detectImageType, listPopups, addPopup, setPopupActive, deletePopup } from '../_lib/store.js';

const cleanText = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

// 누르면 이동할 주소: 비우거나, 사이트 안(# 또는 /로 시작), 또는 https:// 주소만 허용
function cleanLink(value) {
  const link = cleanText(value, 300);
  if (!link) return '';
  if (link.startsWith('#') || (link.startsWith('/') && !link.startsWith('//'))) return link;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (!isAuthed(req)) return send(res, 401, { error: '로그인이 필요합니다.' });

  if (req.method === 'GET') return send(res, 200, { popups: await listPopups() });

  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });

  if (req.method === 'POST') {
    const body = await readJson(req, Math.ceil(POPUP_MAX_BYTES * 1.4) + 4096);
    if (!body) return send(res, 413, { error: '이미지가 너무 큽니다. 3MB 이하로 올려 주세요.' });
    const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
    if (!match) return send(res, 400, { error: '이미지 파일을 골라 주세요.' });
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > POPUP_MAX_BYTES) return send(res, 413, { error: '이미지가 너무 큽니다. 3MB 이하로 올려 주세요.' });
    const type = detectImageType(buffer);
    if (!type) return send(res, 400, { error: 'JPG, PNG, WebP 이미지만 올릴 수 있습니다.' });
    const link = cleanLink(body.link);
    if (link === null) return send(res, 400, { error: '이동할 주소는 비워 두거나, #reserve 같은 사이트 안 주소 또는 https:// 주소로 적어 주세요.' });
    const popup = await addPopup({ buffer, type, alt: cleanText(body.alt, 80) || '아일로 풀빌라 안내', link, active: body.active !== false });
    return send(res, 200, { ok: true, popup });
  }

  const body = await readJson(req);
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!id) return send(res, 400, { error: '팝업을 찾을 수 없습니다.' });

  if (req.method === 'PATCH') {
    const popup = await setPopupActive(id, Boolean(body.active));
    return popup ? send(res, 200, { ok: true, popup }) : send(res, 404, { error: '팝업을 찾을 수 없습니다.' });
  }
  return (await deletePopup(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: '팝업을 찾을 수 없습니다.' });
}
