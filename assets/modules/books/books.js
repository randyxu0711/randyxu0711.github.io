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

  // ── 封底:架上只是一片書的顏色,拿起來時才依 data-* 填文字(book-3d.html)──
  // 現在語言的書名在上、另一種語言的書名在下;結構與 books.css 的 .bk-* 對應
  function span(cls, text) { var e = document.createElement('span'); e.className = cls; if (text != null) e.textContent = text; return e; }
  function fillBack(back) {
    if (!back) return;
    var d = back.dataset, i18n = window.siteI18n;
    var t = function (k, n) { return i18n ? i18n.t(k, n) : String(n); };
    var en = i18n && i18n.lang() === 'en';
    back.textContent = '';
    var head = span('bk-head');
    head.append(span('bk-title', en ? d.te : (d.tz || d.te)));
    if (d.tz) { var alt = span('bk-alt', en ? d.tz : d.te); alt.lang = en ? 'zh-Hant' : 'en'; head.append(alt); }
    head.append(span('bk-au', en ? d.ae : (d.az || d.ae)));
    back.append(head, span('bk-rule'));
    if (d.read) {
      var log = span('bk-log');
      log.append(span('bk-log-head', t('books.log')), span('bk-log-row', t('books.read_in', d.read)));
      if (d.times) log.append(span('bk-log-row bk-times', t('books.read_times', d.times)));
      back.append(log);
    }
    var foot = span('bk-foot');
    foot.append(span('', d.pages ? t('books.pages', d.pages) : ''));
    var a = document.createElement('a');
    a.href = d.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Goodreads';
    foot.append(a);
    back.append(foot);
  }

  // ── 拿起一本書:從書架飛到畫面中間放大;再點翻封底;點背景 / Esc / 焦點離開就飛回原位 ──
  // 原本那本留在架上但隱藏(位置空著),畫面上飛的是複製出來的那本,所以書架的排版完全不受影響。
  // 飛行用 Web Animations API,只動 transform 與 opacity,整段在合成層跑,不用每一格叫主執行緒重算。
  var stage = null;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var EASE = 'cubic-bezier(.3,.7,.2,1)';
  var FLY = 620, TURN = 520, VEIL = 400;
  var FADE = 100;   // 落地前最後這段:架上那本先出現(被隔壁的書正確遮住),上層的複製品再淡出
  function ms(n) { return reduce.matches ? 0 : n; }
  function noop() {}
  // 架上那一排的 3D 視角:透視距離與視點(畫面座標)
  function shelfView(el) {
    var row = el.closest('.row');
    if (!row) return { d: 1400, ox: window.innerWidth / 2, oy: window.innerHeight / 2 };
    var rr = row.getBoundingClientRect(), cs = getComputedStyle(row), o = cs.perspectiveOrigin.split(' ');
    return { d: parseFloat(cs.perspective) || 1400, ox: rr.left + parseFloat(o[0]), oy: rr.top + parseFloat(o[1]) };
  }
  // 書的 transform。透視不放在外層的 perspective 屬性(那個不能在合成層過渡),而是寫進書本身的 transform:
  // 先移到視點、套透視、再移回來,數學上等於「放在視點為 (ox, oy) 的 perspective 底下」,
  // 所以起飛與落地那一刻跟架上的書一模一樣(換一套視角的話,書的角度、書頂露出多少會跳一下)。
  // r:書在架上的位置(省略 = 畫面中間、原尺寸)
  function pose(st, v, r) {
    var dx = 0, dy = 0, k = 1;
    if (r) { dx = r.left + r.width / 2 - st.cx; dy = r.top + r.height / 2 - st.cy; k = 1 / st.s; }
    return 'translate(' + (v.ox - st.cx) + 'px, ' + (v.oy - st.cy) + 'px) perspective(' + v.d + 'px) ' +
      'translate(' + (st.cx - v.ox) + 'px, ' + (st.cy - v.oy) + 'px) translate3d(' + dx + 'px, ' + dy + 'px, 0) scale3d(' + k + ', ' + k + ', ' + k + ')';
  }
  function stageView(st) { return { d: 1400, ox: st.cx, oy: st.cy }; }
  function lift(el) {
    if (stage) return;
    // 先讀、再改:位置、封面寬、架上的視角都在建立複製品之前讀好
    var r = el.getBoundingClientRect();
    var w = coverWidth();
    var from3d = shelfView(el);
    var ratio = parseFloat(el.style.getPropertyValue('--ratio')) || 0.66;
    // 中間那本的封面寬:手機上幾乎滿版,也不能高過畫面
    var target = Math.min(18 * 16, window.innerWidth * 0.72, window.innerHeight * 0.8 * ratio);
    var s = target / w, h = r.height * s;
    var overlay = document.createElement('div');
    overlay.className = 'book-stage';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', el.getAttribute('aria-label'));
    overlay.style.setProperty('--w', target + 'px');
    overlay.style.setProperty('--k', s.toFixed(3));
    var veil = document.createElement('div');       // 背景:模糊固定,淡入淡出只動這一層的 opacity
    veil.className = 'veil';
    var hold = document.createElement('div');       // 書的外層,落地前淡出用(.b3 是 3D 空間,本身不能加 opacity)
    hold.className = 'hold';
    // FLIP:複製的書直接用中間的大小排版(封底才有足夠的空間、字也清楚),
    // 起點用 transform 縮回架上的位置與大小,再飛到中間、變回原尺寸
    var clone = el.cloneNode(true);
    fillBack(clone.querySelector('.back'));
    clone.classList.add('lifted');
    clone.style.setProperty('--i', 0);
    clone.style.setProperty('--t', (parseFloat(el.style.getPropertyValue('--t')) * s) + 'px');
    // 外框寬 = 放大後的封面寬(書脊朝外的書在架上很窄,外框沿用的話只有中間一條點得到);書盒在外框裡置中,動畫不受影響
    var left = (window.innerWidth - target) / 2, top = (window.innerHeight - h) / 2;
    clone.style.width = target + 'px'; clone.style.height = h + 'px';
    clone.style.left = left + 'px'; clone.style.top = top + 'px';
    hold.appendChild(clone);
    overlay.append(veil, hold);
    document.body.appendChild(overlay);
    // 放大到中間要用大圖。複製出來的圖等小圖顯示了才換,不然大圖載好前會是空白
    upgrade(el.querySelector('.cover img'));
    var cimg = clone.querySelector('.cover img');
    if (cimg) { if (cimg.complete) upgrade(cimg); else cimg.addEventListener('load', function () { upgrade(cimg); }, { once: true }); }
    el.classList.add('taken');
    var st = { el: el, clone: clone, box: clone.querySelector('.box'), overlay: overlay, veil: veil, hold: hold,
      s: s, cx: left + target / 2, cy: top + h / 2, spine: view() !== 'covers' };
    stage = st;
    st.flight = clone.animate([{ transform: pose(st, from3d, r) }, { transform: pose(st, stageView(st)) }],
      { duration: ms(FLY), easing: EASE, fill: 'both' });
    st.fade = veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(VEIL), fill: 'both' });
    // 書脊朝外的書晚一點才轉成封面朝前:先離開書架再轉身。轉完就交回 CSS(封面朝前 / .rear 翻封底)
    if (st.spine) {
      var t = st.turn = st.box.animate([{ transform: 'none' }, { transform: 'rotateY(-90deg)' }],
        { duration: ms(TURN), delay: ms(180), easing: EASE, fill: 'both' });
      t.finished.then(function () { if (stage === st && st.turn === t) { t.cancel(); st.turn = null; } }, noop);
    }
    clone.focus({ preventScroll: true });
  }
  function drop() {
    if (!stage) return;
    var st = stage; stage = null;
    // 先讀、再改:背景現在的濃淡、捲動過的話書在架上現在的位置
    var veilNow = parseFloat(getComputedStyle(st.veil).opacity);
    var turnNow = st.turn ? -90 * (st.turn.effect.getComputedTiming().progress || 0) : null;   // 書脊朝外的書轉到幾度了
    var flying = st.flight.playState === 'running';
    var r = flying ? null : st.el.getBoundingClientRect(), to3d = flying ? null : shelfView(st.el);
    st.overlay.classList.add('closing');            // 飛回去的途中就能點下一本;書盒的 CSS 過場關掉,交給下面的動畫
    var rear = st.clone.classList.contains('rear');
    var left, turnFrom = rear ? -270 : -90, turnTo;
    if (flying) {
      // 還在飛:從現在的位置原路倒回去(飛行本身倒著播可以交給合成層)
      st.flight.reverse();
      left = st.flight.currentTime;
      turnTo = -90;
      // 轉身中的書脊朝外的書:從現在的角度轉回去。不用 reverse():還在跑的轉身倒著播,Chrome 不交給合成層
      if (st.turn) { st.turn.cancel(); st.turn = null; turnFrom = turnNow; turnTo = 0; }
    } else {
      var old = st.flight;
      st.flight = st.clone.animate([{ transform: pose(st, stageView(st)) }, { transform: pose(st, to3d, r) }],
        { duration: ms(FLY), easing: EASE, fill: 'both' });
      old.cancel();
      left = ms(FLY);
      // 轉回架上的方向;在封底的書脊朝外的書轉到 -360 度(= 0 度),少轉半圈
      turnTo = st.spine ? (rear ? -360 : 0) : -90;
    }
    // 方向沒變就不播:看不出變化的動畫不會交給合成層,主執行緒反而得每一格陪著跑
    if (Math.abs(turnTo - turnFrom) > 0.5) st.box.animate([{ transform: 'rotateY(' + turnFrom + 'deg)' }, { transform: 'rotateY(' + turnTo + 'deg)' }],
      { duration: Math.min(left, ms(TURN)), easing: EASE, fill: 'both' });
    // 背景從現在的濃淡淡出。用新的動畫,不用 reverse():播完的動畫倒著播,Chrome 不交給合成層
    var oldFade = st.fade;
    st.fade = st.veil.animate([{ opacity: veilNow }, { opacity: 0 }], { duration: ms(VEIL) * veilNow, fill: 'both' });
    oldFade.cancel();
    // 快落地時:架上那本先出現,上層的複製品再淡出。淡出從這裡才開始(不是事先排好時間):
    // 主執行緒忙、計時器晚到的話,複製品就停在落地的位置等,不會先淡掉、讓書消失一下
    setTimeout(function () {
      st.el.classList.remove('taken');
      st.hold.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(left, ms(FADE)), fill: 'both' }).finished.then(function () {
        st.overlay.remove();
        if (!stage) st.el.focus({ preventScroll: true });   // 飛回去的途中已經拿起別本的話,焦點留在那本
      }, noop);
    }, Math.max(0, left - ms(FADE)));
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
    // 只認書架上的書:按 Esc 後焦點還在飛回去的複製品上,這時按 Enter 不能把複製品再拿起來
    var el = e.target.closest && e.target.closest('.b3');
    if (el && root.contains(el) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); lift(el); }
  });
  document.addEventListener('focusin', function (e) {
    if (stage && !stage.overlay.contains(e.target)) drop();
  });

  // ── 排法切換 ──
  var sw = root.querySelector('[data-view-switch]');
  var btns = sw.querySelectorAll('[data-view-set]');
  // 書往旁邊移的時間曲線,與 books.css 的 .box 轉身相同(0.6s、cubic-bezier(.3,.7,.2,1)、每本晚 40ms)
  var DUR = 600, STAGGER = 40;
  function ease(x) {
    var lo = 0, hi = 1, t = x;
    for (var k = 0; k < 20; k++) {
      var cx = 0.9 * t * (1 - t) * (1 - t) + 0.6 * t * t * (1 - t) + t * t * t;
      if (cx < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return 2.1 * t * (1 - t) * (1 - t) + 3 * t * t * (1 - t) + t * t * t;
  }
  // 換排法的過場全部用 Web Animations 跑在合成層:
  // - 寬度不做過場(寬度每一格都要重新排版):書直接排成新寬度,再用 transform 從舊位置滑過去。看起來要跟
  //   「左邊的書一本本變寬、把右邊推開」一樣:第 j 本的位移 = 前面每本還沒變完的寬度差加總 + 自己寬度差的一半
  //   (書盒在外框裡置中)。這條曲線是好幾本緩動的加總,CSS 寫不出來,先算成關鍵格(每 48ms 一格,線性內插看不出來;
  //   格數越多,建立動畫越慢)。
  // - 一本接一本不用 delay:有 delay 的動畫,每一本開始時都會逼主執行緒算一格(書架有上千個面,一格就很貴)。
  //   改成所有動畫同一格開始、同一格結束,輪到之前停在起點、轉完之後停在終點,都寫在關鍵格裡
  var moving = [], movingRows = [];
  function slide(row, oldW, newW, from, to, T, D, d) {
    var books = Array.prototype.filter.call(row.children, function (b) { return b.classList.contains('b3'); });
    var diff = books.map(function (b) { return oldW(b) - newW(b); });
    var turn = function (v) { return v === 'covers' ? 'rotateY(-90deg)' : 'rotateY(0deg)'; };
    var EASE = 'cubic-bezier(.3,.7,.2,1)';
    books.forEach(function (b, j) {
      var s0 = j * d, s1 = s0 + D, m = Math.max(4, Math.ceil(s1 / 48)), frames = [];
      for (var s = 0; s <= m; s++) {
        var t = s1 * s / m, x = 0;
        for (var i = 0; i <= j; i++) {
          var left = diff[i] * (1 - ease(Math.min(1, Math.max(0, (t - i * d) / D))));
          x += i < j ? left : left / 2;
        }
        frames.push({ offset: t / T, transform: 'translateX(' + x.toFixed(2) + 'px)' });
      }
      frames.push({ offset: 1, transform: 'translateX(0px)' });
      var hold = function (a, z) { return [{ offset: 0, transform: a }, { offset: s0 / T, transform: a, easing: EASE }, { offset: s1 / T, transform: z }, { offset: 1, transform: z }]; };
      var box = b.querySelector('.box');
      moving.push(b.animate(frames, T), box.animate(hold(turn(from), turn(to)), T));
      // 接觸陰影(.b3::after,左右各多 3px)的寬度只跟這本自己的緩動有關
      if (diff[j]) moving.push(b.animate(hold('scaleX(' + ((newW(b) + diff[j] + 6) / (newW(b) + 6)).toFixed(3) + ')', 'scaleX(1)'), { duration: T, pseudoElement: '::after' }));
    });
  }

  // 換排法時只處理畫面裡的排:畫面外、但瀏覽器會預先畫好的那幾排(content-visibility: auto 的預留範圍)
  // 先暫時跳過(hidden),動畫結束後一格放回一排;捲到它們時立刻放回。不然切到書脊時一次要畫上百本書(卡 0.4 秒)
  var held = [], holdIO = null, holdToken = 0;
  function release(wrap) {
    var i = held.indexOf(wrap);
    if (i < 0) return;
    held.splice(i, 1);
    if (holdIO) holdIO.unobserve(wrap);
    // 放回時直接是新樣子,不跑過場(沒有搬動過的書還留著舊樣式,放回會轉身)
    var row = wrap.querySelector('.row');
    if (row) row.classList.add('snap');
    wrap.style.contentVisibility = '';
    if (row) requestAnimationFrame(function () { row.classList.remove('snap'); });
  }
  function releaseAll() { held.slice().forEach(release); }
  function settle(cancel) {
    if (cancel) moving.forEach(function (a) { a.cancel(); });
    movingRows.forEach(function (row) { row.classList.remove('snap'); });
    moving = []; movingRows = [];
  }

  function setView(v, remember) {
    drop();
    var from = view();
    settle(true); releaseAll(); holdToken++;   // 上一次的過場還沒跑完:停掉,放回暫時跳過的排
    if (from === v || reduce.matches) {
      pack(v);
      root.setAttribute('data-view', v);
    } else {
      // 先讀:封面寬、速度
      var w = coverWidth(), speed = parseFloat(getComputedStyle(root).getPropertyValue('--speed')) || 1;
      pack(v);                                   // 先照新排法分好格,再轉身
      var wraps = Array.prototype.slice.call(root.querySelectorAll('.row-wrap'));
      wraps.forEach(function (wr) { wr.style.contentVisibility = 'hidden'; });
      // 全部的排都跳過時排版很便宜,這時讀位置
      var vh = window.innerHeight, shown = [], dist = new Map();
      wraps.forEach(function (wr) {
        var r = wr.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh) shown.push(wr);
        else { held.push(wr); dist.set(wr, r.top > 0 ? r.top - vh : -r.bottom); }
      });
      held.sort(function (a, b) { return dist.get(a) - dist.get(b); });
      // 再改:畫面裡的排放回來並跑過場;跑的期間關掉 CSS 的轉身過場(.snap),不然 CSS 過場會蓋過動畫
      shown.forEach(function (wr) { wr.style.contentVisibility = ''; var row = wr.querySelector('.row'); if (row) movingRows.push(row); });
      root.querySelectorAll('.bay > .row').forEach(function (row) { movingRows.push(row); });   // 沒分格的排(分格的 script 沒跑)
      var tBook = function (b) { return parseFloat(b.style.getPropertyValue('--t')); };
      var wOf = function (view) { return view === 'covers' ? function () { return w; } : tBook; };
      var D = DUR * speed, d = STAGGER * speed, most = 0;
      movingRows.forEach(function (row) { most = Math.max(most, row.querySelectorAll('.b3').length); });
      var T = D + Math.max(0, most - 1) * d;
      movingRows.forEach(function (row) { row.classList.add('snap'); slide(row, wOf(from), wOf(v), from, v, T, D, d); });
      root.setAttribute('data-view', v);
      if ('IntersectionObserver' in window) {
        if (!holdIO) holdIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) release(e.target); }); });
        held.forEach(function (wr) { holdIO.observe(wr); });
      }
      // 動畫都跑完,再一格放回一排(離畫面近的先)
      var token = holdToken;
      Promise.all(moving.map(function (a) { return a.finished; })).then(function () {
        if (token !== holdToken) return;
        settle();
        (function next() {
          if (token !== holdToken || !held.length) return;
          release(held[0]);
          requestAnimationFrame(next);
        })();
      }, function () {});
    }
    watchRows();
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-set') === v)); });
    if (remember) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  }
  root.classList.add('no-anim');               // 第一次載入不播放轉身
  // 初始排法由 _layouts/books.html 的行內 script 在繪製前決定(選過的 > 手機用書脊 > 設定)
  setView(view(), false);
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
      pack(view()); watchRows();
    }, 150);
  });

  // ── 換語言時,書的名稱(螢幕閱讀器讀的)跟著換 ──
  function labels() {
    var en = window.siteI18n && window.siteI18n.lang() === 'en';
    root.querySelectorAll('.b3').forEach(function (b) { b.setAttribute('aria-label', b.getAttribute(en ? 'data-label-en' : 'data-label-zh')); });
  }
  document.addEventListener('langchange', function () { labels(); if (stage) fillBack(stage.clone.querySelector('.back')); });
  labels();
})();
