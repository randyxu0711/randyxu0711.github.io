import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, clampLines, isCJK } from 'scene3d/text.js';

const ctx = { measureText: (s) => ({ width: Array.from(s).length * 10 }) };

test('英文在空白處換行', () => {
  assert.deepEqual(wrap(ctx, 'agent identity drafts', 100), ['agent', 'identity', 'drafts']);
});

test('中文逐字換行', () => {
  assert.deepEqual(wrap(ctx, '目錄櫃的抽屜卡片', 30), ['目錄櫃', '的抽屜', '卡片']);
  assert.equal(isCJK('中'), true);
  assert.equal(isCJK('a'), false);
});

test('超過行數時最後一行加刪節號且不超寬', () => {
  const out = clampLines(ctx, ['aaaa', 'bbbb', 'cccc'], 2, 40);
  assert.deepEqual(out, ['aaaa', 'bbb…']);
  assert.ok(ctx.measureText(out[1]).width <= 40);
});

test('沒超過行數時原樣回傳', () => {
  const lines = ['a', 'b'];
  assert.equal(clampLines(ctx, lines, 5, 40), lines);
});
