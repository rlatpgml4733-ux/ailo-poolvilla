/* 내 예약: 카카오 로그인 상태면 본인 예약만 보여 주고, 아니면 「카카오로 시작하기」. 로그아웃·탈퇴. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const VILLA = { reef: '리프 하우스', cove: '코브 하우스', both: '두 독채 함께' };
  const STATUS = { new: '예약 접수', confirmed: '예약 확정', cancelled: '취소됨', completed: '이용 완료' };
  const won = n => `${Number(n || 0).toLocaleString('ko-KR')}원`;
  const date = key => { const [y, m, d] = String(key).split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };
  const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  // 카카오 다녀온 뒤 안내
  const NOTICES = {
    'login=cancel': '카카오 로그인을 취소했어요.',
    'login=error': '카카오 로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.',
    'login=expired': '로그인 시간이 지났어요. 다시 시도해 주세요.',
    'withdraw=cancel': '탈퇴를 취소했어요.',
    'withdraw=mismatch': '로그인한 계정과 다른 카카오 계정이라 탈퇴하지 않았어요.',
    'withdraw=error': '탈퇴 처리 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.',
    'withdrawn=1': '탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.',
  };
  const query = location.search.slice(1);
  const notice = Object.keys(NOTICES).find(key => query.split('&').includes(key));
  if (notice) {
    $('notice').textContent = NOTICES[notice];
    $('notice').hidden = false;
    try { history.replaceState(null, '', 'my.html'); } catch { /* 무시 */ }
  }

  const fail = message => { $('error').textContent = message; };

  function bookingCard(b) {
    const card = document.createElement('article');
    card.className = 'pay-card my-card';
    const head = document.createElement('div');
    head.className = 'my-card-head';
    const title = document.createElement('h2');
    title.textContent = VILLA[b.villa] || b.villa;
    const badge = document.createElement('span');
    badge.className = `my-badge is-${b.status}`;
    badge.textContent = STATUS[b.status] || b.status;
    head.append(title, badge);

    const list = document.createElement('dl');
    list.className = 'pay-summary';
    const row = (label, value) => { const d = document.createElement('div'); const t = document.createElement('dt'); const v = document.createElement('dd'); t.textContent = label; v.textContent = value; d.append(t, v); return d; };
    list.append(
      row('일정', `${date(b.checkIn)} ~ ${date(b.checkOut)} · ${nights(b.checkIn, b.checkOut)}박`),
      row('인원', `${b.guests}인`),
      row('결제 금액', `${won(b.total)} · ${b.paid ? '결제 완료' : '미결제'}`),
      row('예약자', b.name || '-'),
    );
    card.append(head, list);
    return card;
  }

  async function load() {
    let response;
    try { response = await fetch('/api/my/bookings', { cache: 'no-store' }); } catch { return fail('서버와 연결하지 못했습니다. 잠시 뒤 새로고침해 주세요.'); }
    if (response.status === 401) { $('loginBox').hidden = false; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return fail(body.error || '예약을 불러오지 못했습니다.');

    $('myTitle').textContent = `${body.nickname}님의 예약`;
    $('memberBox').hidden = false;
    const list = $('list');
    if (!body.bookings.length) {
      const empty = document.createElement('div');
      empty.className = 'pay-card my-empty';
      empty.innerHTML = '<p>아직 예약이 없어요.</p><p class="pay-note">카카오로 로그인한 상태에서 결제한 예약이 여기에 모입니다.</p>';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...body.bookings.map(bookingCard));
    }
  }

  $('logoutButton').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.replace('my.html');
  });

  // 탈퇴: 한 번 누르면 확인 문구, 4초 안에 한 번 더 누르면 카카오 본인 확인으로
  let armed = null;
  $('withdrawButton').addEventListener('click', async () => {
    const button = $('withdrawButton');
    if (!armed) {
      button.textContent = '한 번 더 누르면 탈퇴를 진행합니다';
      button.classList.add('is-armed');
      armed = setTimeout(() => { armed = null; button.textContent = '회원 탈퇴'; button.classList.remove('is-armed'); }, 4000);
      return;
    }
    clearTimeout(armed);
    button.disabled = true;
    const response = await fetch('/api/auth/withdraw', { method: 'POST' }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok || !body.url) { button.disabled = false; return fail(body.error || '탈퇴를 시작하지 못했습니다.'); }
    location.href = body.url;
  });

  load();
})();
