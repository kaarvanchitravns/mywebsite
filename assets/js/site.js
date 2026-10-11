(function(){
  var m = /^#\/?(products|solutions|platform|about|contact)$/.exec(window.location.hash);
  if(m && document.documentElement.getAttribute('data-page') === 'home'){ window.location.replace(m[1] + (window.location.protocol === 'file:' ? '/index.html' : '/')); }
})();
(function(){
  if(window.location.protocol !== 'file:') return;
  document.querySelectorAll('a[href]').forEach(function(a){
    var h = a.getAttribute('href');
    if(/^(https?:|mailto:|tel:|#)/.test(h)) return;
    var i = h.indexOf('#'), path = i < 0 ? h : h.slice(0, i), frag = i < 0 ? '' : h.slice(i);
    if(path.slice(-1) === '/'){ a.setAttribute('href', path + 'index.html' + frag); }
  });
})();
(function(){
  var nav = document.getElementById('siteNav');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ticking = false;
  function onScroll(){
    nav.classList.toggle('scrolled', window.scrollY > 12);
    ticking = false;
  }
  window.addEventListener('scroll', function(){ if(!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, {passive:true});
  onScroll();
  var hbtn = document.getElementById('hamburgerBtn');
  var menu = document.getElementById('mobileMenu');
  function setMenu(open, returnFocus){
    menu.classList.toggle('open', open);
    hbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    hbtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if(open){ var first = menu.querySelector('a'); if(first) first.focus(); }
    else if(returnFocus){ hbtn.focus(); }
  }
  hbtn.addEventListener('click', function(){ setMenu(!menu.classList.contains('open')); });
  menu.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ setMenu(false); }); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && menu.classList.contains('open')){ setMenu(false, true); }
  });
  document.querySelectorAll('.media img').forEach(function(img){
    function fail(){ var m = img.closest('.media'); if(m) m.classList.add('img-failed'); }
    if(img.complete && img.naturalWidth === 0 && img.getAttribute('src')){ fail(); }
    img.addEventListener('error', fail);
  });
  window.kvActivateReveals = function(scope){
    var reveals = scope.querySelectorAll('.reveal:not(.in)');
    if('IntersectionObserver' in window && !reduceMotion){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, {threshold:.12, rootMargin:'0px 0px -6% 0px'});
      reveals.forEach(function(el){
        var sibs = el.parentElement ? el.parentElement.querySelectorAll(':scope > .reveal') : [];
        var idx = Array.prototype.indexOf.call(sibs, el);
        if(idx > 0 && idx < 6){ el.style.transitionDelay = (idx * 80) + 'ms'; }
        io.observe(el);
      });
    } else {
      reveals.forEach(function(el){ el.classList.add('in'); });
    }
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  function drawConnectors(scope){
    (scope || document).querySelectorAll('.op-wrap').forEach(function(wrap){
      var svg = wrap.querySelector('.op-svg');
      var hub = wrap.querySelector('.op-hub');
      if(!svg || !hub || wrap.offsetParent === null) return;
      if(getComputedStyle(svg).display === 'none') return;
      var wr = wrap.getBoundingClientRect();
      svg.setAttribute('viewBox', '0 0 ' + wr.width + ' ' + wr.height);
      while(svg.firstChild) svg.removeChild(svg.firstChild);
      var hr = hub.getBoundingClientRect();
      var hx = hr.left - wr.left + hr.width/2, hy = hr.top - wr.top + hr.height/2, rad = hr.width/2;
      wrap.querySelectorAll('[data-op-node]').forEach(function(node){
        var nr = node.getBoundingClientRect();
        var nx = nr.left - wr.left + nr.width/2, ny = nr.top - wr.top + nr.height/2;
        var ax = nx, ay = ny;
        if(Math.abs(nx - hx) > nr.width/2){ ax = nx < hx ? nr.right - wr.left : nr.left - wr.left; }
        else { ay = ny < hy ? nr.bottom - wr.top : nr.top - wr.top; }
        var ang = Math.atan2(ay - hy, ax - hx);
        var sx = hx + Math.cos(ang) * rad, sy = hy + Math.sin(ang) * rad;
        var mx = (sx + ax)/2;
        var d = 'M' + sx.toFixed(1) + ',' + sy.toFixed(1) + ' C' + mx.toFixed(1) + ',' + sy.toFixed(1) + ' ' + mx.toFixed(1) + ',' + ay.toFixed(1) + ' ' + ax.toFixed(1) + ',' + ay.toFixed(1);
        if(Math.abs(ax - hx) < 4){ d = 'M' + sx.toFixed(1) + ',' + sy.toFixed(1) + ' L' + ax.toFixed(1) + ',' + ay.toFixed(1); }
        var path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        var dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1)); dot.setAttribute('r', '3.5');
        dot.setAttribute('fill', '#6FA2FF');
        svg.appendChild(dot);
      });
    });
  }
  var rT;
  window.addEventListener('resize', function(){ clearTimeout(rT); rT = setTimeout(function(){ drawConnectors(); }, 120); });
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(function(){ drawConnectors(); }); }
  window.addEventListener('load', function(){ drawConnectors(); });
  function fillGrid(el, count, amberEvery){
    if(!el || el.childElementCount) return;
    for(var i=0;i<count;i++){
      var d = document.createElement('div');
      d.className = 'scale-dot' + (amberEvery && i % amberEvery === 0 ? ' amber' : '');
      el.appendChild(d);
    }
  }
  document.querySelectorAll('[data-fill-count]').forEach(function(el){
    fillGrid(el, parseInt(el.getAttribute('data-fill-count'),10), parseInt(el.getAttribute('data-fill-amber'),10));
  });
  window.kvActivateReveals(document);
  onScroll();
})();
