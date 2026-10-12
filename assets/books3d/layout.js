export const W = 144;
export const GAP = 3;
export const PAD = 18;
export const LIP = 14;
export const ROW_GAP = 64;
export const GROUP_GAP = 110;

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

const SORTS = {
  rating(books) {
    return RATINGS.map((r) => ({
      key: 'rating:' + r,
      label: r ? { kind: 'stars', n: r } : { kind: 'unrated' },
      list: books.map((b, i) => i).filter((i) => (books[i].r || 0) === r),
    })).filter((g) => g.list.length);
  },
};

export const SORT_NAMES = Object.keys(SORTS);

export function layout(books, { view, sort, width, gutter, head }) {
  const avail = width - 2 * gutter;
  const x0 = -width / 2 + gutter;
  const items = new Array(books.length);
  const shelves = [];
  const groups = (SORTS[sort] || SORTS.rating)(books);
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
      addShelf('row:' + shelves.length, groups.rowLabel ? groups.rowLabel(row) : null, row);
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
