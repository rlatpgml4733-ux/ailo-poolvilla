/* 메인 첫 화면 팝업: 관리자에서 게시한 팝업을 모두 나란히 띄운다.
   아래 "오늘 하루 보지 않기" 또는 ✕ 중 하나만 눌러도 전부 한꺼번에 닫힌다.
   "오늘 하루 보지 않기"는 이 기기에서 그날 지금 보인 팝업들을 다시 띄우지 않는다(그날 새로 올라온 팝업은 뜸).
   API가 없는 곳(정적 미리보기)에서는 아무것도 하지 않는다. */
(() => {
  'use strict';
  const root = document.getElementById('sitePopup');
  if (!root || !window.fetch) return;
  const row = document.getElementById('sitePopupRow');
  const closeBtn = document.getElementById('sitePopupClose');
  const todayBtn = document.getElementById('sitePopupToday');
  const STORE_KEY = 'ailo-popup-hidden';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const readHidden = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return saved && saved.date === today() && Array.isArray(saved.ids) ? saved.ids : [];
    } catch { return []; }
  };
  let shownIds = [];
  let lastFocus = null;

  function close(rememberToday) {
    if (rememberToday) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ date: today(), ids: [...new Set([...readHidden(), ...shownIds])] })); }
      catch { /* 저장 불가 환경: 이번만 닫힘 */ }
    }
    root.hidden = true;
    document.documentElement.classList.remove('popup-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fit);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function onKey(event) {
    if (event.key === 'Escape') close(false);
    if (event.key === 'Tab') {   // 팝업 안에서만 이동
      const items = [...root.querySelectorAll('a[href], button')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  // PC: 모든 이미지를 같은 높이로, 비율은 그대로 — 화면 폭에 다 들어가도록 높이를 정한다 (빈 여백 없음)
  const mobile = matchMedia('(max-width:720px)');
  function fit() {
    const imgs = [...row.querySelectorAll('img')];
    if (!imgs.length) return;
    if (mobile.matches) { imgs.forEach(img => { img.style.height = ''; img.style.width = ''; }); return; }
    const ratios = imgs.map(img => (img.naturalWidth || 3) / (img.naturalHeight || 4));
    const gap = 8 * (imgs.length - 1);
    const maxHeight = Math.min(window.innerHeight * 0.66, 580);
    const height = Math.min(maxHeight, (window.innerWidth - 40 - gap) / ratios.reduce((a, b) => a + b, 0));
    imgs.forEach((img, i) => { img.style.height = `${Math.floor(height)}px`; img.style.width = `${Math.floor(height * ratios[i])}px`; });
  }

  closeBtn.addEventListener('click', () => close(false));
  todayBtn.addEventListener('click', () => close(true));
  root.addEventListener('click', event => { if (event.target === root) close(false); });

  function card(popup) {
    const el = document.createElement(popup.link ? 'a' : 'div');
    el.className = 'site-popup-card';
    if (popup.link) {
      el.href = popup.link;
      el.addEventListener('click', () => close(false));
    }
    const img = document.createElement('img');
    img.alt = popup.alt || '아일로 풀빌라 안내';
    img.decoding = 'async';
    el.append(img);
    const loaded = new Promise(resolve => {
      img.onload = () => resolve(el);
      img.onerror = () => resolve(null);   // 이미지가 없으면 그 카드만 뺀다
    });
    img.src = popup.imageUrl;
    return loaded;
  }

  fetch('/api/popup', { headers: { Accept: 'application/json' } })
    .then(response => (response.ok ? response.json() : null))
    .then(async data => {
      const hidden = readHidden();
      const popups = ((data && data.popups) || []).filter(p => !hidden.includes(p.id));
      if (!popups.length) return;
      const results = await Promise.all(popups.map(card));
      const pairs = popups.map((popup, i) => [popup, results[i]]).filter(([, el]) => el);
      if (!pairs.length) return;
      shownIds = pairs.map(([popup]) => popup.id);
      const cards = pairs.map(([, el]) => el);
      row.style.setProperty('--n', cards.length);
      row.classList.toggle('is-single', cards.length === 1);
      row.replaceChildren(...cards);
      fit();
      window.addEventListener('resize', fit);
      lastFocus = document.activeElement;
      root.hidden = false;
      document.documentElement.classList.add('popup-open');
      document.addEventListener('keydown', onKey);
      closeBtn.focus({ preventScroll: true });
    })
    .catch(() => { /* API 없음: 팝업 없이 진행 */ });
})();
