/* 데스크톱 스크롤 히어로: webp 프레임 묶음을 스크롤 위치에 맞춰 canvas에 그린다. 외부 라이브러리 없음.
   마우스 휠로 스크롤하면 목표 장면까지 부드럽게 따라가며 그려 영상이 재생되는 것처럼 보인다.
   모바일(800px 이하)에서는 그리지 않는다 — 모바일은 영상(hero-video.js)을 쓴다.
   창 너비가 바뀌어 801px 이상이 되면 그때 시작한다.
   스크롤로 직접 넘기는 장면이므로 Windows '애니메이션 효과 끄기'(모션 감소) 설정에서도 동작한다. */
(() => {
  'use strict';
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const hero = canvas.closest('.hero');
  const pin = canvas.closest('.hero-pin');
  const context = canvas.getContext('2d', { alpha:false });
  if (!context) return;
  const desktop = window.matchMedia('(min-width: 801px)');
  const count = Number(canvas.dataset.frameCount);
  const prefix = canvas.dataset.framePath;
  const frames = new Array(count);
  const loaded = new Array(count).fill(false);
  let started = false;
  let target = 0;      // 스크롤 위치가 가리키는 장
  let shown = 0;       // 지금 화면에 보이는 장(소수, 부드럽게 따라감)
  let drawn = -1;
  let ticking = false;
  let width = 0;
  let height = 0;

  const src = index => `${prefix}${String(index + 1).padStart(3, '0')}.webp`;

  // 요청한 장이 아직 없으면 가장 가까운 불러온 장을 대신 그린다.
  function nearestLoaded(index) {
    if (loaded[index]) return index;
    for (let step = 1; step < count; step += 1) {
      if (index - step >= 0 && loaded[index - step]) return index - step;
      if (index + step < count && loaded[index + step]) return index + step;
    }
    return -1;
  }

  function draw(want) {
    const index = nearestLoaded(want);
    if (index < 0 || !width || !height || index === drawn) return;
    const image = frames[index];
    // cover: 화면을 꽉 채우고 넘치는 쪽을 가운데 기준으로 자른다.
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    drawn = index;
    canvas.dataset.currentFrame = String(index + 1);
    canvas.classList.add('is-ready');
  }

  function load(index) {
    return new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        frames[index] = image;
        loaded[index] = true;
        if (drawn < 0 || index === Math.round(shown)) draw(Math.round(shown));
        resolve();
      };
      image.onerror = () => { canvas.dataset.frameError = String(index + 1); resolve(); };
      image.src = src(index);
    });
  }

  // 첫 장을 먼저 불러와 바로 보여주고, 나머지는 순서대로 미리 불러온다(동시 4개).
  async function preload() {
    await load(0);
    let next = 1;
    const worker = async () => { while (next < count) await load(next++); };
    await Promise.all([worker(), worker(), worker(), worker()]);
    canvas.dataset.loaded = 'all';
  }

  // 고정 구간 끝의 이만큼(화면 높이의 비율)은 마지막 장면에 머문다 → 휠 1~2번 더 내려도 마지막 장면 유지.
  const HOLD = 0.3;

  function readScroll() {
    const bounds = hero.getBoundingClientRect();
    const travel = Math.max(1, hero.offsetHeight - pin.clientHeight - pin.clientHeight * HOLD);
    const progress = Math.max(0, Math.min(1, -bounds.top / travel));
    target = progress * (count - 1);
    canvas.dataset.targetFrame = String(Math.round(target) + 1);
  }

  // 매 화면 갱신마다 보이는 장을 목표 장 쪽으로 조금씩 옮긴다 → 휠 한 번에도 영상처럼 이어서 재생된다.
  function tick() {
    readScroll();
    const gap = target - shown;
    shown = Math.abs(gap) < 0.5 ? target : shown + gap * 0.18;
    draw(Math.round(shown));
    if (Math.abs(target - shown) > 0.01) window.requestAnimationFrame(tick);
    else ticking = false;
  }

  function onScroll() {
    if (!started || ticking) return;
    ticking = true;
    window.requestAnimationFrame(tick);
  }

  // 기기 픽셀 비율에 맞춰 canvas 해상도를 정한다(과도한 메모리를 막기 위해 최대 2배).
  function resize() {
    if (!started) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(pin.clientWidth * pixelRatio));
    height = Math.max(1, Math.round(pin.clientHeight * pixelRatio));
    canvas.width = width;
    canvas.height = height;
    drawn = -1;
    readScroll();
    shown = target;
    draw(Math.round(shown));
  }

  function start() {
    if (started || !desktop.matches) return;
    started = true;
    resize();
    preload();
  }

  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', () => { start(); resize(); }, { passive:true });
  window.addEventListener('pageshow', resize);
  if (desktop.addEventListener) desktop.addEventListener('change', start);
  start();
})();
