/* 메인 예약 검색창: 독채·날짜·인원을 고르고 "예약 확인하기"를 누르면 booking.html(예약 상세)로 넘어간다. */
(() => {
  'use strict';
  const B = window.AiloBooking;
  const form = document.getElementById('searchBar');
  if (!form || !B) return;

  const $ = id => document.getElementById(id);
  const villaSel = $('sbVilla'), guestSel = $('sbGuests');
  const datesBtn = $('sbDatesBtn'), datesText = $('sbDatesText'), inInput = $('sbIn'), outInput = $('sbOut');
  const pop = $('sbPop'), months = $('sbMonths'), note = $('sbPopNote');
  const prev = $('sbPrev'), next = $('sbNext'), closeBtn = $('sbClose'), backdrop = $('sbBackdrop'), hint = $('sbHint');
  const cards = [...document.querySelectorAll('.vp-card')];
  const MONTHS = 2;   // 이번 달 + 다음 달
  const compact = matchMedia('(max-width:720px)');
  const HINT_DEFAULT = hint.textContent;
  let checkIn = null, checkOut = null, view = 0;

  const setHint = (text, warn) => {
    hint.textContent = text || HINT_DEFAULT;
    hint.classList.toggle('is-warn', Boolean(warn));
  };
  const nightsOf = (a, b) => Math.round((b - a) / 864e5);

  /* ── 인원: 독채에 맞는 범위만 보여준다 ── */
  function fillGuests(preferred) {
    const { min, max } = B.guestRange(villaSel.value);
    const value = B.fitGuests(villaSel.value, preferred);
    guestSel.replaceChildren(...Array.from({ length: max - min + 1 }, (_, i) => {
      const option = document.createElement('option');
      option.value = min + i;
      option.textContent = `${min + i}인`;
      option.selected = min + i === value;
      return option;
    }));
  }

  /* ── 독채: 드롭다운과 사진 카드가 같은 값을 가리킨다 ── */
  function setVilla(id) {
    villaSel.value = id;
    cards.forEach(card => card.setAttribute('aria-pressed', String(card.dataset.villa === id)));
    fillGuests(parseInt(guestSel.value, 10));
    if (checkIn && checkOut && B.nightsBlocked(id, checkIn, checkOut)) {
      checkIn = checkOut = null;
      syncDates();
      setHint('바꾼 독채는 선택한 날짜에 마감된 날이 있어 날짜를 지웠어요. 다시 선택해 주세요.', true);
    } else {
      setHint();
    }
    if (!pop.hidden) render();
  }

  /* ── 날짜 표시 ── */
  function syncDates() {
    inInput.value = checkIn ? B.dateKey(checkIn) : '';
    outInput.value = checkOut ? B.dateKey(checkOut) : '';
    datesText.textContent = checkIn && checkOut
      ? `${B.formatDate(checkIn)} → ${B.formatDate(checkOut)} · ${nightsOf(checkIn, checkOut)}박`
      : checkIn ? `${B.formatDate(checkIn)} → 체크아웃 선택` : '날짜 선택';
    datesText.classList.toggle('is-empty', !checkIn);
    note.textContent = !checkIn || checkOut
      ? '체크인 날짜를 선택하세요.'
      : '체크아웃 날짜를 선택하세요. 마감일은 퇴실만 가능할 수 있어요.';
  }

  /* ── 달력 ── */
  const visibleMonths = () => compact.matches ? 1 : 2;
  const clampView = () => { view = Math.max(0, Math.min(MONTHS - visibleMonths(), view)); };

  function dayButton(date) {
    const villa = villaSel.value;
    const past = date < B.today;
    const full = !past && B.isFull(villa, date);
    const picking = checkIn && !checkOut;
    const asCheckout = picking && date > checkIn && !B.nightsBlocked(villa, checkIn, date);
    const disabled = past || (picking && date > checkIn ? !asCheckout : full);
    const isIn = checkIn && B.dateKey(date) === B.dateKey(checkIn);
    const isOut = checkOut && B.dateKey(date) === B.dateKey(checkOut);
    const endpoint = isIn ? '입실' : isOut ? '퇴실' : '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sb-day';
    button.dataset.date = B.dateKey(date);
    button.textContent = date.getDate();
    button.disabled = disabled;
    if (past) button.classList.add('is-past');
    else if (full) button.classList.add(asCheckout ? 'is-checkout-only' : 'is-full');
    if (endpoint) {
      button.classList.add('is-selected');
      const label = document.createElement('span');
      label.className = 'sb-endpoint';
      label.textContent = endpoint;
      button.append(label);
    }
    if (checkIn && checkOut && date > checkIn && date < checkOut) button.classList.add('is-in-range');
    button.setAttribute('aria-pressed', String(Boolean(endpoint)));
    button.setAttribute('aria-label', `${B.formatDate(date)} ${endpoint || (past ? '지난 날짜' : disabled ? (full ? '마감' : '선택 불가') : full ? '퇴실만 가능' : '예약 가능')}`);
    button.addEventListener('click', () => pick(date));
    return button;
  }

  function render(focusKey) {
    clampView();
    prev.hidden = next.hidden = MONTHS <= visibleMonths();
    prev.disabled = view === 0;
    next.disabled = view >= MONTHS - visibleMonths();
    const fragment = document.createDocumentFragment();
    for (let offset = view; offset < view + visibleMonths(); offset++) {
      const start = new Date(B.today.getFullYear(), B.today.getMonth() + offset, 1);
      const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const month = document.createElement('div');
      month.className = 'sb-month';
      const title = document.createElement('p');
      title.className = 'sb-month-name';
      title.textContent = `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
      const week = document.createElement('div');
      week.className = 'sb-week';
      ['일', '월', '화', '수', '목', '금', '토'].forEach(text => { const s = document.createElement('span'); s.textContent = text; week.append(s); });
      const days = document.createElement('div');
      days.className = 'sb-days';
      for (let i = 0; i < start.getDay(); i++) days.append(document.createElement('span'));
      for (let day = 1; day <= last; day++) days.append(dayButton(new Date(start.getFullYear(), start.getMonth(), day)));
      month.append(title, week, days);
      fragment.append(month);
    }
    months.replaceChildren(fragment);
    if (focusKey) months.querySelector(`[data-date="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  function pick(date) {
    const restart = !checkIn || checkOut || date <= checkIn;
    if (restart) { checkIn = date; checkOut = null; setHint(); }
    else { checkOut = date; setHint(`${nightsOf(checkIn, checkOut)}박을 선택했어요. 예약 확인하기를 눌러 주세요.`); }
    syncDates();
    if (checkOut) closePop(true); else render(B.dateKey(date));
  }

  function place() {
    if (compact.matches) { pop.style.left = ''; pop.style.width = ''; return; }
    const bar = form.getBoundingClientRect();
    const field = datesBtn.closest('.sb-field').getBoundingClientRect();
    const width = Math.min(840, bar.width);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(0, Math.min(field.left - bar.left, bar.width - width))}px`;
  }

  function openPop() {
    if (checkIn) {
      view = (checkIn.getFullYear() - B.today.getFullYear()) * 12 + checkIn.getMonth() - B.today.getMonth();
    }
    pop.hidden = false;
    backdrop.hidden = !compact.matches;
    datesBtn.setAttribute('aria-expanded', 'true');
    render();
    place();
    if (!compact.matches) pop.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    (months.querySelector('.sb-day.is-selected') || months.querySelector('.sb-day:not(:disabled)'))?.focus({ preventScroll: true });
  }
  function closePop(returnFocus) {
    pop.hidden = true;
    backdrop.hidden = true;
    datesBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) datesBtn.focus({ preventScroll: true });
  }

  datesBtn.addEventListener('click', () => (pop.hidden ? openPop() : closePop()));
  closeBtn.addEventListener('click', () => closePop(true));
  backdrop.addEventListener('click', () => closePop());
  prev.addEventListener('click', () => { view -= 1; render(); });
  next.addEventListener('click', () => { view += 1; render(); });
  document.addEventListener('click', event => {
    if (!pop.hidden && !pop.contains(event.target) && !datesBtn.contains(event.target)) closePop();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !pop.hidden) { event.preventDefault(); closePop(true); }
  });
  compact.addEventListener('change', () => { if (!pop.hidden) { backdrop.hidden = !compact.matches; render(); place(); } });
  window.addEventListener('resize', () => { if (!pop.hidden) place(); });

  villaSel.addEventListener('change', () => setVilla(villaSel.value));
  guestSel.addEventListener('change', () => setHint());
  cards.forEach(card => card.addEventListener('click', () => setVilla(card.dataset.villa)));

  // 날짜를 고르지 않아도 예약 확인 페이지로 넘어간다. 그 페이지의 달력에서 날짜를 고르면 된다.
  form.addEventListener('submit', event => {
    event.preventDefault();
    const params = new URLSearchParams({ villa: villaSel.value, guests: guestSel.value });
    if (checkIn && checkOut) {
      params.set('in', B.dateKey(checkIn));
      params.set('out', B.dateKey(checkOut));
    }
    location.href = `booking.html?${params}`;
  });

  // 서버에서 실제 결제된 날짜를 받으면: 고른 날짜가 막혔으면 지우고 안내, 열린 달력 다시 그리기
  window.addEventListener('ailo:availability', () => {
    if (checkIn && checkOut && B.nightsBlocked(villaSel.value, checkIn, checkOut)) {
      checkIn = checkOut = null;
      syncDates();
      setHint('고른 날짜에 방금 마감된 날이 있어 날짜를 지웠어요. 다시 선택해 주세요.', true);
    }
    if (!pop.hidden) render();
  });

  fillGuests(parseInt(guestSel.value, 10));
  setVilla(villaSel.value);
  syncDates();
})();
