/* 예약 상세 페이지(booking.html): 메인 검색창에서 넘어온 독채·인원·날짜를 이어받아
   예약 가능 여부와 요금을 보여준다. 데모 재고·요금은 booking-data.js. 실제 예약·결제는 없다. */
(() => {
  'use strict';
  const B = window.AiloBooking;
  const calendar = document.getElementById('availabilityCalendar');
  if (!calendar || !B) return;

  const $ = id => document.getElementById(id);
  const villaButtons = [...document.querySelectorAll('[data-villa]')];
  const guestSel = $('guestSelect');
  const triggers = [...document.querySelectorAll('.date-trigger')];
  const statusEl = $('bookingStatus'), summaryEl = $('bookingSummary');
  const feedback = $('bookingFeedback'), confirmBox = $('bookingConfirm'), calendarNote = $('calendarNote');
  const ALL = ['reef', 'cove', 'both'];
  const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;

  let villa = 'reef', guests = 2, checkIn = null, checkOut = null, field = 'checkIn';
  let rejected = null;   // 마감 때문에 지운 날짜 {a, b}

  /* ── 주소(검색 조건) 읽기 ── */
  const query = new URLSearchParams(location.search);
  if (B.isVilla(query.get('villa'))) villa = query.get('villa');
  guests = B.fitGuests(villa, parseInt(query.get('guests'), 10));
  {
    const a = B.parseKey(query.get('in')), b = B.parseKey(query.get('out'));
    if (a && b && a >= B.today && b > a && b <= B.lastBookable) {
      if (B.nightsBlocked(villa, a, b)) rejected = { a, b };
      else { checkIn = a; checkOut = b; }
    }
  }

  const nightsOf = (a, b) => Math.round((b - a) / 864e5);
  const range = (a, b) => `${B.formatDate(a)} ~ ${B.formatDate(b)}`;
  const guestFits = (id, n) => n >= B.VILLAS[id].min && n <= B.VILLAS[id].max;
  const get = id => document.getElementById(id);

  function syncUrl() {
    const params = new URLSearchParams({ villa, guests });
    if (checkIn && checkOut) { params.set('in', B.dateKey(checkIn)); params.set('out', B.dateKey(checkOut)); }
    const ask = document.getElementById('askLink');
    if (ask) ask.href = `inquiry.html?${params}`;   // 문의 폼에 지금 고른 조건을 미리 채워 준다
    try { history.replaceState(null, '', `?${params}`); } catch (error) { /* 일부 환경(file://)에서는 주소 갱신이 막힐 수 있다 */ }
  }

  function fillGuests() {
    const { min, max } = B.guestRange(villa);
    guests = B.fitGuests(villa, guests);
    guestSel.replaceChildren(...Array.from({ length: max - min + 1 }, (_, i) => {
      const option = document.createElement('option');
      option.value = min + i;
      option.textContent = `${min + i}인`;
      option.selected = min + i === guests;
      return option;
    }));
  }

  /* ── 상태 안내(가능 / 마감 / 다른 독채 제안) ── */
  const ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.8"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5m0 3.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
  };
  function setStatus(kind, message, alternatives = []) {
    statusEl.className = `bk-status is-${kind}`;
    const body = document.createElement('p');
    body.textContent = message;
    for (const alt of alternatives) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${B.VILLAS[alt.id].name}로 같은 날짜 보기`;
      button.addEventListener('click', () => switchVilla(alt.id, alt.a, alt.b));
      body.append(document.createElement('br'), button);
    }
    statusEl.innerHTML = ICON[kind];
    statusEl.append(body);
  }

  function status() {
    if (rejected) {
      const alternatives = ALL
        .filter(id => id !== villa && guestFits(id, guests) && !B.nightsBlocked(id, rejected.a, rejected.b))
        .map(id => ({ id, a: rejected.a, b: rejected.b }));
      const tail = alternatives.length ? ' 같은 날짜에 예약할 수 있는 독채가 있어요.' : ' 달력에서 다른 날짜를 골라 주세요.';
      setStatus('warn', `${range(rejected.a, rejected.b)}에는 ${B.VILLAS[villa].name}의 마감된 날이 포함되어 있어요.${tail}`, alternatives);
    } else if (checkIn && checkOut) {
      setStatus('ok', `${range(checkIn, checkOut)} · ${nightsOf(checkIn, checkOut)}박, ${B.VILLAS[villa].name} 예약이 가능해요.`);
    } else if (checkIn) {
      setStatus('info', '체크아웃 날짜를 선택하세요.');
    } else {
      setStatus('info', '달력에서 체크인과 체크아웃 날짜를 선택하세요.');
    }
  }

  /* ── 요약·요금 ── */
  function row(label, value, small, total) {
    const li = document.createElement('li');
    if (total) li.className = 'is-total';
    const l = document.createElement('span'); l.textContent = label;
    const v = document.createElement('strong'); v.textContent = value;
    if (small) { const s = document.createElement('small'); s.textContent = small; v.append(s); }
    li.append(l, v);
    return li;
  }
  function summary() {
    const v = B.VILLAS[villa];
    get('checkInText').textContent = checkIn ? B.formatDate(checkIn) : '날짜 선택';
    get('checkOutText').textContent = checkOut ? B.formatDate(checkOut) : '날짜 선택';
    villaButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.villa === villa)));
    triggers.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dateField === field)));
    calendarNote.textContent = field === 'checkOut' && checkIn
      ? '체크아웃 날짜를 선택하세요. 입실일보다 앞선 날짜를 누르면 새로 선택합니다.'
      : '달력에서 체크인 날짜, 체크아웃 날짜 순서로 선택하세요.';

    const rows = [
      row('독채', v.name, villa === 'both' ? '리프 + 코브 합산 · 기준 6인' : `기준 ${v.base}인 · 최대 ${v.max}인`),
      row('인원', `${guests}인`),
      row('날짜', checkIn && checkOut ? range(checkIn, checkOut) : '선택 전'),
    ];
    if (checkIn && checkOut) {
      const q = B.quote(villa, guests, checkIn, checkOut);
      const nightsText = [q.weekdayNights && `일~목 ${q.weekdayNights}박`, q.weekendNights && `금~토 ${q.weekendNights}박`].filter(Boolean).join(' · ');
      rows.push(row('숙박비', B.won(q.stay), `${q.nights}박 · ${nightsText}`));
      if (q.extraGuests) rows.push(row('인원 추가비', `+${B.won(q.extra)}`, `${q.extraGuests}인 × ${B.won(B.EXTRA_PER_PERSON)} × ${q.nights}박`));
      rows.push(row('바비큐', '사전 신청 · 50,000원', '별도'));
      rows.push(row('예상 합계', B.won(q.total), '바비큐 별도', true));
    } else {
      rows.push(row('바비큐', '사전 신청 · 50,000원', '별도'));
      rows.push(row('예상 합계', '날짜 선택 후 안내', '', true));
    }
    summaryEl.replaceChildren(...rows);
    status();
  }

  /* ── 달력 ── */
  function render(focusKey) {
    const scrollLeft = calendar.scrollLeft;
    const fragment = document.createDocumentFragment();
    for (let offset = 0; offset < 2; offset++) {
      const start = new Date(B.today.getFullYear(), B.today.getMonth() + offset, 1);
      const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const month = document.createElement('div');
      month.className = 'calendar-month';
      month.style.setProperty('--rows', Math.ceil((start.getDay() + last) / 7));   // 주 수만큼 높이를 나눠 가져 날짜 칸 높이가 두 달 모두 같다
      const title = document.createElement('p');
      title.className = 'month-name';
      title.textContent = `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
      const week = document.createElement('div');
      week.className = 'calendar-week';
      ['일', '월', '화', '수', '목', '금', '토'].forEach(text => { const s = document.createElement('span'); s.textContent = text; week.append(s); });
      const days = document.createElement('div');
      days.className = 'calendar-days';
      for (let i = 0; i < start.getDay(); i++) days.append(document.createElement('span'));
      for (let day = 1; day <= last; day++) {
        const date = new Date(start.getFullYear(), start.getMonth(), day);
        const blocked = date < B.today || B.isFull(villa, date);
        const picking = field === 'checkOut' && checkIn && date > checkIn;
        const validCheckout = picking && !B.nightsBlocked(villa, checkIn, date);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'calendar-day';
        button.dataset.date = B.dateKey(date);
        button.textContent = day;
        button.disabled = date < B.today || (picking ? !validCheckout : blocked);
        if (blocked) button.classList.add('is-unavailable');
        if (blocked && validCheckout) button.classList.add('is-checkout-only');
        const isIn = checkIn && B.dateKey(date) === B.dateKey(checkIn);
        const isOut = checkOut && B.dateKey(date) === B.dateKey(checkOut);
        const endpoint = isIn ? '입실' : isOut ? '퇴실' : '';
        button.setAttribute('aria-pressed', String(Boolean(endpoint)));
        button.setAttribute('aria-label', `${B.formatDate(date)} ${endpoint || (button.disabled ? '선택 불가' : blocked ? '체크아웃만 가능' : '예약 가능')}`);
        if (endpoint) {
          button.classList.add('is-selected');
          const label = document.createElement('span');
          label.className = 'date-endpoint';
          label.textContent = endpoint;
          button.append(label);
        }
        if (checkIn && checkOut && date > checkIn && date < checkOut) button.classList.add('is-in-range');
        button.addEventListener('click', () => select(date));
        days.append(button);
      }
      month.append(title, week, days);
      fragment.append(month);
    }
    calendar.replaceChildren(fragment);
    calendar.scrollLeft = scrollLeft;
    if (focusKey) calendar.querySelector(`[data-date="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  function refresh(focusKey) { summary(); render(focusKey); syncUrl(); }

  function select(date) {
    confirmBox.hidden = true;
    rejected = null;
    if (field === 'checkOut' && checkIn && date > checkIn) {
      checkOut = date;
      field = 'checkIn';
      feedback.textContent = '독채·인원·날짜를 확인했어요. 아래 예약 신청을 눌러 보세요.';
    } else {
      checkIn = date;
      checkOut = null;
      field = 'checkOut';
      feedback.textContent = '체크아웃 날짜를 선택하세요.';
    }
    refresh(B.dateKey(date));
  }

  /* ── 독채 바꾸기: 날짜가 마감과 겹치면 지우고 안내 ── */
  function switchVilla(id, a, b) {
    villa = id;
    confirmBox.hidden = true;
    fillGuests();
    const from = a || checkIn, to = b || checkOut;
    if (from && to && !B.nightsBlocked(villa, from, to)) { checkIn = from; checkOut = to; rejected = null; }
    else if (from && to) { rejected = { a: from, b: to }; checkIn = checkOut = null; field = 'checkIn'; }
    refresh();
  }

  villaButtons.forEach(button => button.addEventListener('click', () => switchVilla(button.dataset.villa)));
  guestSel.addEventListener('change', () => {
    guests = parseInt(guestSel.value, 10);
    confirmBox.hidden = true;
    refresh();
  });
  triggers.forEach(button => button.addEventListener('click', () => {
    field = button.dataset.dateField;
    if (field === 'checkOut' && !checkIn) {
      field = 'checkIn';
      feedback.textContent = '체크인 날짜를 먼저 선택하세요.';
    }
    summary(); render();
    if (matchMedia('(max-width:1100px)').matches) {
      calendar.closest('.calendar-panel').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    calendar.focus({ preventScroll: true });
  }));

  get('bookingSubmit').addEventListener('click', () => {
    if (!checkIn || !checkOut) {
      feedback.textContent = '체크인, 체크아웃 날짜를 모두 선택하세요.';
      return;
    }
    // 결제 화면으로 (금액은 서버가 다시 계산한다)
    const params = new URLSearchParams({ villa, guests, in: B.dateKey(checkIn), out: B.dateKey(checkOut) });
    location.href = `checkout.html?${params}`;
  });

  // 서버에서 실제 결제된 날짜를 받으면: 고른 날짜가 막혔으면 지우고 안내, 달력 다시 그리기
  window.addEventListener('ailo:availability', () => {
    if (checkIn && checkOut && B.nightsBlocked(villa, checkIn, checkOut)) {
      rejected = { a: checkIn, b: checkOut };
      checkIn = checkOut = null;
      field = 'checkIn';
      confirmBox.hidden = true;
    } else if (checkIn && !checkOut && B.isFull(villa, checkIn)) {
      checkIn = null;
      field = 'checkIn';
    }
    refresh();
  });

  fillGuests();
  refresh();
})();
