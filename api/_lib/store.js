// 문의·예약·팝업 저장소.
// - 로컬: JSON 파일(data/admin-store.json) + 이미지 파일(data/uploads)
// - 배포(Render·Vercel): Upstash Redis(KV_REST_API_URL 또는 UPSTASH_REDIS_REST_URL…) 한 키에 같은 JSON.
//   팝업 이미지는 Vercel Blob 토큰이 있으면 Blob, 없으면 Redis 의 이미지 전용 키(ailo:popup-image:<id>)에 저장
//   서버가 여러 대로 동시에 돌 수 있어, 읽고-고치고-저장하는 동안 Redis 잠금을 건다.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { overlaps, sameHouse } from './pricing.js';
import { hasKv, redis } from './kv.js';

const STORE_KEY = 'ailo:store';
const LOCK_KEY = 'ailo:store:lock';
const hasBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export const STATUSES = {
  booking: ['new', 'confirmed', 'cancelled', 'completed'],
  inquiry: ['new', 'in_progress', 'answered'],
};

const dataFile = () => process.env.ADMIN_DATA_FILE || path.join(process.cwd(), 'data', 'admin-store.json');

const iso = date => date.toISOString();
const day = (base, offset) => { const d = new Date(base); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const ago = (base, hours) => iso(new Date(base.getTime() - hours * 3600 * 1000));

// 처음 실행할 때 넣는 예시 데이터 (sample: true 로 표시해 화면에 "예시"로 보인다)
function seed(now = new Date()) {
  return {
    bookings: [
      { id: 'b-1001', sample: true, createdAt: ago(now, 2), name: '예시 손님 A', phone: '010-0000-0001', villa: 'cove', guests: 5, checkIn: day(now, 17), checkOut: day(now, 19), total: 940000, status: 'new', updatedAt: ago(now, 2) },
      { id: 'b-1002', sample: true, createdAt: ago(now, 26), name: '예시 손님 B', phone: '010-0000-0002', villa: 'reef', guests: 2, checkIn: day(now, 3), checkOut: day(now, 4), total: 260000, status: 'confirmed', updatedAt: ago(now, 20) },
      { id: 'b-1003', sample: true, createdAt: ago(now, 50), name: '예시 손님 C', phone: '010-0000-0003', villa: 'both', guests: 8, checkIn: day(now, 24), checkOut: day(now, 26), total: 1660000, status: 'new', updatedAt: ago(now, 50) },
      { id: 'b-1004', sample: true, createdAt: ago(now, 120), name: '예시 손님 D', phone: '010-0000-0004', villa: 'reef', guests: 3, checkIn: day(now, 9), checkOut: day(now, 11), total: 580000, status: 'cancelled', updatedAt: ago(now, 96) },
    ],
    popups: [],
    inquiries: [
      { id: 'q-2001', sample: true, createdAt: ago(now, 1), name: '예시 문의 A', phone: '010-0000-0011', message: '아이 둘(5세, 8세)과 함께 가는데 풀 수심이 괜찮을까요?', status: 'new', updatedAt: ago(now, 1) },
      { id: 'q-2002', sample: true, createdAt: ago(now, 30), name: '예시 문의 B', phone: '010-0000-0012', message: '밤 10시 이후 도착 예정인데 셀프 체크인이 가능한가요?', status: 'in_progress', updatedAt: ago(now, 28) },
      { id: 'q-2003', sample: true, createdAt: ago(now, 75), name: '예시 문의 C', phone: '010-0000-0013', message: '바비큐 그릴 세트에 숯과 집게도 포함되나요?', status: 'answered', updatedAt: ago(now, 70) },
    ],
  };
}

async function load() {
  if (hasKv()) {
    const raw = await redis('GET', STORE_KEY);
    if (raw) return JSON.parse(raw);
    const data = seed();
    await save(data);
    return data;
  }
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const data = seed();
    await save(data);
    return data;
  }
}

// 끝난 지 오래된(결제 안 된) 주문은 지워 저장소가 계속 커지지 않게 한다. 결제된 주문은 예약에 따로 남아 있다.
const ORDER_KEEP_MS = 3 * 24 * 3600 * 1000;
function prune(data, now = Date.now()) {
  if (!Array.isArray(data.orders)) return;
  data.orders = data.orders.filter(o => ['paid', 'confirming'].includes(o.status) || now - Date.parse(o.createdAt) < ORDER_KEEP_MS);
}

async function save(data) {
  prune(data);
  if (hasKv()) { await redis('SET', STORE_KEY, JSON.stringify(data)); return; }
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, file);   // 쓰는 도중 꺼져도 파일이 깨지지 않게
}

