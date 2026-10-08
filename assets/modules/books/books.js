// 3D 書架:排法切換(書脊 / 封面,記在 localStorage)、依寬度把每層的書分到多個隔間、抽書與翻面。
// 書脊朝外:點一下抽出看封面 → 再點翻到封底 → 再點放回。封面朝外:點一下翻到封底,再點翻回。
// 一次只抽出一本;點別本或按 Esc 會先把正在看的放回去。
(function () {
  var root = document.getElementById('books');
  if (!root) return;
  var KEY = 'books-view';
  var GAP = 3;          // .row 的 gap(px)
  var PAD = 2 * 17.6;   // .row 左右 padding 1.1rem
  var current = null;

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

  // ── 抽書與翻面 ──
  function stateOf(el) { return el.classList.contains('front') ? 'front' : el.classList.contains('rear') ? 'rear' : 'shelf'; }
  function putAway(el) {
    if (view() === 'covers') { el.classList.remove('rear', 'out'); return; }
    var s = stateOf(el);
    el.classList.remove('front', 'rear');
    if (s === 'shelf') return;
    el.classList.add(s === 'front' ? 'away-front' : 'away-rear');
    var done = function () { el.classList.remove('away-front', 'away-rear', 'out'); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
  }
  function advance(el) {
    if (current && current !== el) { putAway(current); current = null; }
    if (view() === 'covers') {
      var on = !el.classList.contains('rear');
      el.classList.toggle('rear', on); el.classList.toggle('out', on);
      current = on ? el : null;
      return;
    }
    var s = stateOf(el);
    if (s === 'shelf') { el.classList.remove('away-front', 'away-rear'); el.classList.add('out', 'front'); current = el; }
    else if (s === 'front') { el.classList.remove('front'); el.classList.add('rear'); }
    else { putAway(el); current = null; }
  }
  root.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;                       // 封底的 Goodreads 連結照常開
    var el = e.target.closest('.b3');
    if (el) advance(el);
  });
  document.addEventListener('click', function (e) {
    if (current && !e.target.closest('.b3') && !e.target.closest('[data-view-switch]')) { putAway(current); current = null; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) { var el = current; putAway(el); current = null; el.focus(); return; }
    var el = e.target.closest && e.target.closest('.b3');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); advance(el); }
  });

  // ── 排法切換 ──
  var sw = root.querySelector('[data-view-switch]');
  var btns = sw.querySelectorAll('[data-view-set]');
  function setView(v, remember) {
    if (current) { putAway(current); current = null; }
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
