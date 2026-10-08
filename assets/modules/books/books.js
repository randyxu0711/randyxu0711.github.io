// 3D 書架:排法切換(書脊 / 封面,記在 localStorage)、依寬度把每層的書分到多個隔間、抽書與翻面。
// 點一本書:從書架飛到畫面中間放大(書脊朝外的書會轉成封面朝前);再點翻到封底;點背景、Esc 或焦點離開就飛回原位。
(function () {
  var root = document.getElementById('books');
  if (!root) return;
  var KEY = 'books-view';
  var GAP = 3;          // .row 的 gap(px)
  var PAD = 2 * 17.6;   // .row 左右 padding 1.1rem

  function view() { return root.getAttribute('data-view') === 'spines' ? 'spines' : 'covers'; }
  function remPx(v) { v = (v || '').trim(); return v.indexOf('rem') > -1 ? parseFloat(v) * parseFloat(getComputedStyle(document.documentElement).fontSize) : parseFloat(v); }
  function coverWidth() { return remPx(getComputedStyle(root).getPropertyValue('--w')); }

  // ── 依寬度分格:一行書一個隔間 ──
  var firstRow = root.querySelector('.row');
  var cabHTML = firstRow ? Array.prototype.map.call(firstRow.querySelectorAll('.cab'), function (c) { return c.outerHTML; }).join('') : '';
  function pack(forView) {
    var w = coverWidth();
    root.querySelectorAll('[data-bay]').forEach(function (bay) {
      var books = Array.prototype.slice.call(bay.querySelectorAll('.b3'));
      var avail = bay.clientWidth - PAD;
      var lines = [], line = [], used = 0;
      books.forEach(function (b) {
        var slot = forView === 'covers' ? w : parseFloat(b.style.getPropertyValue('--t'));
        if (line.length && used + slot > avail) { lines.push(line); line = []; used = 0; }
        line.push(b); used += slot + GAP;
      });
      if (line.length) lines.push(line);
      // 行數沒變就不動 DOM,避免打斷進行中的動畫
      var rows = bay.querySelectorAll('.row');
      var same = rows.length === lines.length && lines.every(function (l, i) { return rows[i].querySelectorAll('.b3').length === l.length && rows[i].contains(l[0]); });
      if (same) return;
      bay.textContent = '';
      lines.forEach(function (l) {
        var row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = cabHTML;
        l.forEach(function (b, i) { b.style.setProperty('--i', i); row.appendChild(b); });
        bay.appendChild(row);
      });
    });
  }

  // ── 拿起一本書:從書架飛到畫面中間放大;再點翻封底;點背景 / Esc / 焦點離開就飛回原位 ──
  // 原本那本留在架上但隱藏(位置空著),畫面上飛的是複製出來的那本,所以書架的排版完全不受影響。
  var stage = null;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function lift(el) {
    if (stage) return;
    var r = el.getBoundingClientRect();
    var w = coverWidth();
    var target = Math.min(18 * 16, window.innerWidth * 0.62);
    var overlay = document.createElement('div');
    overlay.className = 'book-stage';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', el.getAttribute('aria-label'));
    overlay.style.setProperty('--w', w + 'px');
    var clone = el.cloneNode(true);
    clone.classList.add('lifted', view() === 'covers' ? 'from-cover' : 'from-spine');
    clone.style.setProperty('--i', 0);
    clone.style.left = r.left + 'px'; clone.style.top = r.top + 'px';
    clone.style.width = r.width + 'px'; clone.style.height = r.height + 'px';
    clone.style.setProperty('--dx', (window.innerWidth / 2 - (r.left + r.width / 2)) + 'px');
    clone.style.setProperty('--dy', (window.innerHeight / 2 - (r.top + r.height / 2)) + 'px');
    clone.style.setProperty('--s', (target / w).toFixed(3));
    overlay.appendChild(clone);
    document.body.appendChild(overlay);
    el.classList.add('taken');
    stage = { el: el, clone: clone, overlay: overlay };
    void overlay.offsetWidth;                       // 先畫出起點,再開始飛
    overlay.classList.add('open');
    clone.focus({ preventScroll: true });
  }
  function drop() {
    if (!stage) return;
    var s = stage; stage = null;
    var r = s.el.getBoundingClientRect();           // 捲動過的話,飛回現在的位置
    s.clone.style.left = r.left + 'px'; s.clone.style.top = r.top + 'px';
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

  // ── 排法切換 ──
  var sw = root.querySelector('[data-view-switch]');
  var btns = sw.querySelectorAll('[data-view-set]');
  function setView(v, remember) {
    drop();
    pack(v);                                   // 先照新排法分好格,再轉身
    root.setAttribute('data-view', v);
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-set') === v)); });
    if (remember) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  root.classList.add('no-anim');               // 第一次載入不播放轉身
  setView(saved === 'spines' || saved === 'covers' ? saved : view(), false);
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('no-anim'); }); });
  btns.forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view-set'), true); }); });
  sw.hidden = false;

  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { pack(view()); }, 150); });

  // ── 換語言時,書的名稱(螢幕閱讀器讀的)跟著換 ──
  function labels() {
    var en = window.siteI18n && window.siteI18n.lang() === 'en';
    root.querySelectorAll('.b3').forEach(function (b) { b.setAttribute('aria-label', b.getAttribute(en ? 'data-label-en' : 'data-label-zh')); });
  }
  document.addEventListener('langchange', labels);
  labels();
})();
