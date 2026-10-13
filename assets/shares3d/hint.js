const FINE = {
  desk: [[null, 'shares3d.hint.pick'], [null, 'shares3d.hint.scroll'], ['/', 'shares3d.hint.search']],
  pile: [[null, 'shares3d.hint.pick'], ['Esc', 'shares3d.hint.pile_close']],
  cab: [[null, 'shares3d.hint.drawer'], ['/', 'shares3d.hint.search']],
  drawer: [['↑ ↓', 'shares3d.hint.flip_cards'], ['Enter', 'shares3d.hint.pick_up'], ['Esc', 'shares3d.hint.close_drawer']],
  held: [['← →', 'shares3d.hint.next'], [null, 'shares3d.hint.flip'], ['Esc', 'shares3d.hint.put_back']],
};

const COARSE = {
  desk: [[null, 'shares3d.hint.tap'], [null, 'shares3d.hint.scroll']],
  pile: [[null, 'shares3d.hint.tap'], [null, 'shares3d.hint.scroll_close']],
  cab: [[null, 'shares3d.hint.tap_drawer']],
  drawer: [[null, 'shares3d.hint.tap_flip'], [null, 'shares3d.hint.tap_pick'], [null, 'shares3d.hint.scroll_close']],
  held: [[null, 'shares3d.hint.swipe'], [null, 'shares3d.hint.tap_card'], [null, 'shares3d.hint.tap_out']],
};

export function hintFor(stage, coarse) {
  return (coarse ? COARSE : FINE)[stage] || [];
}

export function createHint(el, t) {
  let last = '';
  function set(stage, count, coarse) {
    const key = `${stage}|${count || ''}|${coarse ? 1 : 0}|${document.documentElement.getAttribute('data-lang')}`;
    if (key === last) return;
    last = key;
    el.replaceChildren();
    if (count) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = count;
      el.append(c);
    }
    hintFor(stage, coarse).forEach(([k, text]) => {
      const s = document.createElement('span');
      if (k) {
        const kb = document.createElement('kbd');
        kb.textContent = k;
        s.append(kb);
      }
      s.append(t(text));
      el.append(s);
    });
  }
  return { set, reset: () => { last = ''; } };
}
