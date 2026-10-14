// 서버 요금 계산 — 결제 금액은 항상 여기서 정한다(브라우저가 보낸 금액은 믿지 않음).
// 규칙은 사이트의 site/booking-data.js 와 같다: 리프·코브·두 독채, 일~목/금~토 요금, 기준 인원 초과 1인·1박 30,000원.
// 날짜는 한국 시간 기준 'YYYY-MM-DD' 문자열로 다룬다.

export const VILLAS = {
  reef: { name: '리프 하우스', base: 2, min: 1, max: 4, weekday: 260000, weekend: 360000 },
  cove: { name: '코브 하우스', base: 4, min: 1, max: 6, weekday: 340000, weekend: 440000 },
  both: { name: '두 독채 함께', base: 6, min: 7, max: 10, weekday: 600000, weekend: 800000 },
};
const EXTRA_PER_PERSON = 30000;
const MAX_NIGHTS = 14;
const DAY = 864e5;

const toUtc = key => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(t).toISOString().slice(0, 10) === key ? t : null;
};
const toKey = t => new Date(t).toISOString().slice(0, 10);
const todayKst = (now = Date.now()) => toUtc(new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10));

// 데모 재고: 오늘 기준 며칠 뒤 밤이 마감인지 (사이트 달력과 같은 값)
const FULL_BOTH = [2, 8, 9, 16, 22, 29, 35, 36, 43, 49];
const FULL_ONLY = { reef: [5, 12, 25, 40], cove: [6, 13, 31, 44] };
function isFull(villa, t, today) {
  const offset = Math.round((t - today) / DAY);
  if (FULL_BOTH.includes(offset)) return true;
  return villa === 'both' ? FULL_ONLY.reef.includes(offset) || FULL_ONLY.cove.includes(offset) : FULL_ONLY[villa].includes(offset);
}

/**
 * 예약 조건 검사 + 금액 계산.
 * 성공: { ok:true, villa, villaName, guests, checkIn, checkOut, nights, weekdayNights, weekendNights, stay, extra, total, orderName }
 * 실패: { ok:false, error }
 */
export function quote({ villa, guests, checkIn, checkOut }, now = Date.now()) {
  const v = VILLAS[villa];
  if (!v) return { ok: false, error: '독채를 다시 선택해 주세요.' };
  const g = Number(guests);
  if (!Number.isInteger(g) || g < v.min || g > v.max) return { ok: false, error: `${v.name}은(는) ${v.min}~${v.max}인까지 예약할 수 있습니다.` };
  const start = toUtc(checkIn), end = toUtc(checkOut);
  if (start === null || end === null) return { ok: false, error: '체크인·체크아웃 날짜를 선택해 주세요.' };
  const today = todayKst(now);
  const lastBookable = Date.UTC(new Date(today).getUTCFullYear(), new Date(today).getUTCMonth() + 2, 0);  // 다음 달 말일
  if (start < today) return { ok: false, error: '지난 날짜는 예약할 수 없습니다.' };
  if (end <= start) return { ok: false, error: '체크아웃은 체크인 다음 날 이후여야 합니다.' };
  if (end > lastBookable) return { ok: false, error: '이번 달과 다음 달 안에서만 예약할 수 있습니다.' };
  const nights = Math.round((end - start) / DAY);
  if (nights > MAX_NIGHTS) return { ok: false, error: `한 번에 최대 ${MAX_NIGHTS}박까지 예약할 수 있습니다.` };

  let weekdayNights = 0, weekendNights = 0;
  for (let t = start; t < end; t += DAY) {
    if (isFull(villa, t, today)) return { ok: false, error: '선택한 날짜에 마감된 날이 있습니다. 다른 날짜를 골라 주세요.' };
    const day = new Date(t).getUTCDay();
    if (day === 5 || day === 6) weekendNights++; else weekdayNights++;   // 금·토 숙박 = 금~토 요금
  }
  const stay = weekdayNights * v.weekday + weekendNights * v.weekend;
  const extra = Math.max(0, g - v.base) * EXTRA_PER_PERSON * nights;
  return {
    ok: true, villa, villaName: v.name, guests: g, checkIn: toKey(start), checkOut: toKey(end),
    nights, weekdayNights, weekendNights, stay, extra, total: stay + extra,
    orderName: `아일로 ${v.name} ${nights}박`,
  };
}

/** 두 기간이 겹치는가 ([in, out) 구간) */
export const overlaps = (a, b) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;
/** 독채가 겹치는가 (두 독채 함께 = 리프 + 코브) */
export const sameHouse = (a, b) => a === b || a === 'both' || b === 'both';
