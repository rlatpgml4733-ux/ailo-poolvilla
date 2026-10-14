// POST /api/inquiries — 예약 문의 접수 (누구나). 서버에서 다시 검사하고 저장한 뒤 문의번호를 돌려준다.
// { name, phone, checkIn?, checkOut?, guests?, message, consent, website(숨은 칸) }
import { isSameOrigin, readJson, send, clientKey } from './_lib/auth.js';
import { countHits, addHit } from './_lib/kv.js';
import { addInquiry } from './_lib/store.js';

const clean = (value, max) => String(value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

// 같은 곳에서 10분에 5건까지 (도배 방지, 배포에서는 Redis 에 센다)
const WINDOW = 10 * 60 * 1000, LIMIT = 5;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });

  const key = clientKey(req);
  if ((await countHits('inquiry', key)) >= LIMIT) return send(res, 429, { error: '문의를 너무 자주 보냈습니다. 잠시 뒤 다시 시도하거나 전화로 문의해 주세요.' });

  const body = await readJson(req, 16 * 1024);
  if (!body) return send(res, 400, { error: '요청을 읽을 수 없습니다.' });

  // 사람에게는 안 보이는 칸이 채워져 있으면 자동 프로그램(스팸)으로 보고 저장하지 않는다
  if (clean(body.website, 200)) return send(res, 200, { ok: true, number: 'AQ-000000-0000' });

  const name = clean(body.name, 20);
  const digits = String(body.phone || '').replace(/[^0-9]/g, '');
  const message = clean(body.message, 1000);
  const checkIn = clean(body.checkIn, 10), checkOut = clean(body.checkOut, 10);
  const guests = body.guests === '' || body.guests === undefined || body.guests === null ? null : Number(body.guests);

  if (!name) return send(res, 400, { error: '이름을 적어 주세요.' });
  if (!/^01[016789]\d{7,8}$/.test(digits)) return send(res, 400, { error: '휴대폰 번호를 정확히 적어 주세요. (예: 010-1234-5678)' });
  if ((checkIn && !isDate(checkIn)) || (checkOut && !isDate(checkOut))) return send(res, 400, { error: '희망 날짜를 다시 골라 주세요.' });
  if (checkIn && checkOut && checkOut <= checkIn) return send(res, 400, { error: '체크아웃은 체크인 다음 날 이후로 골라 주세요.' });
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 10)) return send(res, 400, { error: '인원은 1~10명 사이로 골라 주세요.' });
  if (message.length < 5) return send(res, 400, { error: '문의 내용을 5자 이상 적어 주세요.' });
  if (body.consent !== true) return send(res, 400, { error: '개인정보 수집·이용에 동의해 주세요.' });

  await addHit('inquiry', key, WINDOW);
  const saved = await addInquiry({
    name, phone: digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'),
    checkIn: checkIn || '', checkOut: checkOut || '', guests, message, consentAt: new Date().toISOString(),
  });
  return send(res, 200, { ok: true, number: saved.number });
}
