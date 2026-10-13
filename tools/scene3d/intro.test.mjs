import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ease, lerp, clamp } from 'scene3d/anim.js';
import { introK, introLevels, LIGHT_MIN, LIGHT_MAX } from 'scene3d/intro.js';

const DAWN = 1400;
const DAWN_QUICK = 600;
const REVEAL_FROM = -0.35;
const REVEAL_TO = 1.4;

function reference(el, reduce, lampOn, quick, darkness) {
  let intro = true;
  let k = 1;
  if (el >= 0) {
    if (reduce) k = 0;
    else if (!lampOn) k = 1 - ease(clamp(el / (quick ? DAWN_QUICK : DAWN), 0, 1));
    else if (quick) k = el < 70 ? 1 : 0.7 * (1 - ease(clamp((el - 70) / 300, 0, 1)));
    else if (el < 84) k = 1;
    else if (el < 168) k = 0.3;
    else if (el < 252) k = 0.8;
    else k = 0.8 * (1 - ease(clamp((el - 252) / 400, 0, 1)));
  }
  if (k === 0) intro = false;
  return { k, unlit: intro && lampOn ? darkness * k : 0, sketch: intro && !lampOn ? lerp(REVEAL_TO, REVEAL_FROM, k) : 9 };
}

test('跟搬之前的 introLevels 逐點相同', () => {
  for (const reduce of [false, true])
    for (const lampOn of [false, true])
      for (const quick of [null, false, true])
        for (let el = -1; el <= 2000; el += 7) {
          const want = reference(el, reduce, lampOn, quick, 0.9);
          const k = introK(el, { reduce, lampOn, quick });
          assert.equal(k, want.k, `k el=${el} reduce=${reduce} lampOn=${lampOn} quick=${quick}`);
          assert.deepEqual(introLevels(k, k !== 0, lampOn, 0.9), { unlit: want.unlit, sketch: want.sketch });
        }
});

test('開燈前全暗或全素描', () => {
  assert.equal(introK(-1, { reduce: false, lampOn: true, quick: null }), 1);
  assert.deepEqual(introLevels(1, true, true, 0.9), { unlit: 0.9, sketch: 9 });
  const lv = introLevels(1, true, false, 0.9);
  assert.equal(lv.unlit, 0);
  assert.ok(Math.abs(lv.sketch - REVEAL_FROM) < 1e-12);
});

test('夜間檯燈閃兩下', () => {
  const at = (el) => introK(el, { reduce: false, lampOn: true, quick: false });
  assert.deepEqual([at(50), at(100), at(200)], [1, 0.3, 0.8]);
  assert.equal(at(700), 0);
});

test('reduced motion 一開燈就結束', () => {
  assert.equal(introK(0, { reduce: true, lampOn: true, quick: false }), 0);
  assert.deepEqual(introLevels(0, false, true, 0.9), { unlit: 0, sketch: 9 });
});

test('開燈時間常數', () => {
  assert.deepEqual([LIGHT_MIN, LIGHT_MAX], [300, 1500]);
});
