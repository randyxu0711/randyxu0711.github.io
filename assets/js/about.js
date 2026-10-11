(function () {
  var root = document.documentElement;
  var nav = document.querySelector('.nav');
  var setNav = function () { if (nav) root.style.setProperty('--nav-h', nav.offsetHeight + 'px'); };
  setNav();
  window.addEventListener('resize', setNav);

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-in]').forEach(function (el) { el.classList.add('in'); });
    return;
  }

  var narrow = window.matchMedia('(max-width: 860px)');
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var show = function (proj, n) {
    if (proj._n === n) return;
    proj._n = n;
    var step = proj.querySelector('.as-step[data-step="' + n + '"]');
    var k = +step.getAttribute('data-shot');
    var f = (step.getAttribute('data-focus') || '50 50 1').split(' ').map(Number);
    if (narrow.matches) f[2] *= 1.35;
    var room = 50 - 50 / f[2];
    var clamp = function (v) { return Math.max(-room, Math.min(room, 50 - v)); };
    proj.querySelectorAll('.as-shot').forEach(function (s) {
      var i = +s.getAttribute('data-i'), d = k - i;
      s.setAttribute('data-s', d < 0 ? 'next' : d === 0 ? 'cur' : 'past');
      s.toggleAttribute('data-far', d > 2);
      s.style.setProperty('--d', Math.max(d, 0));
      s.style.setProperty('--z', i);
      if (d !== 0) return;
      var img = s.querySelector('img, video');
      img.style.setProperty('--fz', f[2]);
      img.style.setProperty('--fx', clamp(f[0]) + '%');
      img.style.setProperty('--fy', clamp(f[1]) + '%');
    });
    proj.querySelectorAll('.as-step').forEach(function (s) { s.classList.toggle('on', s === step); });
    proj.querySelectorAll('video').forEach(syncVideo);
    var cur = proj.querySelector('[data-cur]');
    if (cur) cur.textContent = pad(n + 1);
  };
  var visible = new WeakSet();
  var syncVideo = function (v) {
    var on = visible.has(v) && v.closest('.as-shot').getAttribute('data-s') === 'cur' && !reduce.matches;
    if (on && v.paused) v.play().catch(function () {});
    if (!on && !v.paused) v.pause();
  };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var videoIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); syncVideo(e.target); });
  });
  document.querySelectorAll('.as-win video').forEach(function (v) { videoIO.observe(v); });
  var projs = document.querySelectorAll('[data-proj]');
  projs.forEach(function (p) { show(p, 0); });

  var stepIO;
  var watchSteps = function () {
    if (stepIO) stepIO.disconnect();
    var line = narrow.matches ? '-72% 0px -28% 0px' : '-50% 0px -50% 0px';
    stepIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) show(e.target.closest('[data-proj]'), +e.target.getAttribute('data-step'));
      });
    }, { rootMargin: line });
    projs.forEach(function (p) { p.querySelectorAll('.as-step').forEach(function (s) { stepIO.observe(s); }); });
  };
  watchSteps();
  narrow.addEventListener('change', watchSteps);

  var once = function (sel, margin) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: margin });
    document.querySelectorAll(sel).forEach(function (el) { io.observe(el); });
  };
  once('[data-in]:not(.as-item)', '0px 0px -12% 0px');
  once('.as-item', '0px 0px -45% 0px');
})();
