const LINE = {
  desk: ['shares3d.hint.desk', 'shares3d.hint.desk_touch'],
  cab: ['shares3d.hint.cab', 'shares3d.hint.cab_touch'],
  drawer: ['shares3d.hint.drawer', 'shares3d.hint.drawer_touch'],
  held: ['shares3d.hint.flip', 'shares3d.hint.tap_card'],
  trail: ['shares3d.hint.trail', 'shares3d.hint.trail_touch'],
};

const KEYS = {
  desk: [['← →', 'shares3d.hint.next'], ['Enter', 'shares3d.hint.pick_up'], ['↑', 'shares3d.hint.look_up'], ['/', 'shares3d.hint.search']],
  cab: [['↓', 'shares3d.hint.look_down'], ['/', 'shares3d.hint.search']],
  drawer: [['← →', 'shares3d.hint.flip_cards'], ['Enter', 'shares3d.hint.pick_up'], ['Esc', 'shares3d.hint.close_drawer']],
  held: [['← →', 'shares3d.hint.next'], ['Esc', 'shares3d.hint.put_back']],
  trail: [['← →', 'shares3d.hint.flip_cards'], ['Enter', 'shares3d.hint.pick_up'], ['Esc', 'shares3d.hint.put_away']],
};

export function hintFor(stage, coarse) {
  return LINE[stage] ? [LINE[stage][coarse ? 1 : 0]] : [];
}

export function keysFor(stage) {
  return KEYS[stage] || [];
}

export function createHint(el, help, t) {
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
    hintFor(stage, coarse).forEach((text) => {
      const s = document.createElement('span');
      s.textContent = t(text);
      el.append(s);
    });
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
