import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hintFor, keysFor } from 'shares3d/hint.js';

const STAGES = ['desk', 'cab', 'drawer', 'held', 'trail'];
const yaml = readFileSync(new URL('../../_data/i18n.yml', import.meta.url), 'utf8');

test('每個狀態在滑鼠與觸控都只有一句提示', () => {
  for (const s of STAGES) {
    assert.equal(hintFor(s, false).length, 1, s);
    assert.equal(hintFor(s, true).length, 1, s);
  }
  assert.deepEqual(hintFor('nowhere', false), []);
});

test('每個狀態的按鍵說明都收在 ? 裡', () => {
  for (const s of STAGES) assert.ok(keysFor(s).length > 0 && keysFor(s).every(([k]) => k), s);
  assert.deepEqual(keysFor('nowhere'), []);
});

test('提示文字的鍵都在 i18n.yml 裡,中英都有', () => {
  const keys = new Set(STAGES.flatMap((s) => [...hintFor(s, false), ...hintFor(s, true), ...keysFor(s).map(([, k]) => k)]));
  for (const k of keys) {
    const line = yaml.split('\n').find((l) => l.startsWith(k + ':'));
    assert.ok(line, `missing ${k}`);
    assert.match(line, /zh: "[^"]+"/, k);
    assert.match(line, /en: "[^"]+"/, k);
  }
});
