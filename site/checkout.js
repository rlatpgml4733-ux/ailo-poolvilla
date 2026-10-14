/* 결제하기 화면: 서버가 계산한 금액으로 토스 결제위젯을 띄운다.
   결제 버튼 → 서버에 주문 생성(금액 재계산) → 그 금액으로 결제창 → 성공/실패 화면으로 이동.
   카드 정보는 토스 결제창 안에서만 입력되고 이 사이트로 오지 않는다. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const booking = { villa: params.get('villa'), guests: params.get('guests'), in: params.get('in'), out: params.get('out') };
  const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
  const dateText = key => { const [, m, d] = String(key).split('-'); return `${Number(m)}월 ${Number(d)}일`; };
  let widgets = null;
  let currentAmount = 0;

  // 다시 고르기 / 재시도 링크용으로 조건을 기억해 둔다
  const backQuery = new URLSearchParams({ villa: booking.villa || 'reef', guests: booking.guests || '2', ...(booking.in ? { in: booking.in } : {}), ...(booking.out ? { out: booking.out } : {}) });
  $('backLink').href = `booking.html?${backQuery}`;
  try { sessionStorage.setItem('ailo-checkout', location.search); } catch { /* 저장 불가 */ }

  const showError = message => { $('payError').textContent = message || ''; };

  // 카카오로 로그인했으면 그 회원 예약으로 들어간다는 안내, 아니면 로그인 권유 (로그인 없이도 예약 가능)
  fetch('/api/auth/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(body => {
    if (!body || !body.kakao) return;
    const note = $('memberNote');
    if (body.member) {
      note.textContent = `카카오 ${body.member.nickname}님의 예약으로 저장되어 '내 예약'에서 볼 수 있어요.`;
    } else {
      const link = document.createElement('a');
      link.href = `/api/auth/kakao/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      link.textContent = '카카오로 로그인';
      note.append(link, "하면 이 예약을 '내 예약'에서 모아 볼 수 있어요. (로그인 없이도 예약 가능)");
    }
    note.hidden = false;
  }).catch(() => {});

  function renderSummary(q) {
    const rows = [
      ['독채', q.villaName],
      ['일정', `${dateText(q.checkIn)} ~ ${dateText(q.checkOut)} · ${q.nights}박`],
      ['인원', `${q.guests}인`],
      ['숙박비', `${won(q.stay)}${q.weekendNights ? ` (금~토 ${q.weekendNights}박 포함)` : ''}`],
      ...(q.extra ? [['인원 추가비', won(q.extra)]] : []),
    ];
    $('summary').replaceChildren(...rows.map(([label, value]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      div.append(dt, dd);
      return div;
    }));
    $('amount').textContent = won(q.total);
  }

  async function getJson(url, options) {
    const response = await fetch(url, options);
    let body = {};
    try { body = await response.json(); } catch { /* 빈 응답 */ }
    return { ok: response.ok, status: response.status, body };
  }

  async function start() {
    const q = await getJson(`/api/payments/quote?${new URLSearchParams({ villa: booking.villa || '', guests: booking.guests || '', in: booking.in || '', out: booking.out || '' })}`);
    if (!q.ok) {
      $('summary').replaceChildren();
      showError(`${q.body.error || '예약 내용을 확인하지 못했습니다.'} 위의 "예약 내용 다시 고르기"를 눌러 주세요.`);
      return;
    }
    renderSummary(q.body);
    currentAmount = q.body.total;

    const config = await getJson('/api/payments/config');
    if (!config.ok || typeof window.TossPayments !== 'function') {
      showError(config.body.error || '결제창을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.');
      return;
    }
    try {
      const toss = window.TossPayments(config.body.clientKey);
      widgets = toss.widgets({ customerKey: window.TossPayments.ANONYMOUS });
      await widgets.setAmount({ currency: 'KRW', value: currentAmount });
      await Promise.all([
        widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
        widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
      ]);
      $('payButton').disabled = false;
    } catch (error) {
      showError('결제창을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.');
    }
  }

  $('buyerPhone').addEventListener('input', event => {
    const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 11);
    event.target.value = digits.replace(/^(\d{3})(\d{1,4})?(\d{1,4})?$/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));
  });

  // 예약 동의: '모두 동의'와 개별 체크가 서로 맞춰진다
  const items = [$('consentPrivacy'), $('consentRefund')];
  $('consentAll').addEventListener('change', () => { items.forEach(box => { box.checked = $('consentAll').checked; }); showError(''); });
  items.forEach(box => box.addEventListener('change', () => { $('consentAll').checked = items.every(b => b.checked); showError(''); }));

  $('payButton').addEventListener('click', async () => {
    showError('');
    const name = $('buyerName').value.trim();
    const phone = $('buyerPhone').value.replace(/[^0-9]/g, '');
    if (!name) { showError('예약자 이름을 적어 주세요.'); $('buyerName').focus(); return; }
    if (!/^01[016789]\d{7,8}$/.test(phone)) { showError('휴대폰 번호를 정확히 적어 주세요.'); $('buyerPhone').focus(); return; }
    if (!$('consentPrivacy').checked) { showError('개인정보 수집·이용에 동의해 주세요.'); $('consentPrivacy').focus(); return; }
    if (!$('consentRefund').checked) { showError('취소·환불 규정을 확인하고 동의해 주세요.'); $('consentRefund').focus(); return; }

    $('payButton').disabled = true;
    const order = await getJson('/api/payments/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...booking, name, phone, consentPrivacy: $('consentPrivacy').checked, consentRefund: $('consentRefund').checked }),
    });
    if (!order.ok) { showError(order.body.error || '주문을 만들지 못했습니다.'); $('payButton').disabled = false; return; }

    try {
      if (order.body.amount !== currentAmount) {   // 그사이 금액이 바뀌었으면 서버 금액으로 맞춘다
        currentAmount = order.body.amount;
        await widgets.setAmount({ currency: 'KRW', value: currentAmount });
        $('amount').textContent = won(currentAmount);
      }
      await widgets.requestPayment({
        orderId: order.body.orderId,
        orderName: order.body.orderName,
        customerName: order.body.customerName,
        customerMobilePhone: phone,
        successUrl: `${location.origin}/payment-success.html`,
        failUrl: `${location.origin}/payment-fail.html`,
      });
    } catch (error) {
      const code = error && error.code;
      if (code === 'USER_CANCEL' || code === 'PAY_PROCESS_CANCELED') {
        location.href = `payment-cancel.html?${new URLSearchParams({ orderId: order.body.orderId })}`;
        return;
      }
      showError((error && error.message) || '결제를 시작하지 못했습니다. 다시 시도해 주세요.');
      $('payButton').disabled = false;
    }
  });

  start();
})();
