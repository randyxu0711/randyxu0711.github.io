const KEYS = {
  desk: [['← →', 'shares3d.hint.next'], ['Enter', 'shares3d.hint.pick_up'], ['↑', 'shares3d.hint.look_up'], ['/', 'shares3d.hint.search']],
  cab: [['↓', 'shares3d.hint.look_down'], ['/', 'shares3d.hint.search']],
  drawer: [['← →', 'shares3d.hint.flip_cards'], ['Enter', 'shares3d.hint.pick_up'], ['Esc', 'shares3d.hint.close_drawer']],
  held: [['← →', 'shares3d.hint.next'], ['Esc', 'shares3d.hint.put_back']],
};

export function keysFor(stage) {
  return KEYS[stage] || [];
}

export function createHint(el, help, t) {
  let last = '';
  function set(stage, count) {
    const key = `${stage}|${count || ''}|${document.documentElement.getAttribute('data-lang')}`;
    if (key === last) return;
    last = key;
    el.replaceChildren();
    if (count) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = count;
      el.append(c);
    }
    help.replaceChildren(...keysFor(stage).map(([k, text]) => {
      const row = document.createElement('span');
      const kb = document.createElement('kbd');
      kb.textContent = k;
      row.append(kb, t(text));
      return row;
    }));
  }
  return { set, reset: () => { last = ''; } };
}