// 동시에 여러 요청이 와도 저장이 엉키지 않도록 한 줄로 처리 (배포에서는 Redis 잠금으로 서버 여러 대 사이도 한 줄로)
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
async function withLock(task) {
  if (!hasKv()) return task();
  const token = crypto.randomBytes(12).toString('hex');
  const deadline = Date.now() + 8000;
  while ((await redis('SET', LOCK_KEY, token, 'NX', 'PX', 10000)) !== 'OK') {
    if (Date.now() > deadline) throw new Error('store is busy');
    await new Promise(resolve => setTimeout(resolve, 60 + Math.random() * 80));
  }
  try { return await task(); } finally { await redis('EVAL', RELEASE, 1, LOCK_KEY, token).catch(() => {}); }
}
let queue = Promise.resolve();
const serial = task => { const run = () => withLock(task); return (queue = queue.then(run, run)); };

const newestFirst = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

export function listAll() {
  return serial(async () => {
    const data = await load();
    return { bookings: [...data.bookings].sort(newestFirst), inquiries: [...data.inquiries].sort(newestFirst) };
  });
}

/** type: 'booking' | 'inquiry'. 성공하면 바뀐 항목, 없으면 null */
export function updateStatus(type, id, status) {
  return serial(async () => {
    const data = await load();
    const list = type === 'booking' ? data.bookings : data.inquiries;
    const item = list.find(entry => entry.id === id);
    if (!item) return null;
    item.status = status;
    item.updatedAt = iso(new Date());
    await save(data);
    return item;
  });
}

/* ── 팝업 이미지 ──
   이미지는 data/uploads/ 에 저장한다(파일 이름은 서버가 정함). 게시 중인 팝업은 모두 사이트에 나란히 뜬다.
   주의: Vercel 에 올릴 때는 이미지 저장도 Vercel Blob 같은 저장소로 바꿔야 한다. */

export const POPUP_MAX_BYTES = 3 * 1024 * 1024;   // 3MB
const uploadsDir = () => path.join(path.dirname(dataFile()), 'uploads');

