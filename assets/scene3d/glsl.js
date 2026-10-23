export const LIGHT = /* glsl */ `
uniform vec3 uLight;
uniform float uAmbient;
uniform float uKey;
uniform vec4 uLamp;
uniform vec3 uLampColor;
uniform float uLampReach;
varying vec3 vWorld;
vec3 lit(vec3 c, vec3 n) {
  vec3 nn = normalize(n);
  vec3 day = vec3(uAmbient + uKey * max(dot(nn, uLight), 0.0));
  vec3 d = uLamp.xyz - vWorld;
  float dist = length(d);
  float fall = 1.0 / (1.0 + pow(dist / uLampReach, 2.0));
  vec3 lamp = day * 0.4 + uLampColor * (1.3 * max(dot(nn, d / dist), 0.0) * fall);
  return c * mix(day, lamp, uLamp.w);
}
`;

export const REVEAL = /* glsl */ `
uniform vec4 uSketch;
float sketchAmount() {
  if (uSketch.w > 2.0) return 0.0;
  vec2 p = (gl_FragCoord.xy - uSketch.xy) / uSketch.z;
  float d = length(p) + 0.05 * sin(p.x * 9.0 + p.y * 5.0) + 0.04 * sin(p.y * 13.0 - p.x * 7.0);
  return smoothstep(uSketch.w - 0.3, uSketch.w, d);
}
`;

export const SKETCH = /* glsl */ `
${REVEAL}
uniform vec3 uInk;
vec3 sketch(vec3 col, vec3 n, vec2 uv) {
  vec2 px = min(uv, 1.0 - uv) / max(fwidth(uv), vec2(1e-5));
  float s = sketchAmount();
  if (s <= 0.0) return col;
  float line = 1.0 - smoothstep(0.5, 1.5, min(px.x, px.y));
  vec3 paper = mix(uDesk, uInk, 0.06 * (1.0 - max(dot(normalize(n), uLight), 0.0)));
  return mix(col, mix(paper, uInk, line * 0.75), s);
}
`;

export const MATTER = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wood(vec2 p, float amt) {
  float warp = vnoise(p * vec2(0.006, 0.03)) * 5.0 + vnoise(p * vec2(0.02, 0.08)) * 1.5;
  float rings = 0.5 + 0.5 * sin(p.y * 0.11 + warp);
  float blur = clamp(1.0 - fwidth(p.y) * 0.4, 0.0, 1.0);
  float fine = mix(0.5, vnoise(p * vec2(0.015, 0.7)), blur);
  return 1.0 + amt * (mix(0.5, rings, clamp(1.0 - fwidth(p.y) * 0.05, 0.0, 1.0)) * 0.7 + fine * 0.6 - 0.65);
}
float fiber(vec2 p) {
  return 0.985 + 0.02 * vnoise(p * 0.9) + 0.01 * vnoise(p * 5.0) - 0.015;
}
uniform vec3 uSun;
uniform vec4 uSill;
uniform vec4 uCab;
float blocked(vec3 p) {
  vec3 lo = (vec3(-uCab.x, -1.0, uCab.w) - p) / uSun;
  vec3 hi = (vec3(uCab.x, uCab.y, uCab.z) - p) / uSun;
  vec3 a = min(lo, hi);
  vec3 b = max(lo, hi);
  return step(max(max(a.x, a.y), max(a.z, 0.5)), min(min(b.x, b.y), b.z));
}
float window(vec3 p) {
  float t = (uSill.x - p.x) / uSun.x;
  vec3 h = p + uSun * t;
  float soft = 0.012 * t;
  vec2 size = vec2(uSill.w, uSill.w * 0.75);
  vec2 q = vec2(h.z - uSill.z, h.y - uSill.y);
  vec2 e = min(q, size - q);
  float inside = smoothstep(-soft, soft, min(e.x, e.y));
  vec2 pane = size / vec2(4.0, 3.0);
  vec2 bar = abs(fract(q / pane + 0.5) - 0.5) * pane;
  float frame = smoothstep(16.0 - soft, 16.0 + soft, min(bar.x, bar.y));
  return inside * frame * (1.0 - blocked(p));
}
`;
