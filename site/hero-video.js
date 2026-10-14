/* Start optimized 1080p footage on the first scroll. WebM has an MP4 fallback. */
(() => {
  'use strict';
  const video = document.getElementById('heroVideo');
  const button = document.getElementById('heroVideoToggle');
  if (!video || !button) return;
  // 데스크톱(801px 이상)은 스크롤 프레임 히어로(hero-scroll.js)를 쓰므로 영상을 재생하지 않는다.
  if (window.matchMedia('(min-width: 801px)').matches) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let started = false;
  let pending = false;
  let visible = true;
  let manualPause = false;
  video.muted = true;
  video.defaultMuted = true;

  async function play() {
    if (pending || !visible || document.hidden) return;
    pending = true;
    try {
      await video.play();
      started = true;
      if (!visible || manualPause || document.hidden) video.pause();
    } catch (_) {
      button.hidden = false;
      button.textContent = '영상 재생';
    } finally { pending = false; }
  }
  function firstScroll(event) {
    if (reduced || started || manualPause) return;
    if (event.type === 'wheel' && event.deltaY <= 0) return;
    if (event.type === 'scroll' && window.scrollY <= 2) return;
    play();
  }
  window.addEventListener('wheel',firstScroll,{passive:true});
  window.addEventListener('scroll',firstScroll,{passive:true});
  window.addEventListener('touchmove',firstScroll,{passive:true});
  video.addEventListener('playing',() => {
    video.classList.add('is-ready');
    button.hidden = false;
    button.textContent = '영상 일시정지';
  });
  video.addEventListener('pause',() => { button.textContent = '영상 재생'; });
  button.addEventListener('click',() => {
    if (video.paused) { manualPause = false; play(); }
    else { manualPause = true; video.pause(); }
  });
  if (reduced) button.hidden = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (!visible) video.pause();
      else if (started && !manualPause && !reduced) play();
    },{threshold:.05}).observe(video.closest('.hero'));
  }
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) video.pause();
    else if (visible && started && !manualPause && !reduced) play();
  });
})();
