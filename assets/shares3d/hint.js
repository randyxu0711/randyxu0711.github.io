const FINE = {
  desk: [['← →', 'shares3d.hint.next'], ['Enter', 'shares3d.hint.pick_up'], ['↑', 'shares3d.hint.look_up'], ['/', 'shares3d.hint.search']],
  cab: [[null, 'shares3d.hint.drawer'], ['↓', 'shares3d.hint.look_down'], ['/', 'shares3d.hint.search']],
  drawer: [['← →', 'shares3d.hint.flip_cards'], ['Enter', 'shares3d.hint.pick_up'], ['Esc', 'shares3d.hint.close_drawer']],
  held: [['← →', 'shares3d.hint.next'], [null, 'shares3d.hint.flip'], ['Esc', 'shares3d.hint.put_back']],
};

const COARSE = {
  desk: [[null, 'shares3d.hint.swipe']],
  cab: [[null, 'shares3d.hint.tap_drawer']],
  drawer: [[null, 'shares3d.hint.tap_flip']],
  held: [[null, 'shares3d.hint.tap_card']],
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
