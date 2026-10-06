// 主題切換:跟系統 / 晝 / 夜。偏好存在 localStorage('theme'),head 的行內 script 負責繪製前套用。
(function () {
  var group = document.querySelector('[data-theme-switch]');
  if (!group) return;
  var root = document.documentElement;
  var buttons = group.querySelectorAll('[data-theme-set]');
  function current() { return root.getAttribute('data-theme') || 'system'; }
  function paint() {
    var c = current();
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === c)); });
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-theme-set');
      if (v === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v);
      try { localStorage.setItem('theme', v); } catch (e) {}
      paint();
    });
  });
  group.hidden = false;
  paint();

  // 膠框高光跟著游標
  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest('.gel');
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  });
})();
