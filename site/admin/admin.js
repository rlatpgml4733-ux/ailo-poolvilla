/* 아일로 관리자 화면: 로그인 → 예약·문의 목록 → 상태 변경. 모든 데이터는 /api/admin/* 에서 쿠키로 확인 후 내려온다. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  const VILLA = { reef: '리프 하우스', cove: '코브 하우스', both: '두 독채 함께' };
  const LABELS = {
    booking: { new: '신규', confirmed: '확정', cancelled: '취소', completed: '이용 완료' },
    inquiry: { new: '신규', in_progress: '답변 중', answered: '답변 완료' },
  };
  let data = { bookings: [], inquiries: [] };
  let tab = 'booking';
  let filter = 'all';

  /* ── 공통 ── */
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
    });
    let body = {};
    try { body = await response.json(); } catch { /* 빈 응답 */ }
    return { status: response.status, ok: response.ok, body };
  }

  let toastTimer;
  function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
  const pad = n => String(n).padStart(2, '0');
  const dateTime = iso => { const d = new Date(iso); return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const shortDate = ymd => { const [, m, d] = String(ymd).split('-'); return `${Number(m)}.${d}`; };
  const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  function cell(label, content, className) {
    const td = document.createElement('td');
    td.dataset.label = label;
    if (className) td.className = className;
    if (content instanceof Node) td.append(content); else td.textContent = content;
    return td;
  }

  /* ── 화면 전환 ── */
  function showLogin(message) {
    $('appView').hidden = true;
    $('loginView').hidden = false;
    $('loginError').textContent = message || '';
    $('password').value = '';
    $('password').focus();
  }
  async function showApp() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    await Promise.all([loadItems(), loadPopups()]);
  }

  /* ── 로그인 / 로그아웃 ── */
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('password').value;
    if (!password) { $('loginError').textContent = '비밀번호를 입력하세요.'; return; }
    $('loginButton').disabled = true;
    const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
    $('loginButton').disabled = false;
    if (result.ok) { $('password').value = ''; await showApp(); }
    else { $('loginError').textContent = result.body.error || '로그인하지 못했습니다.'; $('password').select(); }
  });

  $('logoutButton').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    data = { bookings: [], inquiries: [] };
    $('bookingRows').replaceChildren();
    $('inquiryRows').replaceChildren();
    popups = [];
    $('popupItems').replaceChildren();
    showLogin('로그아웃했습니다.');
  });

  /* ── 목록 ── */
  async function loadItems() {
    const result = await api('/api/admin/items');
    if (result.status === 401) return showLogin('다시 로그인하세요.');
    if (!result.ok) return toast(result.body.error || '목록을 불러오지 못했습니다.', true);
    data = result.body;
    render();
  }

  function statusSelect(type, item) {
    const select = document.createElement('select');
    select.className = 'status-select';
    select.dataset.status = item.status;
    select.setAttribute('aria-label', `${item.name} 상태`);
    for (const [value, label] of Object.entries(LABELS[type])) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === item.status;
      select.append(option);
    }
    select.addEventListener('change', () => changeStatus(type, item, select));
    return select;
  }

  async function changeStatus(type, item, select) {
    const previous = item.status;
    const next = select.value;
    select.disabled = true;
    const result = await api('/api/admin/status', { method: 'POST', body: JSON.stringify({ type, id: item.id, status: next }) });
    select.disabled = false;
    if (result.status === 401) { select.value = previous; return showLogin('로그인 시간이 끝났습니다. 다시 로그인하세요.'); }
    if (!result.ok) { select.value = previous; return toast(result.body.error || '상태를 바꾸지 못했습니다.', true); }
    item.status = next;
    item.updatedAt = result.body.item && result.body.item.updatedAt;
    toast(`${item.name} · ${LABELS[type][next]}(으)로 바꿨습니다.`);
    render();
  }

  function nameCell(label, item) {
    const wrap = document.createElement('span');
    wrap.textContent = item.name;
    // 카카오 로그인 회원의 예약이면 닉네임도 함께
    if (item.memberNickname) { const k = document.createElement('span'); k.className = 'badge-kakao'; k.textContent = `카카오 · ${item.memberNickname}`; wrap.append(k); }
    if (item.sample) { const b = document.createElement('span'); b.className = 'badge-sample'; b.textContent = '예시'; wrap.append(b); }
    return cell(label, wrap, 'nowrap');
  }

  // 금액 + 결제 상태 (결제로 들어온 예약은 '결제 완료', 예시·수동 예약은 '미결제')
  function amountCell(b) {
    const wrap = document.createElement('span');
    wrap.textContent = won(b.total);
    const sub = document.createElement('span');
    sub.className = `sub ${b.payment && b.payment.status === 'paid' ? 'is-paid' : ''}`;
    sub.textContent = b.payment && b.payment.status === 'paid' ? `결제 완료${b.payment.method ? ` · ${b.payment.method}` : ''}` : '미결제';
    wrap.append(sub);
    return wrap;
  }

  function render() {
    const { bookings, inquiries } = data;
    $('newBookings').textContent = bookings.filter(b => b.status === 'new').length;
    $('newInquiries').textContent = inquiries.filter(q => q.status === 'new').length;
    $('countBookings').textContent = bookings.length;
    $('countInquiries').textContent = inquiries.length;
    $('sampleNote').hidden = ![...bookings, ...inquiries].some(item => item.sample);

    // 상태 필터 (탭마다 다른 상태 목록, 팝업 탭에는 없음)
    $('filterWrap').hidden = tab === 'popup';
    if (tab !== 'popup') {
      const select = $('statusFilter');
      const options = [['all', '전체'], ...Object.entries(LABELS[tab])];
      if (!options.some(([value]) => value === filter)) filter = 'all';
      select.replaceChildren(...options.map(([value, label]) => { const o = document.createElement('option'); o.value = value; o.textContent = label; o.selected = value === filter; return o; }));
    }

    const pick = list => list.filter(item => filter === 'all' || item.status === filter);

    const bookingRows = pick(bookings).map(b => {
      const tr = document.createElement('tr');
      const schedule = document.createElement('span');
      schedule.textContent = `${shortDate(b.checkIn)} ~ ${shortDate(b.checkOut)}`;
      const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = `${nights(b.checkIn, b.checkOut)}박`;
      schedule.append(sub);
      tr.append(
        cell('접수', dateTime(b.createdAt), 'nowrap'),
        nameCell('예약자', b),
        cell('연락처', b.phone, 'nowrap'),
        cell('독채', VILLA[b.villa] || b.villa, 'nowrap'),
        cell('일정', schedule, 'nowrap'),
        cell('인원', `${b.guests}인`, 'num'),
        cell('금액', amountCell(b), 'num'),
        cell('상태', statusSelect('booking', b)),
      );
      return tr;
    });
    $('bookingRows').replaceChildren(...bookingRows);
    $('bookingEmpty').hidden = bookingRows.length > 0;

    const inquiryRows = pick(inquiries).map(q => {
      const tr = document.createElement('tr');
      // 접수 시각 + 문의번호
      const received = document.createElement('span');
      received.textContent = dateTime(q.createdAt);
      if (q.number) { const n = document.createElement('span'); n.className = 'sub'; n.textContent = q.number; received.append(n); }
      // 문의 내용 + 희망 날짜·인원
      const body = document.createElement('span');
      body.textContent = q.message;
      const wish = [q.checkIn && q.checkOut ? `${shortDate(q.checkIn)} ~ ${shortDate(q.checkOut)}` : q.checkIn ? `${shortDate(q.checkIn)} 입실` : '', q.guests ? `${q.guests}인` : ''].filter(Boolean).join(' · ');
      if (wish) { const w = document.createElement('span'); w.className = 'sub'; w.textContent = `희망: ${wish}`; body.append(w); }
      tr.append(
        cell('접수', received, 'nowrap'),
        nameCell('이름', q),
        cell('연락처', q.phone, 'nowrap'),
        cell('문의 내용', body, 'message'),
        cell('상태', statusSelect('inquiry', q)),
      );
      return tr;
    });
    $('inquiryRows').replaceChildren(...inquiryRows);
    $('inquiryEmpty').hidden = inquiryRows.length > 0;
  }

  /* ── 탭·필터 ── */
  function setTab(next) {
    tab = next;
    filter = 'all';
    $('tabBookings').setAttribute('aria-selected', String(tab === 'booking'));
    $('tabInquiries').setAttribute('aria-selected', String(tab === 'inquiry'));
    $('tabPopups').setAttribute('aria-selected', String(tab === 'popup'));
    $('panelBookings').hidden = tab !== 'booking';
    $('panelInquiries').hidden = tab !== 'inquiry';
    $('panelPopups').hidden = tab !== 'popup';
    render();
  }
  $('tabBookings').addEventListener('click', () => setTab('booking'));
  $('tabInquiries').addEventListener('click', () => setTab('inquiry'));
  $('tabPopups').addEventListener('click', () => setTab('popup'));
  $('statusFilter').addEventListener('change', event => { filter = event.target.value; render(); });


  /* ── 팝업: 올리기 · 게시 켜기/끄기 · 삭제 ── */
  const POPUP_MAX_BYTES = 3 * 1024 * 1024;
  let popups = [];
  let pickedImage = '';

  async function loadPopups() {
    const result = await api('/api/admin/popups');
    if (result.status === 401) return showLogin('다시 로그인하세요.');
    if (!result.ok) return toast(result.body.error || '팝업 목록을 불러오지 못했습니다.', true);
    popups = result.body.popups || [];
    renderPopups();
  }

  function renderPopups() {
    $('countPopups').textContent = popups.length;
    const items = popups.map(p => {
      const li = document.createElement('li');
      li.className = `popup-item${p.active ? ' is-active' : ''}`;
      const img = document.createElement('img');
      img.src = p.imageUrl;
      img.alt = p.alt;
      img.loading = 'lazy';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = p.alt;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${dateTime(p.createdAt)} 올림 · 누르면 이동: ${p.link || '없음'}`;
      const state = document.createElement('span');
      state.className = 'popup-state';
      state.textContent = p.active ? '사이트에 게시 중' : '내려둠';
      info.append(title, meta, state);
      const actions = document.createElement('div');
      actions.className = 'popup-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `btn-small${p.active ? '' : ' is-primary'}`;
      toggle.textContent = p.active ? '내리기' : '게시하기';
      toggle.addEventListener('click', () => togglePopup(p, toggle));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-small is-danger';
      remove.textContent = '삭제';
      remove.addEventListener('click', () => removePopup(p, remove));
      actions.append(toggle, remove);
      li.append(img, info, actions);
      return li;
    });
    $('popupItems').replaceChildren(...items);
    $('popupEmpty').hidden = items.length > 0;
  }

  async function togglePopup(popup, button) {
    button.disabled = true;
    const result = await api('/api/admin/popups', { method: 'PATCH', body: JSON.stringify({ id: popup.id, active: !popup.active }) });
    button.disabled = false;
    if (result.status === 401) return showLogin('로그인 시간이 끝났습니다. 다시 로그인하세요.');
    if (!result.ok) return toast(result.body.error || '바꾸지 못했습니다.', true);
    toast(popup.active ? '팝업을 내렸습니다. 사이트에 더 이상 뜨지 않습니다.' : '팝업을 게시했습니다. 메인 첫 화면에 함께 뜹니다.');
    await loadPopups();
  }

  // 삭제는 버튼을 두 번 눌러 확정한다. (브라우저 확인창 window.confirm 은 일부 환경 — 앱 안 미리보기 등 — 에서
  // 자동으로 '취소'가 되어 삭제가 막히므로 쓰지 않는다)
  async function removePopup(popup, button) {
    if (button.dataset.armed !== 'true') {
      button.dataset.armed = 'true';
      button.textContent = '한 번 더 누르면 삭제';
      button.classList.add('is-armed');
      toast(`"${popup.alt}" — 삭제 버튼을 한 번 더 누르면 지워집니다. (이미지도 함께 삭제, 되돌릴 수 없음)`);
      clearTimeout(button.armTimer);
      button.armTimer = setTimeout(() => {
        button.dataset.armed = 'false';
        button.textContent = '삭제';
        button.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(button.armTimer);
    button.disabled = true;
    button.textContent = '삭제 중…';
    const result = await api('/api/admin/popups', { method: 'DELETE', body: JSON.stringify({ id: popup.id }) });
    button.disabled = false;
    button.dataset.armed = 'false';
    button.textContent = '삭제';
    button.classList.remove('is-armed');
    if (result.status === 401) return showLogin('로그인 시간이 끝났습니다. 다시 로그인하세요.');
    if (!result.ok) return toast(result.body.error || '삭제하지 못했습니다.', true);
    toast('팝업을 삭제했습니다.');
    await loadPopups();
  }

  function resetPopupForm() {
    pickedImage = '';
    $('popupForm').reset();
    $('popupActive').checked = true;
    $('popupPreview').hidden = true;
    $('popupPreview').removeAttribute('src');
    $('popupFileText').firstChild.textContent = '이미지 고르기';
    $('popupFile').closest('.drop').classList.remove('has-image');
  }

  $('popupFile').addEventListener('change', () => {
    const file = $('popupFile').files[0];
    $('popupError').textContent = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      $('popupError').textContent = 'JPG, PNG, WebP 이미지만 올릴 수 있습니다.';
      $('popupFile').value = '';
      return;
    }
    if (file.size > POPUP_MAX_BYTES) {
      $('popupError').textContent = '이미지가 너무 큽니다. 3MB 이하로 올려 주세요.';
      $('popupFile').value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pickedImage = String(reader.result);
      $('popupPreview').src = pickedImage;
      $('popupPreview').hidden = false;
      $('popupFileText').firstChild.textContent = '다른 이미지 고르기';
      $('popupFile').closest('.drop').classList.add('has-image');
    };
    reader.readAsDataURL(file);
  });

  $('popupForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!pickedImage) { $('popupError').textContent = '먼저 팝업 이미지를 골라 주세요.'; return; }
    $('popupSubmit').disabled = true;
    const result = await api('/api/admin/popups', {
      method: 'POST',
      body: JSON.stringify({ image: pickedImage, alt: $('popupAlt').value, link: $('popupLink').value, active: $('popupActive').checked }),
    });
    $('popupSubmit').disabled = false;
    if (result.status === 401) return showLogin('로그인 시간이 끝났습니다. 다시 로그인하세요.');
    if (!result.ok) { $('popupError').textContent = result.body.error || '올리지 못했습니다.'; return; }
    toast(result.body.popup.active ? '팝업을 올리고 사이트에 게시했습니다.' : '팝업을 올렸습니다. (아직 게시 전)');
    resetPopupForm();
    await loadPopups();
  });

  /* ── 시작: 로그인 상태 확인 ── */
  api('/api/admin/session').then(result => (result.body.loggedIn ? showApp() : showLogin()));
})();
