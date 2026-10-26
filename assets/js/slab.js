// 板材的互動:游標傾斜、導覽列(捲動收起、手機的偏好面板)、主題開關(沒選過就跟系統)。
// 主題偏好存在 localStorage('theme'),head 的行內 script 負責繪製前套用;語言由 i18n.js 負責。
(function () {
  var root = document.documentElement;

  // ── 游標傾斜:data-tilt 的值是最大角度 ──
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointermove', function (e) {
    if (reduce.matches || e.pointerType === 'touch') return;
    var c = e.target.closest && e.target.closest('.slab[data-tilt]');
    if (!c) return;
    var max = +c.getAttribute('data-tilt') || 4;
    var r = c.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    var ry = (x - 0.5) * 2 * max, rx = (0.5 - y) * 2 * max;
    c.classList.add('tracking');
    c.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    c.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    c.style.setProperty('--sx', (-ry * 0.6).toFixed(1) + 'px');   // 往右傾時,左側面露出來
    c.style.setProperty('--px', (-(x - 0.5) * 10).toFixed(1) + 'px');   // 裡面的縮圖往反方向移(share 卡的 .thumb)
    c.style.setProperty('--py', (-(y - 0.5) * 6).toFixed(1) + 'px');
    c.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
  document.addEventListener('pointerout', function (e) {
    var c = e.target.closest && e.target.closest('.slab[data-tilt]');
    if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
    c.classList.remove('tracking');
    ['--ry', '--rx', '--sx', '--px', '--py'].forEach(function (k) { c.style.removeProperty(k); });
  });

  // ── 舊版網站(Chirpy)留下的 service worker:它是 cache-first,會一直給舊頁面。 ──
  // 跑到這裡代表這一頁是新網站給的;如果瀏覽器裡還註冊著,直接註銷並清掉快取。
  // 被它攔住、拿到舊頁面的訪客,則靠根目錄的 /sw.min.js(自毀版)修好。
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
      if (regs.length && window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
    }).catch(function () {});
  }

  // ── 導覽列:往下捲就收起來,往上捲就出現(只動 transform;跟著它的 sticky 元素讀 --nav-vis) ──
  var nav = document.querySelector('.nav');
  var tools = nav && nav.querySelector('.nav-tools');
  var prefsKey = nav && nav.querySelector('.nav-prefs-key');
  var setPrefs = function (open) {
    if (!prefsKey) return;
    tools.classList.toggle('open', open);
    prefsKey.setAttribute('aria-expanded', String(open));
  };
  if (nav) {
    var lastY = scrollY, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = scrollY, dy = y - lastY;
        if (Math.abs(dy) < 6 && y > nav.offsetHeight) return;
        lastY = y;
        var up = y > nav.offsetHeight && dy > 0 && !nav.contains(document.activeElement);
        if (up) setPrefs(false);
        root.classList.toggle('nav-up', up);
      });
    }, { passive: true });
    nav.addEventListener('focusin', function () { root.classList.remove('nav-up'); });
  }

  // ── 手機:語言與主題收在一顆鍵裡,點開往下長出面板 ──
  if (prefsKey) {
    prefsKey.addEventListener('click', function () { setPrefs(prefsKey.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('click', function (e) { if (!tools.contains(e.target)) setPrefs(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tools.classList.contains('open')) { setPrefs(false); prefsKey.focus(); }
    });
    prefsKey.hidden = false;
  }

  // ── 主題開關:沒選過就跟系統,點了才存 ──
  var themeBtn = document.querySelector('[data-theme-toggle]');
  if (themeBtn) {
    var dark = window.matchMedia('(prefers-color-scheme: dark)');
    var current = function () { return root.getAttribute('data-theme') || (dark.matches ? 'dark' : 'light'); };
    var paint = function () { themeBtn.setAttribute('aria-checked', String(current() === 'dark')); };
    themeBtn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      paint();
    });
    dark.addEventListener('change', paint);
    themeBtn.hidden = false;
    paint();
  }
})();
