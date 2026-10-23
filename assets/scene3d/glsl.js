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
`;
