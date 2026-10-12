export const W = 144;
export const GAP = 3;
export const PAD = 18;
export const LIP = 14;
export const ROW_GAP = 64;
export const GROUP_GAP = 90;

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
    return [...years.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a))).map((y) => ({
      key: 'year:' + (y || 'none'),
      label: y ? { kind: 'year', year: y } : { kind: 'undated' },
      list: years.get(y).sort(byDate(books, -1)),
    }));
  },
  color(books) {
    const c = books.map((b) => oklch(b.c));
    const grey = (i) => c[i].c < 0.035;
    const list = books.map((b, i) => i).sort((a, b) => {
      if (grey(a) !== grey(b)) return grey(a) ? 1 : -1;
      return grey(a) ? c[b].l - c[a].l : c[a].h - c[b].h;
    });
    return { continuous: true, list, rowLabel: () => null };
  },
  author(books) {
    const list = books.map((b, i) => i).sort((a, b) => books[a].a.localeCompare(books[b].a) || byDate(books, 1)(a, b));
    return {
      continuous: true,
      list,
      rowLabel: (row) => {
        const a = initial(books[row[0]].a);
        const z = initial(books[row[row.length - 1]].a);
        return { kind: 'letters', text: a === z ? a : a + '–' + z };
      },
    };
  },
  pages(books) {
    const list = books.map((b, i) => i).sort((a, b) => (books[a].p || Infinity) - (books[b].p || Infinity));
    return {
      continuous: true,
      list,
      rowLabel: (row) => {
        const p = row.map((i) => books[i].p).filter(Boolean);
        if (!p.length) return { kind: 'nopages' };
        const a = Math.min(...p);
        const z = Math.max(...p);
        return { kind: 'pages', text: a === z ? String(a) : a + '–' + z };
      },
    };
  },
};

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
    shelves.push({ key, label, list, x0, length, avail, tallest, count: list.length, minOffset: Math.min(0, avail - length), y: 0 });
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

  return { view, sort, grouped, shelves, items, height: -cursor + ROW_GAP };
}
