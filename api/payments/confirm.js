// POST /api/payments/confirm { paymentKey, orderId, amount }  — 결제 성공 화면에서 부른다.
// 1) 주문을 찾고  2) 받은 금액이 서버에 저장한 금액과 같은지 확인한 뒤  3) 토스 승인 API 를 부르고
// 4) 토스가 돌려준 결제 금액·주문번호·상태가 서버 주문과 같을 때만 예약을 확정한다.
// 승인됐는데 정보가 다르면 즉시 결제를 취소한다. 카드 정보는 저장하지 않는다.
import { isSameOrigin, readJson, send } from '../_lib/auth.js';
import { beginConfirm, finishOrder } from '../_lib/store.js';
import { confirmPayment, cancelPayment, isTossConfigured } from '../_lib/toss.js';

const summary = order => ({
  orderId: order.orderId, orderName: order.orderName, amount: order.amount, villaName: order.villaName,
  checkIn: order.checkIn, checkOut: order.checkOut, nights: order.nights, guests: order.guests, name: order.name,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: '허용되지 않는 요청입니다.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: '허용되지 않는 요청입니다.' });
  if (!isTossConfigured()) return send(res, 503, { error: '결제 설정이 아직 되어 있지 않습니다.' });

  const body = await readJson(req);
  const paymentKey = body && typeof body.paymentKey === 'string' ? body.paymentKey.slice(0, 200) : '';
  const orderId = body && typeof body.orderId === 'string' ? body.orderId.slice(0, 64) : '';
  const amount = body ? Number(body.amount) : NaN;
  if (!paymentKey || !orderId || !Number.isInteger(amount)) return send(res, 400, { error: '결제 정보가 올바르지 않습니다.' });

  const started = await beginConfirm(orderId);
  if (started.blocked === 'not_found') return send(res, 404, { error: '주문을 찾을 수 없습니다.' });
  if (started.blocked === 'paid') {
    // 새로고침 등으로 다시 들어온 경우: 같은 결제면 완료 화면을 그대로 보여 준다
    return started.order.payment && started.order.payment.paymentKey === paymentKey
      ? send(res, 200, { ok: true, booking: summary(started.order) })
      : send(res, 409, { error: '이미 처리된 주문입니다.' });
  }
  if (started.blocked === 'expired_taken') return send(res, 409, { error: '결제 대기 10분이 지나 그 사이 다른 예약이 날짜를 잡았습니다. 결제는 진행되지 않았으니 다른 날짜를 골라 주세요.' });
  if (started.blocked) {
    return send(res, 409, { error: started.blocked === 'confirming' ? '결제를 확인하는 중입니다. 잠시 뒤 새로고침해 주세요.' : '이미 끝난 주문입니다. 처음부터 다시 예약해 주세요.' });
  }
  const order = started.order;

  // 2) 화면에서 넘어온 금액이 서버 금액과 다르면 승인하지 않는다 (위변조)
  if (amount !== order.amount) {
    await finishOrder(orderId, { paid: false, failure: { code: 'AMOUNT_MISMATCH', stage: 'before_confirm' } });
    return send(res, 400, { error: '결제 금액이 주문 금액과 달라 결제를 진행하지 않았습니다.' });
  }

  // 3) 토스 승인 — 서버 금액으로
  const result = await confirmPayment(paymentKey, orderId, order.amount);
  if (!result.ok) {
    await finishOrder(orderId, { paid: false, failure: { code: String(result.data.code || 'CONFIRM_FAILED').slice(0, 60) } });
    return send(res, 400, { error: result.data.message || '결제를 승인하지 못했습니다.', code: result.data.code });
  }

  // 4) 토스 응답 다시 확인: 상태·주문번호·금액이 모두 맞을 때만 확정
  const p = result.data;
  if (p.status !== 'DONE' || p.orderId !== orderId || p.totalAmount !== order.amount) {
    await cancelPayment(paymentKey, '결제 금액 또는 주문 정보 불일치');
    await finishOrder(orderId, { paid: false, failure: { code: 'AMOUNT_MISMATCH', stage: 'after_confirm', refunded: true } });
    return send(res, 400, { error: '결제 정보가 주문과 달라 결제를 취소했습니다. 처음부터 다시 시도해 주세요.' });
  }

  // 저장하는 결제 정보: 카드번호·카드사 정보 등은 넣지 않는다
  const payment = {
    status: 'paid',
    paymentKey,
    method: typeof p.method === 'string' ? p.method : '',
    totalAmount: p.totalAmount,
    approvedAt: typeof p.approvedAt === 'string' ? p.approvedAt : new Date().toISOString(),
    receiptUrl: p.receipt && typeof p.receipt.url === 'string' ? p.receipt.url : '',
  };
  const done = await finishOrder(orderId, { paid: true, payment });
  return send(res, 200, { ok: true, booking: summary(done) });
}
