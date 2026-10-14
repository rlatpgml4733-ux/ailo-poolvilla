/* 결제 결과 화면 (성공 · 실패 · 취소 공용). <body data-result="success|fail|cancel">
   성공: 서버에 승인 요청 → 서버가 토스 승인 API로 다시 확인하고 금액이 같을 때만 확정 → 결과 표시.
   실패/취소: 주문을 정리하고 안내. 토스가 돌려준 문구는 글자로만 보여 준다(HTML로 넣지 않음). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const kind = document.body.dataset.result;
  const params = new URLSearchParams(location.search);
  const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
  const dateText = key => { const [, m, d] = String(key).split('-'); return `${Number(m)}월 ${Number(d)}일`; };
  let saved = '';
  try { saved = sessionStorage.getItem('ailo-checkout') || ''; } catch { /* 저장 불가 */ }
  const retry = $('retryLink');
  if (retry && saved) retry.href = `checkout.html${saved}`;
  const again = $('againLink');
  if (again && saved) again.href = `booking.html${saved}`;

  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
    .catch(() => ({ ok: false, body: { error: '서버와 연결하지 못했습니다. 잠시 뒤 새로고침해 주세요.' } }));

  function setResult(state, title, message) {
    const box = $('result');
    box.classList.remove('is-fail', 'is-cancel');
    if (state === 'fail') box.classList.add('is-fail');
    if (state === 'cancel') box.classList.add('is-cancel');
    $('resultTitle').textContent = title;
    $('resultMessage').textContent = message;
    $('resultIcon').innerHTML = state === 'ok'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  }

  function renderSummary(b) {
    const rows = [['예약 번호', b.orderId], ['예약자', b.name], ['독채', b.villaName], ['일정', `${dateText(b.checkIn)} ~ ${dateText(b.checkOut)} · ${b.nights}박`], ['인원', `${b.guests}인`], ['결제 금액', won(b.amount)]];
    $('summary').replaceChildren(...rows.map(([label, value]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      div.append(dt, dd);
      return div;
    }));
    $('summary').hidden = false;
  }

  if (kind === 'success') {
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = Number(params.get('amount'));
    if (!paymentKey || !orderId || !Number.isInteger(amount)) {
      setResult('fail', '결제 정보를 확인할 수 없습니다', '결제 화면에서 다시 시도해 주세요.');
      $('failActions').hidden = false;
      return;
    }
    post('/api/payments/confirm', { paymentKey, orderId, amount }).then(result => {
      if (result.ok && result.body.booking) {
        setResult('ok', '예약과 결제가 완료되었습니다', '입실 안내는 체크인 전날 문자로 보내 드립니다.');
        renderSummary(result.body.booking);
        $('okActions').hidden = false;
        try { sessionStorage.removeItem('ailo-checkout'); } catch { /* 무시 */ }
        history.replaceState(null, '', 'payment-success.html');   // 주소창의 결제 키 지우기
      } else {
        setResult('fail', '결제를 확정하지 못했습니다', result.body.error || '결제를 확인하지 못했습니다.');
        $('failActions').hidden = false;
      }
    });
  }

  if (kind === 'fail') {
    const code = params.get('code') || '';
    const orderId = params.get('orderId') || '';
    if (code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL') {   // 사용자가 결제창을 닫은 경우는 취소 화면으로
      location.replace(`payment-cancel.html?${new URLSearchParams({ orderId })}`);
      return;
    }
    if (orderId) post('/api/payments/stop', { orderId, code });
    setResult('fail', '결제에 실패했습니다', params.get('message') || '결제가 정상적으로 처리되지 않았습니다. 다시 시도해 주세요.');
    $('errorCode').textContent = code ? `오류 코드: ${code}` : '';
  }

  if (kind === 'cancel') {
    const orderId = params.get('orderId') || '';
    if (orderId) post('/api/payments/stop', { orderId, code: 'PAY_PROCESS_CANCELED' });
  }
})();
