import { ease, lerp, clamp } from 'scene3d/anim.js';

export const LIGHT_MIN = 300;
export const LIGHT_MAX = 1500;
const DAWN = 1400;
const DAWN_QUICK = 600;
const REVEAL_FROM = -0.35;
const REVEAL_TO = 1.4;

export function introK(el, { reduce, lampOn, quick }) {
  if (el < 0) return 1;
  if (reduce) return 0;
  if (!lampOn) return 1 - ease(clamp(el / (quick ? DAWN_QUICK : DAWN), 0, 1));
  if (quick) return el < 70 ? 1 : 0.7 * (1 - ease(clamp((el - 70) / 300, 0, 1)));
  if (el < 84) return 1;
  if (el < 168) return 0.3;
  if (el < 252) return 0.8;
  return 0.8 * (1 - ease(clamp((el - 252) / 400, 0, 1)));
}

export function introLevels(k, on, lampOn, darkness) {
  return {
    unlit: on && lampOn ? darkness * k : 0,
    sketch: on && !lampOn ? lerp(REVEAL_TO, REVEAL_FROM, k) : 9,
  };
}
