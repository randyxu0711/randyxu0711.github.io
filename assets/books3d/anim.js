export function bezier(x1, y1, x2, y2) {
  const f = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let k = 0; k < 18; k++) {
      if (f(x1, x2, t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return f(y1, y2, t);
  };
}

export const ease = bezier(0.3, 0.7, 0.2, 1);

export const lerp = (a, b, t) => a + (b - a) * t;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function approach(cur, target, dt, rate) {
  return cur + (target - cur) * (1 - Math.exp(-dt * rate));
}
