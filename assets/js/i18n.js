// 中英切換(導覽列的語言鍵)。<html data-lang> 由 head 的行內 script 在繪製前設定;這支換掉 data-i18n 標記的文字。
// 標記方式:
//   data-i18n="鍵"                 換掉元素的文字
//   data-i18n-attr="屬性:鍵;屬性:鍵"  換掉屬性(placeholder、aria-label…)
//   data-i18n-n="4"                文字裡的 {n}
// 整段內容(About、404)用 .lang-zh / .lang-en 兩份,由 CSS 依 data-lang 顯示其中一份。
// 模組用 window.siteI18n.t(鍵, n) 取字串,並監聽 document 的 langchange 事件重畫。
(function () {
  var el = document.getElementById('i18n-data');
  var dict = el ? JSON.parse(el.textContent) : {};
  var root = document.documentElement;

  function lang() { return root.getAttribute('data-lang') === 'en' ? 'en' : 'zh'; }
  function t(key, n) {
    var entry = dict[key];
    var l = lang();
    var s = entry ? ((String(n) === '1' && entry[l + '_one']) || entry[l] || entry.zh) : key;
    return n === undefined || n === null ? s : s.replace('{n}', n);
  }
  function apply(scope) {
    var base = scope || document;
    base.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'), node.getAttribute('data-i18n-n'));
    });
    base.querySelectorAll('[data-i18n-attr]').forEach(function (node) {
      node.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i > 0) node.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim(), node.getAttribute('data-i18n-n')));
      });
    });
    root.lang = lang() === 'en' ? 'en' : 'zh-Hant';
    // 語言鍵顯示「另一個語言」
    document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
      var other = lang() === 'en' ? 'zh' : 'en';
      b.textContent = other === 'en' ? 'EN' : '中';
      b.lang = other === 'en' ? 'en' : 'zh-Hant';
      b.setAttribute('aria-label', t('lang.switch_to'));
      b.title = t('lang.switch_to');
    });
  }
  function set(l) {
    root.setAttribute('data-lang', l);
    try { localStorage.setItem('lang', l); } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } }));
  }

  window.siteI18n = { t: t, lang: lang, apply: apply };
  document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { set(lang() === 'en' ? 'zh' : 'en'); });
    b.hidden = false;
  });
  apply();
})();