/** 실제 파일 내용을 보고 형식을 판단 (확장자는 믿지 않는다). PNG·JPEG·WebP 만 허용 */
export function detectImageType(buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

const publicPopup = p => ({ id: p.id, alt: p.alt, link: p.link, active: p.active, createdAt: p.createdAt, imageUrl: p.blobUrl || `/api/popup-image?id=${encodeURIComponent(p.id)}` });
const blob = () => import('@vercel/blob');   // Vercel 에서만 쓰는 패키지라 필요할 때만 불러온다

export function listPopups() {
  return serial(async () => {
    const data = await load();
    return (data.popups || []).slice().sort(newestFirst).map(publicPopup);
  });
}

/** 사이트에 띄울 팝업 전부 — 먼저 올린 것이 왼쪽 */
export function activePopups() {
  return serial(async () => {
    const data = await load();
    return (data.popups || []).filter(p => p.active).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(publicPopup);
  });
}

export function addPopup({ buffer, type, alt, link, active }) {
  return serial(async () => {
    const data = await load();
    data.popups ||= [];
    const id = `p-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const file = `${id}.${type.ext}`;
    let blobUrl;
    if (hasBlob()) {
      const { put } = await blob();
      blobUrl = (await put(`popups/${file}`, buffer, { access: 'public', contentType: type.mime, addRandomSuffix: false })).url;
    } else if (hasKv()) {
      await redis('SET', `ailo:popup-image:${id}`, buffer.toString('base64'));
    } else {
      await fs.mkdir(uploadsDir(), { recursive: true });
      await fs.writeFile(path.join(uploadsDir(), file), buffer);
    }
    const popup = { id, file, ...(blobUrl ? { blobUrl } : {}), mime: type.mime, alt, link, active: Boolean(active), createdAt: iso(new Date()) };
    data.popups.push(popup);
    await save(data);
    return publicPopup(popup);
  });
}

export function setPopupActive(id, active) {
  return serial(async () => {
    const data = await load();
    const popup = (data.popups || []).find(p => p.id === id);
    if (!popup) return null;
    popup.active = Boolean(active);
    await save(data);
    return publicPopup(popup);
  });
}

export function deletePopup(id) {
  return serial(async () => {
    const data = await load();
    const index = (data.popups || []).findIndex(p => p.id === id);
    if (index < 0) return false;
    const [popup] = data.popups.splice(index, 1);
    await save(data);
    if (popup.blobUrl) { const { del } = await blob(); await del(popup.blobUrl).catch(() => {}); }
    else if (hasKv()) await redis('DEL', `ailo:popup-image:${popup.id}`);
    else await fs.rm(path.join(uploadsDir(), popup.file), { force: true });
    return true;
  });
}

/** 이미지 파일 읽기 (공개 사이트용). 없으면 null */
export function readPopupImage(id) {
  return serial(async () => {
    const data = await load();
    const popup = (data.popups || []).find(p => p.id === id);
    if (!popup) return null;
    if (popup.blobUrl) return { redirect: popup.blobUrl };
    if (hasKv()) {
      const base64 = await redis('GET', `ailo:popup-image:${popup.id}`);
      return base64 ? { buffer: Buffer.from(base64, 'base64'), mime: popup.mime } : null;
    }
    try {
      return { buffer: await fs.readFile(path.join(uploadsDir(), popup.file)), mime: popup.mime };
    } catch {
      return null;
    }
  });
}

/* ── 결제 주문 ──
   주문(orders)은 결제 전에 서버가 만든다. 금액은 서버 계산값만 저장한다.
   결제가 확정되면 예약(bookings)에 넣는다. 카드번호 등 카드 정보는 어디에도 저장하지 않는다. */

export const HOLD_MS = 10 * 60 * 1000;   // 결제 전에는 10분 동안만 그 날짜를 잡아 둔다

// 결제 진행 중인 주문이 날짜를 잡고 있는가 (결제 확인 중인 주문은 끝날 때까지 잡음)
const isHolding = (o, now) => o.status === 'confirming' || (o.status === 'pending' && now - Date.parse(o.createdAt) < HOLD_MS);

/** 같은 독채·겹치는 날짜에 이미 예약(취소 제외)이나 결제 진행 중인 주문이 있는가. exceptOrderId 는 자기 자신 제외용 */
function isTaken(data, q, now = Date.now(), exceptOrderId = '') {
  const busyBooking = (data.bookings || []).some(b => b.status !== 'cancelled' && sameHouse(b.villa, q.villa) && overlaps(b, q));
  const busyOrder = (data.orders || []).some(o => o.orderId !== exceptOrderId && isHolding(o, now) && sameHouse(o.villa, q.villa) && overlaps(o, q));
  return busyBooking || busyOrder;
}

/** 달력용: 독채별로 이미 찬 밤(체크인~체크아웃 전날) 목록. 이름·연락처 등은 내보내지 않는다 */
export function takenNights(now = Date.now()) {
  return serial(async () => {
    const data = await load();
    const result = { reef: new Set(), cove: new Set() };
    const add = (villa, checkIn, checkOut) => {
      for (let t = Date.parse(`${checkIn}T00:00:00Z`); t < Date.parse(`${checkOut}T00:00:00Z`); t += 864e5) {
        const key = new Date(t).toISOString().slice(0, 10);
        if (villa === 'reef' || villa === 'both') result.reef.add(key);
        if (villa === 'cove' || villa === 'both') result.cove.add(key);
      }
    };
    for (const b of data.bookings || []) if (b.status !== 'cancelled' && b.checkIn && b.checkOut) add(b.villa, b.checkIn, b.checkOut);
    for (const o of data.orders || []) if (isHolding(o, now)) add(o.villa, o.checkIn, o.checkOut);
    return { reef: [...result.reef].sort(), cove: [...result.cove].sort() };
  });
}

/** 주문 만들기. 이미 잡힌 날짜면 null */
export function createOrder(q, customer) {
  return serial(async () => {
    const data = await load();
    data.orders ||= [];
    if (isTaken(data, q)) return null;
    const order = {
      orderId: `ailo-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`,
      status: 'pending',
      createdAt: iso(new Date()),
      amount: q.total,
      orderName: q.orderName,
      villa: q.villa, villaName: q.villaName, guests: q.guests, checkIn: q.checkIn, checkOut: q.checkOut, nights: q.nights,
      name: customer.name, phone: customer.phone,
      consent: customer.consent,   // { privacyAt, refundAt } 동의 시각
      ...(customer.memberId ? { memberId: customer.memberId, memberNickname: customer.memberNickname } : {}),   // 카카오 로그인한 회원의 예약
    };
    data.orders.push(order);
    await save(data);
    return { ...order };
  });
}

/** 결제 확정 시작: 'pending' 이면 'confirming' 으로 바꾸고 주문을 돌려준다. 아니면 { blocked: 상태 } */
export function beginConfirm(orderId) {
  return serial(async () => {
    const data = await load();
    const order = (data.orders || []).find(o => o.orderId === orderId);
    if (!order) return { blocked: 'not_found' };
    if (order.status !== 'pending') return { blocked: order.status, order: { ...order } };
    // 10분이 지나 잡아 둔 날짜가 풀린 사이 다른 예약·결제가 그 날짜를 잡았으면 확정하지 않는다
    if (Date.now() - Date.parse(order.createdAt) >= HOLD_MS && isTaken(data, order, Date.now(), order.orderId)) {
      order.status = 'failed';
      order.failure = { code: 'HOLD_EXPIRED_TAKEN' };
      order.updatedAt = iso(new Date());
      await save(data);
      return { blocked: 'expired_taken' };
    }
    order.status = 'confirming';
    await save(data);
    return { order: { ...order } };
  });
}

/** 결제 확정 끝내기. paid 이면 예약을 만든다. payment 에는 카드 정보를 넣지 않는다. */
export function finishOrder(orderId, { paid, payment, failure }) {
  return serial(async () => {
    const data = await load();
    const order = (data.orders || []).find(o => o.orderId === orderId);
    if (!order) return null;
    if (paid) {
      order.status = 'paid';
      order.payment = payment;
      data.bookings ||= [];
      if (!data.bookings.some(b => b.orderId === orderId)) {
        data.bookings.push({
          id: `b-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
          orderId, createdAt: iso(new Date()), name: order.name, phone: order.phone,
          villa: order.villa, guests: order.guests, checkIn: order.checkIn, checkOut: order.checkOut,
          total: order.amount, status: 'new', updatedAt: iso(new Date()), payment, consent: order.consent,
          ...(order.memberId ? { memberId: order.memberId, memberNickname: order.memberNickname } : {}),
        });
      }
    } else {
      order.status = 'failed';
      order.failure = failure;
    }
    order.updatedAt = iso(new Date());
    await save(data);
    return { ...order };
  });
}

