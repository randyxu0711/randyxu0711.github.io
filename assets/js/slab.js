// 板材的互動:游標傾斜、導覽列捲動後變玻璃、主題鍵(跟系統 → 晝 → 夜)、語言鍵。
// 主題偏好存在 localStorage('theme'),head 的行內 script 負責繪製前套用;語言由 i18n.js 負責。
(function () {
  var root = document.documentElement;
  var t = function (key, n) { return window.siteI18n ? window.siteI18n.t(key, n) : key; };

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
    c.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
  document.addEventListener('pointerout', function (e) {
    var c = e.target.closest && e.target.closest('.slab[data-tilt]');
    if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
    c.classList.remove('tracking');
    ['--ry', '--rx', '--sx'].forEach(function (k) { c.style.removeProperty(k); });
  });

  // ── 兩面卡片:觸控裝置沒有 hover,點一下翻面;點背面的連結照常開啟 ──
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('[data-flip]');
    if (!card || e.target.closest('a')) return;
    if (window.matchMedia('(hover: hover)').matches) return;
    card.classList.toggle('flipped');
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

  // ── 導覽列:頁面在頂端時融入桌面,捲動後變成霧面玻璃 ──
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('glass', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── 主題鍵 ──
  var themeBtn = document.querySelector('[data-theme-cycle]');
  if (themeBtn) {
    var order = ['system', 'light', 'dark'];
    var current = function () { return root.getAttribute('data-theme') || 'system'; };
    var paint = function () {
      var c = current();
      // SVG 沒有 .hidden 屬性,要直接設 attribute
      themeBtn.querySelectorAll('[data-icon]').forEach(function (i) { i.toggleAttribute('hidden', i.getAttribute('data-icon') !== c); });
      var label = t('theme.cycle', t('theme.' + c));
      themeBtn.setAttribute('aria-label', label);
      themeBtn.title = label;
    };
    themeBtn.addEventListener('click', function () {
      var next = order[(order.indexOf(current()) + 1) % order.length];
      if (next === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      paint();
    });
    document.addEventListener('langchange', paint);
    themeBtn.hidden = false;
    paint();
  }
})();
