// 已開過:記住訪客點過哪些原文,只存在訪客自己的瀏覽器。
(function () {
  var KEY = 'seen-links';
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  var seen = load();
  var clear = document.getElementById('seen-clear');

  function paint() {
    document.querySelectorAll('article.share[data-link]').forEach(function (it) {
      it.classList.toggle('is-seen', seen.indexOf(it.getAttribute('data-link')) !== -1);
    });
    if (clear) clear.hidden = seen.length === 0;
  }
  function record(e) {
    var a = e.target.closest && e.target.closest('a.share-card');
    if (!a) return;
    var link = a.closest('article.share').getAttribute('data-link');
    if (link && seen.indexOf(link) === -1) { seen.push(link); save(seen); }
    setTimeout(paint, 300);   // 等新分頁開了再變色,避免點下去那一刻卡片閃一下
  }

  document.addEventListener('click', record);
  document.addEventListener('auxclick', function (e) { if (e.button === 1) record(e); });   // 中鍵開新分頁也算
  if (clear) clear.addEventListener('click', function () { seen = []; save(seen); paint(); });
  paint();
})();
