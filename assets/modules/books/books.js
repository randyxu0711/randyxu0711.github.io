// 3D 書架:排法切換(書脊 / 封面,記在 localStorage)、依寬度把每層的書分到多個隔間、抽書與翻面。
// 點一本書:從書架飛到畫面中間放大(書脊朝外的書會轉成封面朝前);再點翻到封底;點背景、Esc 或焦點離開就飛回原位。
(function () {
  var root = document.getElementById('books');
  if (!root) return;
  var KEY = 'books-view';  // _layouts/books.html 的行內 script 也讀這個 key

  function view() { return root.getAttribute('data-view') === 'spines' ? 'spines' : 'covers'; }
  function remPx(v) { v = (v || '').trim(); return v.indexOf('rem') > -1 ? parseFloat(v) * parseFloat(getComputedStyle(document.documentElement).fontSize) : parseFloat(v); }
  function coverWidth() { return remPx(getComputedStyle(root).getPropertyValue('--w')); }

  // ── 依寬度分格:由 _includes/books-pack.html(書架後面的行內 script)提供,首次繪製前就分好 ──
  function pack(forView) { if (window.booksPack) window.booksPack(forView); }

  // ── 封面畫質:先載 150px(src),封面排法捲到附近、或拿起來放大時換成 400px(data-big)──
  // 換 src 時瀏覽器會先留著舊圖,等新圖載好才換上,所以只會變清楚、不會閃白。書脊排法只露出側面,維持 150px
  function upgrade(img) {
    if (img && img.dataset.big && img.src !== img.dataset.big && img.src !== img.dataset.orig) img.src = img.dataset.big;
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    if (view() !== 'covers') return;
    entries.forEach(function (e) { if (e.isIntersecting) e.target.querySelectorAll('.cover img').forEach(upgrade); });
  }, { rootMargin: '300px 0px' }) : null;
  // 分格會換掉每一排,每次分完重新觀察。觀察外層 .row-wrap(content-visibility 在它身上),
  // 裡面的 .row 在畫面外時沒有排版,讀它的位置會逼瀏覽器把那一排排出來
  function rowBoxes() { return root.querySelectorAll('.row-wrap, .bay > .row'); }
  function watchRows() {
    if (!io) return;
    io.disconnect();
    rowBoxes().forEach(function (r) { io.observe(r); });
  }

  // ── 拿起一本書:從書架飛到畫面中間放大;再點翻封底;點背景 / Esc / 焦點離開就飛回原位 ──
  // 原本那本留在架上但隱藏(位置空著),畫面上飛的是複製出來的那本,所以書架的排版完全不受影響。
  var stage = null;
  // 書在架上的位置(r)相對畫面中間的位移:起點與飛回去的終點
  function home(clone, r) {
    clone.style.setProperty('--dx', (r.left + r.width / 2 - window.innerWidth / 2) + 'px');
    clone.style.setProperty('--dy', (r.top + r.height / 2 - window.innerHeight / 2) + 'px');
  }
  // 架上那一排的 3D 視角(透視距離、視點),換成畫面座標。拿起時從這個視角過渡到畫面中央,放回時再過渡回來,
  // 落地那一刻跟架上的書一模一樣(不然會換成另一套視角,書的角度、書頂露出多少會跳一下)
  function shelfView(el) {
    var row = el.closest('.row');
    if (!row) return { persp: '1400px', origin: '50% 50%' };
    var rr = row.getBoundingClientRect(), cs = getComputedStyle(row), o = cs.perspectiveOrigin.split(' ');
    return { persp: cs.perspective, origin: (rr.left + parseFloat(o[0])) + 'px ' + (rr.top + parseFloat(o[1])) + 'px' };
  }
  function setView3d(overlay, v) { overlay.style.perspective = v.persp; overlay.style.perspectiveOrigin = v.origin; }
  var STAGE_VIEW = { persp: '1400px', origin: '50% 50%' };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function lift(el) {
    if (stage) return;
    var r = el.getBoundingClientRect();
    var w = coverWidth();
    var ratio = parseFloat(el.style.getPropertyValue('--ratio')) || 0.66;
    // 中間那本的封面寬:手機上幾乎滿版,也不能高過畫面
    var target = Math.min(18 * 16, window.innerWidth * 0.72, window.innerHeight * 0.8 * ratio);
    var s = target / w;
    var overlay = document.createElement('div');
    overlay.className = 'book-stage';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', el.getAttribute('aria-label'));
    // FLIP:複製的書直接用中間的大小排版(封底才有足夠的空間、字也清楚),
    // 起點用 transform 縮回架上的位置與大小,再飛到中間、變回原尺寸
    overlay.style.setProperty('--w', target + 'px');
    overlay.style.setProperty('--k', s.toFixed(3));
    var clone = el.cloneNode(true);
    clone.classList.add('lifted', view() === 'covers' ? 'from-cover' : 'from-spine');
    clone.style.setProperty('--i', 0);
    clone.style.setProperty('--t', (parseFloat(el.style.getPropertyValue('--t')) * s) + 'px');
    // 外框寬 = 放大後的封面寬(書脊朝外的書在架上很窄,外框沿用的話只有中間一條點得到);書盒在外框裡置中,動畫不受影響
    clone.style.width = target + 'px'; clone.style.height = (r.height * s) + 'px';
    clone.style.left = (window.innerWidth - target) / 2 + 'px';
    clone.style.top = (window.innerHeight - r.height * s) / 2 + 'px';
    home(clone, r);
    clone.style.setProperty('--s', (1 / s).toFixed(4));
    overlay.appendChild(clone);
    document.body.appendChild(overlay);
    // 放大到中間要用大圖。複製出來的圖等小圖顯示了才換,不然大圖載好前會是空白
    upgrade(el.querySelector('.cover img'));
    var cimg = clone.querySelector('.cover img');
    if (cimg) { if (cimg.complete) upgrade(cimg); else cimg.addEventListener('load', function () { upgrade(cimg); }, { once: true }); }
    el.classList.add('taken');
    stage = { el: el, clone: clone, overlay: overlay };
    setView3d(overlay, shelfView(el));
    void overlay.offsetWidth;                       // 先畫出起點,再開始飛
    overlay.classList.add('open');
    setView3d(overlay, STAGE_VIEW);
    clone.focus({ preventScroll: true });
  }
  function drop() {
    if (!stage) return;
    var s = stage; stage = null;
    var r = s.el.getBoundingClientRect();           // 捲動過的話,飛回現在的位置
    home(s.clone, r);
    setView3d(s.overlay, shelfView(s.el));
    s.clone.classList.remove('rear');
    s.overlay.classList.remove('open');
    var done = function () {
      if (!s.overlay.parentNode) return;
      s.overlay.remove(); s.el.classList.remove('taken'); s.el.focus({ preventScroll: true });
    };
    s.clone.addEventListener('transitionend', function (e) { if (e.target === s.clone) done(); });
    setTimeout(done, reduce.matches ? 0 : 900);     // 保險:沒有 transitionend 時也會收尾
  }
  function flip() { if (stage) stage.clone.classList.toggle('rear'); }

  root.addEventListener('click', function (e) {
    var el = e.target.closest('.b3');
    if (el && !e.target.closest('a')) lift(el);
  });
  document.addEventListener('click', function (e) {
    if (!stage || !e.target.closest('.book-stage')) return;
    if (e.target.closest('a')) return;              // 封底的 Goodreads 連結照常開
    if (e.target.closest('.lifted')) flip(); else drop();
  });
  document.addEventListener('keydown', function (e) {
    if (stage) {
      if (e.key === 'Escape') { e.preventDefault(); drop(); }
      else if ((e.key === 'Enter' || e.key === ' ') && e.target === stage.clone) { e.preventDefault(); flip(); }
      return;
    }
    var el = e.target.closest && e.target.closest('.b3');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); lift(el); }
  });
  document.addEventListener('focusin', function (e) {
    if (stage && !stage.overlay.contains(e.target)) drop();
  });

  // ── 書脊上的書名:放不下時先拿掉作者,再縮小字(最小 10px),還是放不下才用 … 截斷 ──
  // 先全部寫、再全部讀,整頁只重新排版兩次(邊寫邊讀的話,122 本會排版幾百次,手機上卡 0.3 秒)。
  // 字寬跟字級成正比,所以縮小的倍數一次算出來,不用一步一步試。
  var MIN_FONT = 10;
  function fitSpines() {
    var spines = Array.prototype.slice.call(root.querySelectorAll('.b3 > .box > .spine')).map(function (sp) {
      var ti = sp.querySelector('.ti');
      sp.classList.remove('no-au'); ti.style.removeProperty('font-size');
      return { sp: sp, ti: ti };
    });
    var over = spines.filter(function (o) { return o.ti.scrollHeight > o.ti.clientHeight; });
    over.forEach(function (o) { o.sp.classList.add('no-au'); });
    over.forEach(function (o) {
      o.k = o.ti.clientHeight / o.ti.scrollHeight;
      o.base = parseFloat(getComputedStyle(o.sp).fontSize);
    });
    over.forEach(function (o) {
      if (o.k >= 1) return;
      var k = Math.max(o.k, MIN_FONT / o.base);
      o.ti.style.fontSize = k.toFixed(3) + 'em';   // em:拿起來放大時跟著書脊的字一起放大
    });
  }

  // ── 排法切換 ──
  var sw = root.querySelector('[data-view-switch]');
  var btns = sw.querySelectorAll('[data-view-set]');
  function setView(v, remember) {
    drop();
    var from = view();
    pack(v);                                   // 先照新排法分好格,再轉身
    // 搬到新隔間的書會失去原本算好的樣式,過場需要一個「起點」:先套舊排法的樣子(books.css 的 .was-*)畫一格,
    // 下一格再拿掉。瀏覽器只會算畫面上那幾排,畫面外的書直接是新樣子(只動畫看得到的)
    var books = root.querySelectorAll('.b3');
    books.forEach(function (b) { b.classList.remove('was-covers', 'was-spines'); });
    if (from !== v) {
      var was = 'was-' + from;
      books.forEach(function (b) { b.classList.add(was); });
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        // 只有真的在畫面裡的排跑過場。瀏覽器會預先算好畫面上下各一段的排(content-visibility 的預留範圍),
        // 那些排不在畫面裡,直接跳到新樣子(books.css 的 .snap)。版面剛排好,這裡讀位置不花成本
        var vh = window.innerHeight, snapped = [];
        rowBoxes().forEach(function (box) {
          var r = box.getBoundingClientRect(), row = box.classList.contains('row') ? box : box.querySelector('.row');
          if (row && (r.bottom < 0 || r.top > vh)) { row.classList.add('snap'); snapped.push(row); }
        });
        books.forEach(function (b) { b.classList.remove(was); });
        requestAnimationFrame(function () { snapped.forEach(function (row) { row.classList.remove('snap'); }); });
      }); });
    }
    root.setAttribute('data-view', v);
    watchRows();
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-set') === v)); });
    if (remember) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  }
  root.classList.add('no-anim');               // 第一次載入不播放轉身
  // 初始排法由 _layouts/books.html 的行內 script 在繪製前決定(選過的 > 手機用書脊 > 設定)
  setView(view(), false);
  fitSpines();
  if (document.fonts) document.fonts.ready.then(fitSpines);   // 字型載入後寬度會變
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('no-anim'); }); });
  btns.forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view-set'), true); }); });
  sw.hidden = false;

  var resizeTimer = null;
  // 手機捲動時網址列收合也會觸發 resize(只有高度變),寬度沒變就不用重排
  var lastWidth = window.innerWidth;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      pack(view()); fitSpines(); watchRows();
    }, 150);
  });

  // ── 換語言時,書的名稱(螢幕閱讀器讀的)跟著換 ──
  function labels() {
    var en = window.siteI18n && window.siteI18n.lang() === 'en';
    root.querySelectorAll('.b3').forEach(function (b) { b.setAttribute('aria-label', b.getAttribute(en ? 'data-label-en' : 'data-label-zh')); });
  }
  document.addEventListener('langchange', function () { labels(); fitSpines(); });
  labels();
})();
