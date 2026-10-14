/* 예약 문의 폼: 화면에서 한 번 확인하고, 서버가 다시 검사·저장한 뒤 문의번호를 보여 준다.
   예약 상세에서 들어오면 독채·날짜·인원을 미리 채운다 (?villa=&guests=&in=&out=). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const VILLA = { reef: '리프 하우스', cove: '코브 하우스', both: '두 독채 함께' };

  // 인원 1~10
  for (let n = 1; n <= 10; n++) { const o = document.createElement('option'); o.value = n; o.textContent = `${n}인`; $('guests').append(o); }

  // 오늘 이전 날짜는 고를 수 없게
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('checkIn').min = today;
  $('checkOut').min = today;
  $('checkIn').addEventListener('change', () => { $('checkOut').min = $('checkIn').value || today; });

  // 예약 상세에서 넘어온 조건 미리 채우기
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  if (isDate(params.get('in'))) $('checkIn').value = params.get('in');
  if (isDate(params.get('out'))) $('checkOut').value = params.get('out');
  if (/^\d+$/.test(params.get('guests') || '')) $('guests').value = params.get('guests');
  if (VILLA[params.get('villa')]) {
    $('message').placeholder = `${VILLA[params.get('villa')]} 예약 관련 궁금한 점을 적어 주세요.`;
    $('backLink').href = `booking.html${location.search}`;
    $('backLink').querySelector('span').textContent = '예약 상세로 돌아가기';
  }

  $('message').addEventListener('input', () => { $('count').textContent = `${$('message').value.length} / 1000`; });
  $('phone').addEventListener('input', event => {
    const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 11);
    event.target.value = digits.replace(/^(\d{3})(\d{1,4})?(\d{1,4})?$/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));
  });

  const fail = (message, field) => { $('formError').textContent = message; if (field) $(field).focus(); };
  // 입력을 고치면 이전 안내는 지운다
  $('inquiryForm').addEventListener('input', () => { $('formError').textContent = ''; });
  $('inquiryForm').addEventListener('change', () => { $('formError').textContent = ''; });

  $('inquiryForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('formError').textContent = '';
    const name = $('name').value.trim();
    const phone = $('phone').value.replace(/[^0-9]/g, '');
    const message = $('message').value.trim();
    if (!name) return fail('이름을 적어 주세요.', 'name');
    if (!/^01[016789]\d{7,8}$/.test(phone)) return fail('휴대폰 번호를 정확히 적어 주세요. (예: 010-1234-5678)', 'phone');
    if ($('checkIn').value && $('checkOut').value && $('checkOut').value <= $('checkIn').value) return fail('체크아웃은 체크인 다음 날 이후로 골라 주세요.', 'checkOut');
    if (message.length < 5) return fail('문의 내용을 5자 이상 적어 주세요.', 'message');
    if (!$('consent').checked) return fail('개인정보 수집·이용에 동의해 주세요.', 'consent');

    $('submitButton').disabled = true;
    $('submitButton').textContent = '보내는 중…';
    let result = { ok: false, body: {} };
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, phone, message, consent: true, website: $('website').value,
          checkIn: $('checkIn').value, checkOut: $('checkOut').value, guests: $('guests').value,
        }),
      });
      result = { ok: response.ok, body: await response.json().catch(() => ({})) };
    } catch {
      result.body.error = '서버와 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
    }
    $('submitButton').disabled = false;
    $('submitButton').textContent = '문의 남기기';
    if (!result.ok) return fail(result.body.error || '문의를 보내지 못했습니다.');

    $('number').textContent = result.body.number;
    $('inquiryForm').hidden = true;
    document.querySelector('.inq-lead').hidden = true;
    $('done').hidden = false;
    $('done').scrollIntoView({ block: 'start' });
  });
})();
