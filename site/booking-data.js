/* 메인 검색창(booking-search.js)과 예약 상세 페이지(booking-calendar.js)가 함께 쓰는 재고·요금.
   데모 마감일 + 서버(/api/availability)가 알려 주는 실제 결제된·결제 중인 날짜를 함께 마감으로 본다.
   서버 날짜를 받으면 'ailo:availability' 이벤트를 보내 달력이 다시 그리게 한다. */
window.AiloBooking = (() => {
  'use strict';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = text => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return dateKey(d) === text ? d : null;
  };
  const formatDate = d => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const won = n => `${n.toLocaleString('ko-KR')}원`;
  const keysFrom = offsets => new Set(offsets.map(o => dateKey(addDays(today, o))));

  // 오늘 기준 며칠 뒤 밤이 마감인지. 두 독채 모두 마감인 날 + 한 독채만 마감인 날.
  const fullBoth = keysFrom([2, 8, 9, 16, 22, 29, 35, 36, 43, 49]);
  const fullOnly = { reef: keysFrom([5, 12, 25, 40]), cove: keysFrom([6, 13, 31, 44]) };

  // 실제로 결제된(또는 결제 진행 중인) 밤 — 서버에서 받아 채운다
  const booked = { reef: new Set(), cove: new Set() };
  fetch('/api/availability', { cache: 'no-store' })
    .then(response => (response.ok ? response.json() : null))
    .then(data => {
      if (!data) return;
      ['reef', 'cove'].forEach(id => { booked[id] = new Set(Array.isArray(data[id]) ? data[id] : []); });
      window.dispatchEvent(new Event('ailo:availability'));
    })
    .catch(() => { /* 서버가 없는 정적 배포에서는 데모 마감일만 쓴다 */ });

  // 예약 가능한 기간: 이번 달과 다음 달 (달력에 보이는 두 달)
  const lastBookable = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  const EXTRA_PER_PERSON = 30000;   // 기준 인원 초과 1인·1박
  const BBQ_SET = 50000;            // 바비큐 1세트 (별도)

  const VILLAS = {
    reef: { id: 'reef', name: '리프 하우스', en: 'REEF HOUSE', base: 2, min: 1, max: 4, weekday: 260000, weekend: 360000 },
    cove: { id: 'cove', name: '코브 하우스', en: 'COVE HOUSE', base: 4, min: 1, max: 6, weekday: 340000, weekend: 440000 },
    both: { id: 'both', name: '두 독채 함께', en: 'BOTH HOUSES', base: 6, min: 7, max: 10, weekday: 600000, weekend: 800000 },
  };
  const isVilla = id => Object.prototype.hasOwnProperty.call(VILLAS, id);

  // 그 독채의 그날 밤이 마감인가
  const isFull = (villa, date) => {
    const k = dateKey(date);
    if (fullBoth.has(k)) return true;
    if (villa === 'both' ? booked.reef.has(k) || booked.cove.has(k) : booked[villa].has(k)) return true;
    return villa === 'both' ? fullOnly.reef.has(k) || fullOnly.cove.has(k) : fullOnly[villa].has(k);
  };
  // [start, end) 사이 밤 중에 마감이 있는가
  const nightsBlocked = (villa, start, end) => {
    const cursor = new Date(start);
    while (cursor < end) {
      if (isFull(villa, cursor)) return true;
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  };
  const isWeekendNight = d => d.getDay() === 5 || d.getDay() === 6;   // 금·토 숙박 = 금~토 요금

  // 숙박 견적: 일~목 / 금~토 요금 + 기준 인원 초과분
  const quote = (villa, guests, checkIn, checkOut) => {
    const v = VILLAS[villa];
    let weekdayNights = 0, weekendNights = 0;
    for (const cursor = new Date(checkIn); cursor < checkOut; cursor.setDate(cursor.getDate() + 1)) {
      if (isWeekendNight(cursor)) weekendNights++; else weekdayNights++;
    }
    const nights = weekdayNights + weekendNights;
    const extraGuests = Math.max(0, guests - v.base);
    const stay = weekdayNights * v.weekday + weekendNights * v.weekend;
    const extra = extraGuests * EXTRA_PER_PERSON * nights;
    return { nights, weekdayNights, weekendNights, extraGuests, stay, extra, total: stay + extra };
  };

  // 독채별로 고를 수 있는 인원 범위, 바꿀 때 알맞은 인원으로 맞춤
  const guestRange = villa => ({ min: VILLAS[villa].min, max: VILLAS[villa].max });
  const fitGuests = (villa, guests) => {
    const { min, max } = guestRange(villa);
    if (!Number.isFinite(guests)) guests = villa === 'both' ? min : VILLAS[villa].base;
    return Math.min(max, Math.max(min, guests));
  };

  return { today, lastBookable, dateKey, parseKey, formatDate, addDays, won, VILLAS, isVilla, isFull, nightsBlocked, quote, guestRange, fitGuests, EXTRA_PER_PERSON, BBQ_SET };
})();
