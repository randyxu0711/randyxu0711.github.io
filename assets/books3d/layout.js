export const W = 144;
export const GAP = 3;
export const PAD = 18;
export const LIP = 14;
export const ROW_GAP = 64;
export const GROUP_GAP = 90;
export const MERGE_YEARS = 12;
const HUES = [[45, 'red'], [80, 'orange'], [120, 'yellow'], [180, 'green'], [285, 'blue'], [330, 'purple'], [361, 'pink']];
const GREY = 0.035;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function thickness(b) {
  return b.p ? clamp(Math.floor(b.p / 11), 18, 50) : 24;
}

export function height(b) {
  return W / clamp(b.q || 0.66, 0.55, 0.78);
}

export function footprint(b, view) {
  return view === 'covers' ? W : thickness(b);
}

const RATINGS = [5, 4, 3, 2, 1, 0];

export function oklch(hex) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

const byDate = (books, dir) => (a, b) => dir * ((books[a].d || '').localeCompare(books[b].d || ''));
const initial = (name) => (Array.from((name || '?').trim())[0] || '?').toUpperCase();

const SORTS = {
  rating(books) {
    return RATINGS.map((r) => ({
      key: 'rating:' + r,
      label: r ? { kind: 'stars', n: r } : { kind: 'unrated' },
      list: books.map((b, i) => i).filter((i) => (books[i].r || 0) === r),
    })).filter((g) => g.list.length);
  },
  year(books) {
    const years = new Map();
    books.forEach((b, i) => {
      const y = b.d ? b.d.slice(0, 4) : '';
      if (!years.has(y)) years.set(y, []);
      years.get(y).push(i);
    });
    const runs = [];
    [...years.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a))).forEach((y) => {
      const list = years.get(y).sort(byDate(books, -1));
      const small = !!y && list.length < MERGE_YEARS;
      const prev = runs[runs.length - 1];
      if (small && prev && prev.small) {
        prev.list.push(...list);
        prev.from = y;
      } else runs.push({ small, from: y, to: y, list });
    });
    return runs.map((g) => ({
      key: 'year:' + (g.from === g.to ? g.to || 'none' : g.from + '-' + g.to),
      label: !g.to ? { kind: 'undated' } : g.from === g.to ? { kind: 'year', year: g.to } : { kind: 'years', year: g.from + '–' + g.to },
      list: g.list,
    }));
  },
  color(books) {
    const c = books.map((b) => oklch(b.c));
    const grey = (i) => c[i].c < GREY;
    const list = books.map((b, i) => i).sort((a, b) => {
      if (grey(a) !== grey(b)) return grey(a) ? 1 : -1;
      return grey(a) ? c[b].l - c[a].l : c[a].h - c[b].h;
    });
    const hue = (i) => (grey(i) ? 'grey' : HUES.find(([top]) => c[i].h < top)[1]);
    return {
      continuous: true,
      list,
      rowLabel: () => null,
      section: hue,
      sectionLabel: (part) => ({ kind: 'hue', hue: hue(part[0]), c: books[part[part.length >> 1]].c }),
    };
  },
  author(books) {
    const list = books.map((b, i) => i).sort((a, b) => books[a].a.localeCompare(books[b].a) || byDate(books, 1)(a, b));
    const rowLabel = (row) => {
      const a = initial(books[row[0]].a);
      const z = initial(books[row[row.length - 1]].a);
      return { kind: 'letters', text: a === z ? a : a + '–' + z };
    };
    const letter = (i) => {
      const a = initial(books[i].a).normalize('NFD')[0];
      return /[A-Z]/.test(a) ? a : '#';
    };
    const sectionLabel = (part) => (letter(part[0]) === '#' ? rowLabel(part) : { kind: 'letters', text: letter(part[0]) });
    return { continuous: true, list, rowLabel, section: letter, sectionLabel };
  },
};

function sections(groups, total) {
  const out = [];
  const push = (key, label, list) => {
    const from = out.length ? out[out.length - 1].from + out[out.length - 1].count : 0;
    out.push({ key, label, from, count: list.length, at: from / total, size: list.length / total });
  };
  if (!groups.continuous) {
    groups.forEach((g) => push(g.key, Object.assign({ count: g.list.length }, g.label), g.list));
    return out;
  }
  let part = [];
  let id;
  const flush = () => {
    if (part.length) push('section:' + out.length, Object.assign({ count: part.length }, groups.sectionLabel(part)), part);
    part = [];
  };
  groups.list.forEach((i) => {
    const k = groups.section(i);
    if (part.length && k !== id) flush();
    id = k;
    part.push(i);
  });
  flush();
  return out;
}

export function viewSpan(view, vw, vh) {
  const k = clamp((vw - 480) / (1024 - 480), 0, 1);
  const across = view === 'covers' ? (3.5 + 4.5 * k) * 150 : (10.5 + 9 * k) * 28;
  return Math.max(across, 320 * vw / vh);
}

export function inView(L, k, offset, cx, span) {
  const s = L.shelves[k];
  if (!s || s.minOffset === 0) return null;
  const left = cx - span / 2 - s.x0 - offset;
  const right = left + span;
  let a = 0;
  let z = -1;
  s.list.forEach((i, j) => {
    const x = L.items[i].lx;
    if (x < left) a = j + 1;
    if (x <= right) z = j;
  });
  return { a: a + 1, z: Math.max(a, z) + 1, count: s.count };
}

export const SORT_NAMES = Object.keys(SORTS);

export function layout(books, { view, sort, width, gutter, head }) {
  const avail = width - 2 * gutter;
  const x0 = -width / 2 + gutter;
  const items = new Array(books.length);
  const shelves = [];
  const groups = SORTS[sort](books);
  const grouped = !groups.continuous;

  const addShelf = (key, label, list) => {
    let lx = PAD;
    let tallest = 0;
    const s = shelves.length;
    list.forEach((i, k) => {
      const w = footprint(books[i], view);
      items[i] = { shelf: s, lx: lx + w / 2, w, rank: k };
      lx += w + GAP;
      tallest = Math.max(tallest, height(books[i]));
    });
    const content = lx - GAP + PAD;
    const length = Math.max(avail, content);
    const first = shelves.length ? shelves[s - 1].first + shelves[s - 1].count : 0;
    shelves.push({ key, label, list, x0, length, avail, tallest, count: list.length, first, minOffset: Math.min(0, avail - length), y: 0 });
  };

  if (grouped) {
    groups.forEach((g) => addShelf(g.key, Object.assign({ count: g.list.length }, g.label), g.list));
  } else {
    let row = [];
    let used = 2 * PAD - GAP;
    const flush = () => {
      if (!row.length) return;
      addShelf(sort + ':row:' + shelves.length, groups.rowLabel(row), row);
      row = [];
      used = 2 * PAD - GAP;
    };
    groups.list.forEach((i) => {
      const w = footprint(books[i], view) + GAP;
      if (row.length && used + w > avail) flush();
      row.push(i);
      used += w;
    });
    flush();
  }

  let cursor = 0;
  shelves.forEach((s, k) => {
    const above = k === 0 ? head : grouped ? GROUP_GAP : ROW_GAP;
    s.y = cursor - above - s.tallest;
    cursor = s.y - LIP;
  });

  return { view, sort, grouped, shelves, items, order: shelves.flatMap((s) => s.list), sections: sections(groups, books.length), height: -cursor + ROW_GAP };
}
