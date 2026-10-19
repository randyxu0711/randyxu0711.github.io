import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keysFor } from 'shares3d/hint.js';

const STAGES = ['desk', 'cab', 'drawer', 'held'];
const yaml = readFileSync(new URL('../../_data/i18n.yml', import.meta.url), 'utf8');

test('每個狀態的按鍵說明都收在 ? 裡', () => {
  for (const s of STAGES) assert.ok(keysFor(s).length > 0 && keysFor(s).every(([k]) => k), s);
  assert.deepEqual(keysFor('nowhere'), []);
});

test('按鍵說明的鍵都在 i18n.yml 裡,中英都有', () => {
  const keys = new Set(STAGES.flatMap((s) => keysFor(s).map(([, k]) => k)));
  for (const k of keys) {
    const line = yaml.split('\n').find((l) => l.startsWith(k + ':'));
    assert.ok(line, `missing ${k}`);
    assert.match(line, /zh: "[^"]+"/, k);
    assert.match(line, /en: "[^"]+"/, k);
  }
});
