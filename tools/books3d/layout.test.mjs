import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, viewSpan, inView, countryRun, carcass, SIDE, LIP, MERGE_YEARS, PAD, GAP, W, SORT_NAMES } from 'books3d/layout.js';

const book = (extra = {}) => ({ r: 3, d: '2024-01-01', a: 'Author', p: 300, q: 0.66, c: '#888888', ...extra });
const many = (n, f) => Array.from({ length: n }, (_, k) => book(f(k)));
const lay = (books, sort, view = 'covers', width = 1200) => layout(books, { view, sort, width, gutter: 16, head: 50 });

test('years with fewer than MERGE_YEARS books merge with adjacent small years into a range', () => {
  const books = [
    ...many(30, (k) => ({ d: '2024-03-' + String(1 + (k % 28)).padStart(2, '0') })),
    ...many(10, () => ({ d: '2022-05-01' })),
    ...many(10, () => ({ d: '2021-05-01' })),
    ...many(5, () => ({ d: '2020-05-01' })),
  ];
  const L = lay(books, 'year');
  assert.deepEqual(L.shelves.map((s) => s.count), [30, 25]);
  assert.deepEqual(L.shelves[1].label, { count: 25, kind: 'years', year: '2020–2022' });
  assert.equal(L.shelves[0].label.kind, 'year');
  const dates = L.shelves[1].list.map((i) => books[i].d);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('a small year between big years stays on its own', () => {
  const books = [
    ...many(MERGE_YEARS, () => ({ d: '2025-01-01' })),
    ...many(3, () => ({ d: '2024-01-01' })),
    ...many(MERGE_YEARS, () => ({ d: '2023-01-01' })),
  ];
  const L = lay(books, 'year');
  assert.deepEqual(L.shelves.map((s) => s.label.year), ['2025', '2024', '2023']);
});

test('undated books never merge into a year range', () => {
  const books = [...many(3, () => ({ d: '2020-01-01' })), ...many(2, () => ({ d: null }))];
  const L = lay(books, 'year');
  assert.deepEqual(L.shelves.map((s) => s.label.kind), ['year', 'undated']);
});

test('rating groups are never merged', () => {
  const books = [book({ r: 5 }), book({ r: 1 }), book({ r: 0 })];
  assert.equal(lay(books, 'rating').shelves.length, 3);
});

test('grouped sorts keep one shelf per group that slides sideways', () => {
  const books = many(40, () => ({ r: 4 }));
  const L = lay(books, 'rating');
  assert.equal(L.shelves.length, 1);
  assert.ok(L.shelves[0].minOffset < 0);
});

test('five sorts, rating first, region last; pages is gone', () => {
  assert.deepEqual(SORT_NAMES, ['rating', 'year', 'color', 'author', 'region']);
});

test('rail sections cover every book once, in order, sized by book count', () => {
  const books = [...many(9, () => ({ r: 5 })), ...many(71, () => ({ r: 4 })), ...many(20, () => ({ r: 3 }))];
  for (const sort of SORT_NAMES) {
    const L = lay(books, sort);
    let from = 0;
    L.sections.forEach((s) => {
      assert.equal(s.from, from);
      assert.equal(s.at, s.from / books.length);
      assert.equal(s.size, s.count / books.length);
      from += s.count;
    });
    assert.equal(from, books.length);
    assert.equal(L.order.length, books.length);
  }
  const L = lay(books, 'rating');
  assert.deepEqual(L.sections.map((s) => s.size), [0.09, 0.71, 0.2]);
});

test('author sections group by base letter and put non-Latin initials together', () => {
  const books = [book({ a: 'Abe' }), book({ a: 'Álvarez' }), book({ a: 'Azuma' }), book({ a: 'Borges' }), book({ a: '朱宥勳' }), book({ a: '胡晴舫' })];
  const L = lay(books, 'author');
  assert.deepEqual(L.sections.map((s) => [s.label.text, s.count]), [['A', 3], ['B', 1], ['朱–胡', 2]]);
});

test('colour sections are hue bands with a sample colour, neutrals last', () => {
  const books = [book({ c: '#c03030' }), book({ c: '#3050c0' }), book({ c: '#777777' })];
  const L = lay(books, 'color');
  assert.deepEqual(L.sections.map((s) => s.label.hue), ['red', 'blue', 'grey']);
  assert.equal(L.sections[1].label.c, '#3050c0');
});

test('shelves know the rank of their first book', () => {
  const L = lay(many(30, () => ({})), 'author', 'covers', 800);
  L.shelves.forEach((s, k) => assert.equal(s.first, k ? L.shelves[k - 1].first + L.shelves[k - 1].count : 0));
  assert.deepEqual(L.order, L.shelves.flatMap((s) => s.list));
});

test('phone covers view fits three covers per row', () => {
  for (const [vw, vh] of [[360, 780], [390, 844], [430, 932]]) {
    const span = viewSpan('covers', vw, vh);
    const L = layout(many(30, () => ({})), { view: 'covers', sort: 'author', width: span, gutter: 16 * span / vw, head: 50 });
    assert.equal(L.shelves[0].count, 3, vw + 'px');
    assert.ok(W * vw / span >= 95, 'covers stay at least 95px wide');
  }
});

test('desktop spans are unchanged', () => {
  assert.equal(viewSpan('covers', 1440, 900), 1200);
  assert.equal(viewSpan('spines', 1440, 900), 19.5 * 28);
});

test('inView reports the 1-based ranks visible on a sliding shelf', () => {
  const books = many(40, () => ({ r: 4 }));
  const span = 1200;
  const L = lay(books, 'rating', 'covers', span);
  const s = L.shelves[0];
  const step = W + GAP;
  const first = inView(L, 0, 0, 0, span);
  assert.equal(first.a, 1);
  assert.equal(first.count, 40);
  assert.equal(first.z, Math.floor((span - 16 - PAD - W / 2) / step) + 1);
  const end = inView(L, 0, s.minOffset, 0, span);
  assert.equal(end.z, 40);
  const mid = inView(L, 0, -10 * step, 0, span);
  assert.equal(mid.a, first.a + 10);
  assert.equal(mid.z, first.z + 10);
});

test('inView is null for shelves that fit the screen', () => {
  const L = lay(many(3, () => ({})), 'rating');
  assert.equal(inView(L, 0, 0, 0, 1200), null);
});

const GEO = {
  'United Kingdom': ['northern-europe', 'europe'],
  Sweden: ['northern-europe', 'europe'],
  France: ['western-europe', 'europe'],
  Italy: ['southern-europe', 'europe'],
  'United States': ['northern-america', 'americas'],
  Canada: ['northern-america', 'americas'],
  Japan: ['eastern-asia', 'asia'],
};
const placed = (g) => (GEO[g] ? { g, sr: GEO[g][0], ct: GEO[g][1] } : { g: g || null, sr: null, ct: null });
const shelf = () => [
  ...['Japan', 'Japan', 'Japan'],
  ...['United States', 'United States', 'United States', 'Canada'],
  ...['France', 'France'],
  ...['Sweden', 'United Kingdom', 'Sweden', 'United Kingdom', 'United Kingdom'],
  ...['Italy'],
  ...[null, 'Atlantis'],
].map((g, k) => book({ ...placed(g), id: k }));

test('region groups by subregion, continents by book count, then subregions by count', () => {
  const L = lay(shelf(), 'region');
  assert.deepEqual(L.shelves.map((s) => s.key), [
    'region:northern-europe', 'region:western-europe', 'region:southern-europe',
    'region:northern-america', 'region:eastern-asia', 'region:none',
  ]);
  assert.deepEqual(L.shelves[0].label, { count: 5, kind: 'region', id: 'northern-europe' });
  assert.deepEqual(L.shelves[5].label, { count: 2, kind: 'unplaced' });
});

test('region ties fall back to the id', () => {
  const books = ['France', 'Italy'].map((g) => book(placed(g)));
  assert.deepEqual(lay(books, 'region').shelves.map((s) => s.key), ['region:southern-europe', 'region:western-europe']);
});

test('within a region, countries run together by count, then in book order', () => {
  const books = shelf();
  const L = lay(books, 'region');
  assert.deepEqual(L.shelves[0].list.map((i) => books[i].g), ['United Kingdom', 'United Kingdom', 'United Kingdom', 'Sweden', 'Sweden']);
  assert.deepEqual(L.shelves[0].list, [10, 12, 13, 9, 11]);
  assert.deepEqual(L.shelves[3].list.map((i) => books[i].g), ['United States', 'United States', 'United States', 'Canada']);
  assert.deepEqual(L.shelves[5].list, [15, 16]);
});

test('equal-count countries in a region order by name', () => {
  const books = ['United States', 'Canada'].map((g) => book(placed(g)));
  assert.deepEqual(lay(books, 'region').shelves[0].list.map((i) => books[i].g), ['Canada', 'United States']);
});

test('region sections are the subregions, sized by book count', () => {
  const L = lay(shelf(), 'region');
  assert.deepEqual(L.sections.map((s) => [s.key, s.count]), [
    ['region:northern-europe', 5], ['region:western-europe', 2], ['region:southern-europe', 1],
    ['region:northern-america', 4], ['region:eastern-asia', 3], ['region:none', 2],
  ]);
  assert.equal(L.sections[0].size, 5 / 17);
});

test('without geo data every book is unplaced', () => {
  const L = lay(many(4, () => ({})), 'region');
  assert.deepEqual(L.shelves.map((s) => s.key), ['region:none']);
});

test('countryRun finds where a country starts on its shelf and how many books it has', () => {
  const books = shelf();
  const L = lay(books, 'region');
  assert.deepEqual(countryRun(L, books, 'Sweden'), { shelf: 0, key: 'region:northern-europe', from: 3, count: 2 });
  assert.deepEqual(countryRun(L, books, 'Canada'), { shelf: 3, key: 'region:northern-america', from: 3, count: 1 });
  assert.equal(countryRun(L, books, 'Atlantis'), null);
  assert.equal(countryRun(L, books, 'Peru'), null);
  assert.equal(countryRun(lay(books, 'rating'), books, 'Sweden'), null);
});

const rows = [{ x: -100, y: 0, length: 900 }, { x: 40, y: -300, length: 600 }, { x: 0, y: -620, length: 700 }];

test('every shelf gets a back and two sides', () => {
  const parts = carcass(rows);
  assert.equal(parts.length, rows.length * 3);
  assert.equal(parts.filter((p) => p.kind === 'back').length, rows.length);
});

test('sides flank the shelf ends', () => {
  rows.forEach((s, k) => {
    const [l, r] = carcass(rows).slice(k * 3, k * 3 + 3).filter((p) => p.kind === 'side');
    assert.equal(l.x + l.w, s.x);
    assert.equal(r.x, s.x + s.length);
    assert.equal(l.w, SIDE);
  });
});

test('backs reach the underside of the shelf above', () => {
  const backs = carcass(rows).filter((p) => p.kind === 'back');
  for (let k = 1; k < rows.length; k++) {
    assert.equal(backs[k].y, rows[k].y);
    assert.equal(backs[k].y + backs[k].h, rows[k - 1].y - LIP);
    assert.equal(backs[k].w, rows[k].length);
  }
  assert.ok(backs[0].h > 0);
});

test('a lone shelf still gets a back', () => {
  const [back] = carcass([{ x: 0, y: 0, length: 500 }]);
  assert.ok(back.h > 100);
});
