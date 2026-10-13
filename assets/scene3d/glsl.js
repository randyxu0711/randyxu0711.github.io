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
