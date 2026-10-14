/* Mobile navigation and month paging; ordinary links still work without JS. */
(() => {
  const header = document.querySelector('.header');
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');
  function closeMenu(returnFocus=false) {
    header.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','메뉴 열기');
    if(returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open',open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');
  });
  nav.addEventListener('click', event => { if(event.target.closest('a')) closeMenu(); });
  header.querySelector('.reserve').addEventListener('click', () => closeMenu());
  document.addEventListener('click', event => { if(!header.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => {
    if(event.key==='Escape' && header.classList.contains('menu-open')) closeMenu(true);
  });
  const compact = matchMedia('(max-width:800px)');
  compact.addEventListener('change', () => closeMenu());

  const calendar = document.getElementById('availabilityCalendar');
  const previous = document.getElementById('availabilityPrev');
  const next = document.getElementById('availabilityNext');
  const position = document.getElementById('availabilityPosition');
  if (calendar && previous && next && position) {
  function currentMonth() {
    const children = Array.from(calendar.children);
    return children.reduce((best,child,i) => Math.abs(child.offsetLeft-calendar.firstElementChild.offsetLeft-calendar.scrollLeft) < Math.abs(children[best].offsetLeft-calendar.firstElementChild.offsetLeft-calendar.scrollLeft) ? i : best,0);
  }
  function updateMonth() {
    const i=currentMonth();
    previous.disabled=i===0;
    next.disabled=i>=calendar.children.length-1;
    position.textContent=(i+1)+' / '+calendar.children.length+'개월';
  }
  function moveMonth(delta) {
    const i=Math.max(0,Math.min(calendar.children.length-1,currentMonth()+delta));
    const month=calendar.children[i];
    calendar.scrollTo({left:month.offsetLeft-calendar.firstElementChild.offsetLeft,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
    setTimeout(updateMonth,500);
  }
  previous.addEventListener('click',()=>moveMonth(-1));
  next.addEventListener('click',()=>moveMonth(1));
  calendar.addEventListener('scroll',updateMonth,{passive:true});
  calendar.addEventListener('scrollend',updateMonth);
  calendar.addEventListener('keydown',event=>{
    if(innerWidth>720)return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();moveMonth(event.key==='ArrowRight'?1:-1);}
  });
  new MutationObserver(updateMonth).observe(calendar,{childList:true});
  window.addEventListener('resize',updateMonth);
  updateMonth();
  }

  // Keep the requested two-line captions inside their actual rendered measure.
  const heroTitle = document.querySelector('.hero h1');
  const heroCopy = document.querySelector('.hero-copy');
  const arrivalCopy = document.querySelector('.arrival-first');
  function fitTwoLines(element, lines, width) {
    element.style.fontSize='14px';
    const widest=Math.max(...Array.from(lines, line=>{
      const range=document.createRange();
      range.selectNodeContents(line);
      return range.getBoundingClientRect().width;
    }));
    if(widest>0 && width>0) {
      element.style.fontSize=(Math.floor(14*Math.min(1,(width-1)/widest)*4)/4)+'px';
    }
  }
  function fitMobileCopy() {
    if(!heroTitle || !heroCopy || !arrivalCopy) return;
    if(!compact.matches) {
      heroCopy.style.removeProperty('width');
      heroCopy.style.removeProperty('font-size');
      arrivalCopy.style.removeProperty('font-size');
      arrivalCopy.closest('.route-guide').style.removeProperty('--arrival-copy-size');
      return;
    }
    const titleWidth=heroTitle.getBoundingClientRect().width;
    heroCopy.style.width=titleWidth+'px';
    fitTwoLines(heroCopy,heroCopy.querySelectorAll('.hero-copy-mobile > span'),titleWidth);
    fitTwoLines(arrivalCopy,arrivalCopy.children,arrivalCopy.getBoundingClientRect().width);
    arrivalCopy.closest('.route-guide').style.setProperty('--arrival-copy-size',arrivalCopy.style.fontSize);
  }
  window.addEventListener('resize',fitMobileCopy);
  if(document.fonts) document.fonts.ready.then(fitMobileCopy);
  fitMobileCopy();
})();
