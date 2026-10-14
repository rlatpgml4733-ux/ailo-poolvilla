/* 헤더 메뉴의 회원 링크: 로그인 전 「카카오로 시작하기」, 로그인 후 「○○님의 예약」. 둘 다 my.html 로 간다. */
(() => {
  'use strict';
  const links = [...document.querySelectorAll('[data-member-link]')];
  if (!links.length) return;
  fetch('/api/auth/me', { cache: 'no-store' })
    .then(response => (response.ok ? response.json() : null))
    .then(body => {
      if (!body || !body.member) return;
      links.forEach(link => { link.textContent = `${body.member.nickname}님의 예약`; link.classList.add('is-member'); });
    })
    .catch(() => { /* 서버가 없는 정적 배포에서는 그대로 둔다 */ });
})();
