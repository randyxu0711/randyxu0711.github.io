// 書單:排法切換(記在 localStorage)、翻開的書(dialog,可滑、方向鍵、按鈕)。
(function () {
  var root = document.getElementById('books');
  if (!root) return;
  var data = JSON.parse(document.getElementById('books-data').textContent);
  var rows = {};
  data.forEach(function (b) { var k = String(b.rating); (rows[k] = rows[k] || []).push(b); });

  // 排法切換
  var KEY = 'books-view';
  var sw = root.querySelector('[data-view-switch]');
  var btns = sw.querySelectorAll('[data-view-set]');
  function setView(v, remember) {
    root.setAttribute('data-view', v);
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-set') === v)); });
    if (remember) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  setView(saved === 'spines' || saved === 'covers' ? saved : root.getAttribute('data-view'), false);
  btns.forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view-set'), true); }); });
  sw.hidden = false;

  // 翻開的書
  var dlg = document.getElementById('book'), stage = document.getElementById('book-stage');
  var $ = function (id) { return document.getElementById(id); };
  var cur = null, idx = 0, opener = null;
  function stars(n) { return n ? '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n) : '未評分'; }
  function fill(dir) {
    var b = cur[idx];
    var card = stage.querySelector('.book-card');
    card.style.setProperty('--img', b.cover ? "url('" + b.cover.replace(/'/g, '%27') + "')" : 'none');
    var cover = $('b-cover');
    if (b.color) { cover.style.setProperty('--col', b.color); cover.style.setProperty('--spine-ink', b.ink); }
    else { cover.style.removeProperty('--col'); cover.style.removeProperty('--spine-ink'); }
    var img = $('b-img');
    img.hidden = !b.cover;
    img.onerror = function () { img.hidden = true; };
    if (b.cover) img.src = b.cover; else img.removeAttribute('src');
    $('b-cti').textContent = b.title; $('b-cau').textContent = b.author;
    $('b-title').textContent = b.title; $('b-author').textContent = b.author;
    var s = $('b-stars'); s.textContent = stars(b.rating);
    s.setAttribute('aria-label', b.rating ? '5 顆星中的 ' + b.rating + ' 顆' : '未評分');
    $('b-pages').textContent = b.pages ? b.pages + ' 頁' : '';
    $('b-gr').href = b.url;
    $('b-pos').textContent = (idx + 1) + ' / ' + cur.length;
    $('b-prev').disabled = idx === 0;
    $('b-next').disabled = idx === cur.length - 1;
    stage.classList.remove('in-l', 'in-r', 'open'); void stage.offsetWidth; stage.classList.add(dir);
  }
  function go(d) { var n = idx + d; if (!cur || n < 0 || n >= cur.length) return; idx = n; fill(d > 0 ? 'in-r' : 'in-l'); }
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-row][data-index]');
    if (!t) return;
    opener = t; cur = rows[t.getAttribute('data-row')]; idx = +t.getAttribute('data-index');
    fill('open'); dlg.showModal();
  });
  $('b-prev').addEventListener('click', function () { go(-1); });
  $('b-next').addEventListener('click', function () { go(1); });
  $('b-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { if (opener) opener.focus(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
  });
  var sx = null;
  stage.addEventListener('pointerdown', function (e) { sx = e.clientX; });
  stage.addEventListener('pointerup', function (e) {
    if (sx === null) return; var dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });
})();