/** 실패·취소 화면에서 주문 정리 (결제 진행 중 상태만 바꾼다) */
export function markOrderStopped(orderId, code) {
  return serial(async () => {
    const data = await load();
    const order = (data.orders || []).find(o => o.orderId === orderId);
    if (!order || order.status !== 'pending') return false;
    order.status = code === 'PAY_PROCESS_CANCELED' ? 'canceled' : 'failed';
    order.failure = { code: String(code || '').slice(0, 60) };
    order.updatedAt = iso(new Date());
    await save(data);
    return true;
  });
}

/* ── 예약 문의 ── 사이트 문의 폼에서 들어온 것을 저장하고 문의번호를 붙인다. 관리자 "문의" 목록에 바로 보인다. */
export function addInquiry(entry) {
  return serial(async () => {
    const data = await load();
    data.inquiries ||= [];
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600 * 1000).toISOString();
    const number = `AQ-${kst.slice(2, 4)}${kst.slice(5, 7)}${kst.slice(8, 10)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const inquiry = { id: `q-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`, number, createdAt: iso(now), ...entry, status: 'new', updatedAt: iso(now) };
    data.inquiries.push(inquiry);
    await save(data);
    return { ...inquiry };
  });
}

/* ── 카카오 회원 ── 카카오 회원번호와 닉네임만 저장한다 (비밀번호·토큰·이메일 없음) */
export function upsertMember({ kakaoId, nickname }) {
  return serial(async () => {
    const data = await load();
    data.members ||= [];
    const id = `k-${kakaoId}`;
    const now = iso(new Date());
    let member = data.members.find(m => m.id === id);
    if (member) Object.assign(member, { nickname, lastLoginAt: now });
    else data.members.push(member = { id, kakaoId, nickname, createdAt: now, lastLoginAt: now });
    await save(data);
    return { ...member };
  });
}

export function getMember(id) {
  return serial(async () => {
    const data = await load();
    const member = (data.members || []).find(m => m.id === id);
    return member ? { ...member } : null;
  });
}

/** 내 예약만 (다른 회원 예약은 절대 섞이지 않게 회원ID로만 거른다) */
export function memberBookings(memberId) {
  return serial(async () => {
    const data = await load();
    return (data.bookings || []).filter(b => b.memberId && b.memberId === memberId).sort(newestFirst).map(b => ({
      id: b.id, createdAt: b.createdAt, villa: b.villa, guests: b.guests, checkIn: b.checkIn, checkOut: b.checkOut,
      total: b.total, status: b.status, paid: Boolean(b.payment && b.payment.status === 'paid'), name: b.name,
    }));
  });
}

/** 탈퇴: 회원 정보를 지우고, 남아 있는 예약에서는 회원 연결(회원ID·닉네임)만 떼어 낸다.
    예약 자체(이름·연락처·결제 기록)는 숙박·환불 처리를 위해 남긴다. */
export function deleteMember(id) {
  return serial(async () => {
    const data = await load();
    const before = (data.members || []).length;
    data.members = (data.members || []).filter(m => m.id !== id);
    for (const list of [data.bookings || [], data.orders || []]) {
      for (const item of list) if (item.memberId === id) { delete item.memberId; delete item.memberNickname; item.memberWithdrawn = true; }
    }
    await save(data);
    return data.members.length < before;
  });
}
