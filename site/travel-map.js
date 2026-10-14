(function(){
  "use strict";
  /* basemap.js 를 불러온 주소에서 폴더 위치를 알아냅니다 — 이미지·글꼴이 같은 폴더에 있어야 합니다 */
  var BASE = (function(){
    var s = document.querySelector('script[src*="basemap.js"]');
    return s ? s.src.replace(/basemap\.js.*$/, '') : '';
  })();
  (function(){
    if(document.getElementById('gs-around-fonts')) return;
    var st = document.createElement('style'); st.id = 'gs-around-fonts';
    st.textContent = [['Regular',400],['SemiBold',600],['Bold',700]].map(function(w){
      return '@font-face{font-family:Pretendard;src:url(' + BASE + 'fonts/Pretendard-' + w[0] +
             '.woff2) format("woff2");font-weight:' + w[1] + ';font-style:normal;font-display:swap}';
    }).join('');
    document.head.appendChild(st);
  })();

  var stay = window.STAY, places = window.PLACES;
  var wrap = document.getElementById('gs-around-mapWrap');
  var canvas = document.getElementById('gs-around-mapCanvas');
  var pinLayer = document.getElementById('gs-around-pinLayer');
  /* 지도 그림(basemap.js)을 캔버스 맨 앞에 넣는다 */
  canvas.insertAdjacentHTML('afterbegin', window.BASEMAP_SVG.replace('href="images/', 'href="' + BASE + 'images/'));
  var linkLine = document.getElementById('gs-around-linkLine');
  var linkLineBase = document.getElementById('gs-around-linkLineBase');
  var sheet = document.getElementById('gs-around-sheet');
  var activeIndex = Math.max(0, places.findIndex(function(p){return p.id===window.DEFAULT_PLACE;}));
  var photoIndex = 0;
  var booting = true;   /* 첫 렌더 동안 카드 스크롤이 선택을 덮어쓰지 못하게 */

  /* ---------- 핀 그리기 ---------- */
  function houseIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 10.6V21h7v-5.6h5V21h7V10.6L12 3z"/></svg>';
  }
  var pinEls = [];
  places.forEach(function(p,i){
    var b = document.createElement('button');
    b.type='button';
    b.className='pin'+(p.x>72?' flip':'');
    b.setAttribute('aria-label', p.name);
    b.innerHTML = '<span class="dot"><i>'+(i+1)+'</i></span><span class="label">'+p.name+'</span>';
    b.addEventListener('click', function(e){ e.stopPropagation(); select(i, true); });
    pinLayer.appendChild(b); pinEls.push(b);
  });
  var stayEl = document.createElement('div');
  stayEl.className='pin pin-stay'+(stay.x>72?' flip':'');
  stayEl.innerHTML = '<span class="dot">'+houseIcon()+'</span><span class="label">숙소 위치</span>';
  pinLayer.appendChild(stayEl);

  /* ---------- 핀 위치 ----------
     지도 SVG 는 viewBox 1200x900 을 'slice'(꽉 채우고 넘치면 자르기)로 그립니다.
     지도 영역이 정확히 4:3 이 아닐 때도 핀이 그림과 어긋나지 않도록
     퍼센트를 화면 픽셀로 직접 환산합니다. */
  var VB_W = 1448, VB_H = 1086;  /* basemap.js 의 viewBox 와 같아야 합니다 */
  function mapPoint(xPct, yPct){
    var cw = canvas.clientWidth || wrap.clientWidth;
    var ch = canvas.clientHeight || wrap.clientHeight;
    var s = Math.max(cw / VB_W, ch / VB_H);
    return {
      x: (cw - VB_W * s) / 2 + xPct / 100 * VB_W * s,
      y: (ch - VB_H * s) / 2 + yPct / 100 * VB_H * s
    };
  }
  function layoutPins(){
    places.forEach(function(p, i){
      var q = mapPoint(p.x, p.y);
      pinEls[i].style.left = q.x + 'px'; pinEls[i].style.top = q.y + 'px';
    });
    var q = mapPoint(stay.x, stay.y);
    stayEl.style.left = q.x + 'px'; stayEl.style.top = q.y + 'px';
  }

  /* ---------- 카드 ---------- */
  function photoHTML(p, idx){
    var ph = p.photos[idx] || p.photos[0];
    var dots = '';
    if(p.photos.length>1){
      dots = '<div class="dots">'+p.photos.map(function(_,j){
        return '<button type="button" data-ph="'+j+'" class="'+(j===idx?'on':'')+'" aria-label="사진 '+(j+1)+'"></button>';
      }).join('')+'</div>';
    }
    return '<img src="'+BASE+ph.src+'" alt="'+p.name+'" loading="lazy">'+
           '<span class="credit">'+ph.credit+'</span>'+dots;
  }
  /* 사진이 실제로 떴을 때만 스켈레톤을 걷어냅니다 */
  function watchPhoto(box){
    var img = box.querySelector('img');
    box.classList.remove('is-ready');
    if(!img){ box.classList.add('is-ready'); return; }
    if(img.complete && img.naturalWidth){ box.classList.add('is-ready'); return; }
    var done = function(){ box.classList.add('is-ready'); };
    img.addEventListener('load', done, { once:true });
    img.addEventListener('error', done, { once:true });
  }
  function ctaHTML(p){
    return '<span>'+p.linkLabel+'</span><i aria-hidden="true">↗</i>';
  }
  function factsHTML(p){
    var rows = [['운영',p.hours],['주차',p.parking],['요금',p.fee]].filter(function(r){return r[1];});
    return rows.map(function(r){return '<li><span class="k">'+r[0]+'</span><span>'+r[1]+'</span></li>';}).join('');
  }
  var cardEl = document.getElementById('gs-around-card');
  function renderCard(animate){
    var p = places[activeIndex];
    var box = document.getElementById('gs-around-cardPhoto');
    document.getElementById('gs-around-cardCount').textContent = (activeIndex+1)+' / '+places.length;
    box.innerHTML = photoHTML(p, photoIndex);
    watchPhoto(box);
    document.getElementById('gs-around-cardNo').textContent = activeIndex+1;
    document.getElementById('gs-around-cardName').textContent = p.name;
    document.getElementById('gs-around-cardDrive').textContent = '차로 약 '+p.driveMin+'분';
    document.getElementById('gs-around-cardKm').textContent = '· '+p.driveKm;
    document.getElementById('gs-around-cardSummary').textContent = p.summary;
    var f = document.getElementById('gs-around-cardFacts');
    var fh = factsHTML(p);
    f.innerHTML = fh; f.hidden = !fh;
    var cta = document.getElementById('gs-around-cardCta');
    cta.href = p.linkUrl; cta.innerHTML = ctaHTML(p);
    if(animate){               /* 애니메이션을 다시 트리거하려면 한 번 떼었다 붙여야 합니다 */
      cardEl.classList.remove('swap');
      void cardEl.offsetWidth;
      cardEl.classList.add('swap');
    }
  }
  document.getElementById('gs-around-cardPhoto').addEventListener('click', function(e){
    var b = e.target.closest('[data-ph]'); if(!b) return;
    photoIndex = +b.dataset.ph; renderCard(false);
  });

  /* 모바일 카드 리스트 */
  places.forEach(function(p,i){
    var el = document.createElement('article');
    el.className='card'; el.dataset.idx=i;
    el.innerHTML =
      '<div class="photo">'+photoHTML(p,0)+'</div>'+
      '<div class="card-body">'+
        '<h3 class="place-name"><span class="place-no">'+(i+1)+'</span><span>'+p.name+'</span></h3>'+
        '<div class="drive"><strong>차로 약 '+p.driveMin+'분</strong><span class="km">· '+p.driveKm+'</span>'+
        '<span class="caveat">교통상황에 따라 달라질 수 있어요</span></div>'+
        '<p class="summary">'+p.summary+'</p>'+
        (factsHTML(p)?'<ul class="facts">'+factsHTML(p)+'</ul>':'')+
        '<a class="cta" href="'+p.linkUrl+'" target="_blank" rel="noopener noreferrer">'+ctaHTML(p)+'</a>'+
      '</div>';
    el.querySelector('.photo').addEventListener('click', function(e){
      var b = e.target.closest('[data-ph]'); if(!b) return;
      this.innerHTML = photoHTML(p, +b.dataset.ph);
      watchPhoto(this);
    });
    sheet.appendChild(el);
    watchPhoto(el.querySelector('.photo'));
  });

  /* ---------- 지도 변환 ---------- */
  var scale=1, tx=0, ty=0, minScale=1, maxScale=3;
  function canvasSize(){
    return { w: canvas.clientWidth || wrap.clientWidth, h: canvas.clientHeight || wrap.clientHeight };
  }
  function computeMin(){ minScale = 1; maxScale = 3.2; }
  function clamp(){
    var c = canvasSize();
    var sw = c.w*scale, sh = c.h*scale;
    var mx = Math.max(0,(sw - wrap.clientWidth)/2);
    var my = Math.max(0,(sh - wrap.clientHeight)/2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  }
  var resetBtnEl = document.getElementById('gs-around-resetBtn');
  function apply(animate){
    clamp();
    wrap.classList.toggle('is-zoomed', scale > minScale * 1.02);
    canvas.classList.toggle('animate', !!animate);
    canvas.style.transform = 'translate('+tx+'px,'+ty+'px) scale('+scale+')';
    resetBtnEl.hidden = (scale <= minScale*1.02 && Math.abs(tx)<1 && Math.abs(ty)<1);
  }
  /* 전체가 다 보이는 상태(기본)에서는 지도를 움직이지 않고,
     확대된 상태에서만 선택한 핀이 가운데로 오도록 이동합니다. */
  function focusPin(p, animate){
    if(scale <= minScale*1.02) return;
    var c = canvasSize(), q = mapPoint(p.x, p.y);
    tx = -(q.x - c.w/2)*scale; ty = -(q.y - c.h/2)*scale;
    apply(animate);
  }
  function resetView(){
    scale = minScale; tx=0; ty=0; apply(true);
  }

  /* ---------- 모바일 카드 슬라이더 위치 맞추기 ----------
     우리가 옮긴 스크롤을 아래 scroll 리스너가 "사용자가 넘겼다"고 오해하면
     첫 화면 선택이 1번으로 덮어써집니다. 그래서 옮기는 동안 표시를 남깁니다. */
  var isMobile = function(){ return window.matchMedia('(max-width:860px)').matches; };
  var sheetSync = false, sheetSyncTimer = null;
  function scrollSheetTo(i, behavior){
    if(!isMobile()) return;
    var mcard = sheet.querySelector('[data-idx="'+i+'"]');
    if(!mcard) return;
    var left = mcard.offsetLeft - (sheet.clientWidth - mcard.clientWidth)/2;
    /* 사용자가 이미 그 카드로 넘겨놓은 상태면 건드리지 않는다.
       (여기서 굳이 스크롤하면 다음 스와이프가 한 번 씹힘) */
    if(Math.abs(sheet.scrollLeft - left) < 4) return;
    sheetSync = true;
    clearTimeout(sheetSyncTimer);
    sheetSyncTimer = setTimeout(function(){ sheetSync = false; }, 500);
    sheet.scrollTo({ left: left, behavior: behavior || 'smooth' });
  }

  /* ---------- 선택 ---------- */
  function select(i, move){
    activeIndex=i; photoIndex=0;
    pinEls.forEach(function(el,j){ el.classList.toggle('is-active', j===i); });
    var p = places[i];
    /* 점선은 지도와 같은 viewBox 단위로 그립니다 (어두운 띠 + 주황 점선 두 겹) */
    [linkLineBase, linkLine].forEach(function(ln){
      ln.setAttribute('x1', stay.x/100*VB_W); ln.setAttribute('y1', stay.y/100*VB_H);
      ln.setAttribute('x2', p.x/100*VB_W);    ln.setAttribute('y2', p.y/100*VB_H);
    });
    renderCard(!booting);
    if(move) focusPin(p, true);
    scrollSheetTo(i);
  }

  /* ---------- 드래그 ---------- */
  var dragging=false, moved=false, sx=0, sy=0, stx=0, sty=0;
  function onMove(e){
    if(!dragging) return;
    var dx=e.clientX-sx, dy=e.clientY-sy;
    if(!moved && Math.abs(dx)+Math.abs(dy)>5){ moved=true; wrap.classList.add('dragging'); }
    if(!moved) return;
    e.preventDefault();
    tx=stx+dx; ty=sty+dy; apply(false);
  }
  function onUp(){
    if(!dragging) return;
    dragging=false; wrap.classList.remove('dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    setTimeout(function(){ moved=false; }, 0);
  }
  wrap.addEventListener('pointerdown', function(e){
    if(e.target.closest('.map-ui')) return;
    if(e.pointerType === 'touch' && scale <= minScale * 1.02) return;
    if(e.button!==0 && e.pointerType==='mouse') return;
    dragging=true; moved=false; sx=e.clientX; sy=e.clientY; stx=tx; sty=ty;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  /* 드래그 직후의 클릭은 무시 (핀이 잘못 선택되는 것 방지) */
  wrap.addEventListener('click', function(e){
    if(moved){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- 휠 확대 ---------- */
  wrap.addEventListener('wheel', function(e){
    if(!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    var r = wrap.getBoundingClientRect();
    var cx = e.clientX - r.left - r.width/2;
    var cy = e.clientY - r.top - r.height/2;
    var prev = scale;
    var next = Math.min(maxScale, Math.max(minScale, scale * (e.deltaY<0?1.14:1/1.14)));
    if(next===prev) return;
    tx = cx - (cx - tx) * (next/prev);
    ty = cy - (cy - ty) * (next/prev);
    scale = next; apply(false);
  }, { passive:false });

  function zoomBy(f){
    var prev=scale;
    scale = Math.min(maxScale, Math.max(minScale, scale*f));
    tx *= scale/prev; ty *= scale/prev;
    apply(true);
  }
  document.getElementById('gs-around-zoomIn').addEventListener('click', function(){ zoomBy(1.3); });
  document.getElementById('gs-around-zoomOut').addEventListener('click', function(){ zoomBy(1/1.3); });
  document.getElementById('gs-around-resetBtn').addEventListener('click', resetView);
  document.getElementById('gs-around-prevBtn').addEventListener('click', function(){
    select((activeIndex-1+places.length)%places.length, true);
  });
  document.getElementById('gs-around-nextBtn').addEventListener('click', function(){
    select((activeIndex+1)%places.length, true);
  });

  /* ---------- 모바일: 카드 넘기면 지도도 따라감 ---------- */
  var sheetTimer=null;
  sheet.addEventListener('scroll', function(){
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(function(){
      /* 첫 렌더 중이거나, 우리가 옮긴 스크롤이면 선택을 바꾸지 않는다 */
      if(booting) return;
      if(sheetSync){ sheetSync = false; clearTimeout(sheetSyncTimer); return; }
      var center = sheet.scrollLeft + sheet.clientWidth/2, best=0, bd=Infinity;
      Array.prototype.forEach.call(sheet.children, function(el,i){
        var d = Math.abs(el.offsetLeft + el.clientWidth/2 - center);
        if(d<bd){ bd=d; best=i; }
      });
      if(best!==activeIndex) select(best, true);
    }, 110);
  });

  /* ---------- 출처 표기 ---------- */
  (function(){
    document.getElementById('gs-around-footNote').textContent =
      '운영시간과 요금은 변경될 수 있으니 방문 전 공식 안내 또는 네이버 지도에서 확인해 주세요.';
  })();

  /* ---------- 시작 ---------- */
  /* 첫 렌더가 끝날 때까지는 스크롤 리스너가 선택을 덮어쓰지 못하게 막는다.
     (레이아웃이 잡히기 전 sheet.scrollTo 가 먹지 않아 1번으로 튀던 문제) */
  function settleSheet(){
    scrollSheetTo(activeIndex, 'auto');
  }
  /* 핀이 숙소에서 가까운 순으로 하나씩 올라오게 */
  function animatePins(){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var all = pinEls.concat([stayEl]);
    all.forEach(function(el, i){
      el.style.animationDelay = (i === all.length - 1 ? 0 : 0.12 + i * 0.045) + 's';
      el.classList.add('enter');
    });
    setTimeout(function(){
      all.forEach(function(el){ el.classList.remove('enter'); el.style.animationDelay = ''; });
    }, 1400);
  }
  function boot(){
    computeMin(); scale=minScale; tx=0; ty=0;
    layoutPins(); apply(false); select(activeIndex, false);
    animatePins();
    settleSheet();
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        settleSheet();
        setTimeout(function(){ booting = false; }, 120);
      });
    });
  }
  /* 사진이 늦게 뜨면서 카드 폭이 바뀔 수 있어 한 번 더 맞춘다 */
  window.addEventListener('load', function(){
    booting = true;
    settleSheet();
    setTimeout(function(){ booting = false; }, 150);
  });
  /* 사진이 늦게 뜨거나 스크롤바가 생겨서 지도 칸 크기가 바뀌면 핀이 그림에서 밀립니다.
     창 크기 변화만으로는 놓치는 경우가 있어 지도 칸 자체를 관찰합니다. */
  if(window.ResizeObserver){
    new ResizeObserver(function(){ layoutPins(); apply(false); }).observe(canvas);
  }
  var lastMobile = isMobile();
  window.addEventListener('resize', function(){
    computeMin(); layoutPins(); apply(false);
    if(isMobile() !== lastMobile){       // PC <-> 모바일 전환 시 슬라이더 재정렬
      lastMobile = isMobile();
      booting = true; settleSheet();
      setTimeout(function(){ booting = false; }, 200);
    }
  });
  boot();

})();
