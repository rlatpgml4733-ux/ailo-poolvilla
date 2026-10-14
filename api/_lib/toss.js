// 토스페이먼츠 서버 API. 시크릿 키는 .env 의 TOSS_SECRET_KEY 에서만 읽는다.
// TOSS_API_BASE 는 자동 테스트에서 가짜 토스 서버를 가리킬 때만 쓴다(기본: 실제 토스).

const base = () => process.env.TOSS_API_BASE || 'https://api.tosspayments.com';

export const isTossConfigured = () => Boolean(process.env.TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY);

async function call(path, body, idempotencyKey) {
  const auth = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64');
  try {
    const response = await fetch(base() + path, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),   // 같은 요청을 두 번 보내도 한 번만 처리
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    let data = {};
    try { data = await response.json(); } catch { /* 빈 응답 */ }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { code: 'NETWORK_ERROR', message: '결제사 서버와 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' } };
  }
}

/** 결제 승인 */
export const confirmPayment = (paymentKey, orderId, amount) =>
  call('/v1/payments/confirm', { paymentKey, orderId, amount }, `confirm-${orderId}`);

/** 결제 취소 (승인됐지만 확정하면 안 되는 경우) */
export const cancelPayment = (paymentKey, reason) =>
  call(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, { cancelReason: reason }, `cancel-${paymentKey}`);
