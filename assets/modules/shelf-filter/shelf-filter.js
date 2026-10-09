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
    // 精選卡上的 tag 跟著標示是否選取
    document.querySelectorAll('#shelf .share-card .tag[data-tag]').forEach(function (t) {
      t.setAttribute('aria-pressed', String(tags.indexOf(t.getAttribute('data-tag')) !== -1));
    });
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
  // 精選卡上的 tag:點了等於按上面那個 tag 鍵(卡片本身是連結,攔下來不開原文)
  document.getElementById('shelf').addEventListener('click', function (e) {
    var t = e.target.closest('.share-card .tag[data-tag]');
    if (!t) return;
    e.preventDefault();
    var chip = chips.filter(function (c) { return c.getAttribute('data-tag') === t.getAttribute('data-tag'); })[0];
    if (chip) chip.click();
  });

  // tag 列左右還有東西的那一邊淡出
  var row = box.querySelector('.chips');
  function fades() {
    row.classList.toggle('fade-l', row.scrollLeft > 4);
    row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  }
  row.addEventListener('scroll', fades, { passive: true });
  window.addEventListener('resize', fades);
  document.addEventListener('langchange', fades);

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
  fades();
})();
