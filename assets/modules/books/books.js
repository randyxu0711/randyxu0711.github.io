// 書單:排法切換(記在 localStorage)、翻開的書(dialog,可滑、方向鍵、按鈕)。
(function () {
  var root = document.getElementById('books');
  if (!root) return;
  var data = JSON.parse(document.getElementById('books-data').textContent);
  var zhEl = document.getElementById('books-zh');
  var zh = (zhEl && JSON.parse(zhEl.textContent)) || {};
  // 中文時用台灣譯名(沒有就用原文)
  function name(b, field) {
    var z = zh[b.id];
    var isZh = !window.siteI18n || window.siteI18n.lang() === 'zh';
    return isZh && z && z[field] ? z[field] : b[field];
  }
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
  function t(key, n) { return window.siteI18n ? window.siteI18n.t(key, n) : key; }
  // 跟 _includes/stars.html 同樣的標記(5 顆 SVG,前 n 顆實心)
  var STAR = '<path d="M10 1.6l2.55 5.4 5.9.72-4.35 4.06 1.12 5.86L10 14.76l-5.22 2.88 1.12-5.86L1.55 7.72l5.9-.72z"/>';
  function starsHTML(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<svg class="' + (i <= n ? 'on' : 'off') + '" viewBox="0 0 20 20" aria-hidden="true">' + STAR + '</svg>';
    return out;
  }
  function fill(dir) {
    var b = cur[idx];
    var cover = $('b-cover');
    if (b.color) { cover.style.setProperty('--col', b.color); cover.style.setProperty('--bink', b.ink); }
    else { cover.style.removeProperty('--col'); cover.style.removeProperty('--bink'); }
    var img = $('b-img');
    img.hidden = !b.cover;
    img.onerror = function () { img.hidden = true; };
    if (b.cover) img.src = b.cover; else img.removeAttribute('src');
    $('b-cti').textContent = name(b, 'title'); $('b-cau').textContent = name(b, 'author');
    $('b-title').textContent = name(b, 'title'); $('b-author').textContent = name(b, 'author');
    var s = $('b-stars');
    if (b.rating) s.innerHTML = starsHTML(b.rating); else s.textContent = t('books.unrated');
    s.setAttribute('aria-label', b.rating ? t('books.stars_of', b.rating) : t('books.unrated'));
    $('b-pages').textContent = b.pages ? t('books.pages', b.pages) : '';
    $('b-gr').href = b.url;
    $('b-pos').textContent = (idx + 1) + ' / ' + cur.length;
    $('b-prev').disabled = idx === 0;
    $('b-next').disabled = idx === cur.length - 1;
    stage.classList.remove('in-l', 'in-r', 'open'); void stage.offsetWidth; if (dir) stage.classList.add(dir);
  }
  document.addEventListener('langchange', function () { if (cur && dlg.open) fill(''); });
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
