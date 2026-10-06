// 書架篩選:tag 複選(AND)、文字篩選、狀態寫進網址 hash、j/k/Enter// 鍵盤操作。
(function () {
  var box = document.getElementById('shelf-filters');
  if (!box) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('#shelf article.share'));
  var chips = Array.prototype.slice.call(box.querySelectorAll('.chipbtn'));
  var q = document.getElementById('shelf-q');
  var count = document.getElementById('shelf-count');
  var empty = document.getElementById('shelf-empty');

  function readHash() {
    var out = { tags: [], q: '' };
    location.hash.replace(/^#/, '').split('&').forEach(function (part) {
      var i = part.indexOf('=');
      if (i < 0) return;
      var k = part.slice(0, i), v = part.slice(i + 1);
      try {
        if (k === 'tags' && v) out.tags = v.split(',').map(decodeURIComponent);
        if (k === 'q') out.q = decodeURIComponent(v);
      } catch (e) { /* 壞掉的 hash 就忽略 */ }
    });
    return out;
  }
  function writeHash(tags, text) {
    var parts = [];
    if (tags.length) parts.push('tags=' + tags.map(encodeURIComponent).join(','));
    if (text) parts.push('q=' + encodeURIComponent(text));
    var h = parts.length ? '#' + parts.join('&') : location.pathname + location.search;
    history.replaceState(null, '', h);
  }
  function selected() {
    return chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })
      .map(function (c) { return c.getAttribute('data-tag'); });
  }
  function apply() {
    var tags = selected();
    var text = q.value.trim().toLowerCase();
    var n = 0;
    items.forEach(function (it) {
      var have = (it.getAttribute('data-tags') || '').split('|');
      var ok = tags.every(function (t) { return have.indexOf(t) !== -1; }) &&
               (!text || (it.getAttribute('data-text') || '').indexOf(text) !== -1);
      it.hidden = !ok;
      if (ok) n++;
    });
    shown = n;
    paintCount();
    empty.hidden = n !== 0;
    writeHash(tags, q.value.trim());
  }

  var shown = items.length;
  function paintCount() {
    var i18n = window.siteI18n;
    count.textContent = i18n ? i18n.t('filter.count', shown) : shown + ' 則';
  }
  document.addEventListener('langchange', paintCount);

  // 快捷鍵說明:收在篩選列最右邊的 ? 按鈕裡
  var keysBtn = document.getElementById('shelf-keys-btn');
  var keysPop = document.getElementById('shelf-keys');
  function toggleKeys(open) {
    var next = open === undefined ? keysPop.hidden : open;
    keysPop.hidden = !next;
    keysBtn.setAttribute('aria-expanded', String(next));
  }
  keysBtn.addEventListener('click', function () { toggleKeys(); });
  document.addEventListener('click', function (e) {
    if (!keysPop.hidden && !e.target.closest('.keys')) toggleKeys(false);
  });

  var init = readHash();
  chips.forEach(function (c) {
    if (init.tags.indexOf(c.getAttribute('data-tag')) !== -1) c.setAttribute('aria-pressed', 'true');
    c.addEventListener('click', function () {
      c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
      apply();
    });
  });
  q.value = init.q;
  q.addEventListener('input', apply);

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.key === 'Escape' && !keysPop.hidden) { toggleKeys(false); keysBtn.focus(); return; }
    if (e.key === '?' && !typing) { toggleKeys(); e.preventDefault(); return; }
    if (e.key === '/' && !typing) { q.focus(); e.preventDefault(); return; }
    if (typing || (e.key !== 'j' && e.key !== 'k')) return;
    var cards = items.filter(function (it) { return !it.hidden; })
      .map(function (it) { return it.querySelector('a.share-card'); });
    if (!cards.length) return;
    var i = cards.indexOf(document.activeElement);
    i = e.key === 'j' ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0);
    cards[i].focus();
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cards[i].scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    e.preventDefault();
  });

  box.hidden = false;
  apply();
})();
