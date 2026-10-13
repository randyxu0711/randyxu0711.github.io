import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hintFor } from 'shares3d/hint.js';

const STAGES = ['desk', 'pile', 'cab', 'drawer', 'held'];
const yaml = readFileSync(new URL('../../_data/i18n.yml', import.meta.url), 'utf8');

test('每個狀態在滑鼠與觸控都有提示', () => {
  for (const s of STAGES) {
    assert.ok(hintFor(s, false).length > 0, s);
    assert.ok(hintFor(s, true).length > 0, s);
  }
  assert.deepEqual(hintFor('nowhere', false), []);
});

test('觸控提示不顯示按鍵', () => {
  for (const s of STAGES) assert.ok(hintFor(s, true).every(([k]) => k === null), s);
});

test('提示文字的鍵都在 i18n.yml 裡,中英都有', () => {
  const keys = new Set(STAGES.flatMap((s) => [...hintFor(s, false), ...hintFor(s, true)].map(([, k]) => k)));
  for (const k of keys) {
    const line = yaml.split('\n').find((l) => l.startsWith(k + ':'));
    assert.ok(line, `missing ${k}`);
    assert.match(line, /zh: "[^"]+"/, k);
    assert.match(line, /en: "[^"]+"/, k);
  }
});
