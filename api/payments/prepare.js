// POST /api/payments/prepare { villa, guests, in, out, name, phone, consentPrivacy, consentRefund }
// → 서버가 금액을 다시 계산해 주문을 만들고 { orderId, amount, orderName } 을 준다. 결제위젯은 이 금액으로만 결제한다.
import { isSameOrigin, readJson, send } from '../_lib/auth.js';
import { quote } from '../_lib/pricing.js';
import { createOrder, getMember } from '../_lib/store.js';
import { memberIdFrom } from '../_lib/member.js';
import { isTossConfigured } from '../_lib/toss.js';

const cleanName = value => String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20);
const cleanPhone = value => String(value || '').replace(/[^0-9]/g, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  if (!isTossConfigured()) return send(res, 503, { error: '결제 설정이 아직 되어 있지 않습니다.' });
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: '요청을 읽을 수 없습니다.' });

  const name = cleanName(body.name);
  const phone = cleanPhone(body.phone);
  if (!name) return send(res, 400, { error: '예약자 이름을 적어 주세요.' });
  if (!/^01[016789]\d{7,8}$/.test(phone)) return send(res, 400, { error: '휴대폰 번호를 정확히 적어 주세요. (예: 010-1234-5678)' });

  // 개인정보 수집·이용, 환불 규정 동의는 화면만 믿지 않고 서버에서도 확인한다
  if (body.consentPrivacy !== true) return send(res, 400, { error: '개인정보 수집·이용에 동의해 주세요.' });
  if (body.consentRefund !== true) return send(res, 400, { error: '환불 규정을 확인하고 동의해 주세요.' });

  const q = quote({ villa: body.villa, guests: body.guests, checkIn: body.in, checkOut: body.out });
  if (!q.ok) return send(res, 400, { error: q.error });

  // 카카오로 로그인한 상태면 그 회원의 예약으로 묶는다 (로그인 안 해도 예약은 가능)
  const memberId = memberIdFrom(req);
  const member = memberId ? await getMember(memberId) : null;

  const order = await createOrder(q, {
    ...(member ? { memberId: member.id, memberNickname: member.nickname } : {}),
    name, phone: phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'),
    consent: { privacyAt: new Date().toISOString(), refundAt: new Date().toISOString() },
  });
  if (!order) return send(res, 409, { error: '방금 다른 분이 같은 날짜를 예약했습니다. 다른 날짜를 골라 주세요.' });
  return send(res, 200, { orderId: order.orderId, amount: order.amount, orderName: order.orderName, customerName: order.name });
}
