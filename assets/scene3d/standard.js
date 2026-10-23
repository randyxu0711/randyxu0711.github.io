import * as THREE from 'three';

export function standard({ params = {}, uniforms = {}, attrs = '', vertex = '', head = '', color = '', finish = '' }) {
  const m = new THREE.MeshStandardMaterial(params);
  m.defines = Object.assign({ USE_UV: '' }, m.defines);
  const key = attrs + vertex + head + color + finish;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorld;\n${attrs}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
{
  vec4 wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
#endif
  vWorld = (modelMatrix * wp).xyz;
}
${vertex}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorld;\n${head}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${color}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${finish}`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function fadeDepth(attr = 'iFade', gone = 0.5) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${attr};\nvarying float vGone;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGone = ${attr};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGone;')
      .replace('void main() {', `void main() {\n  if (vGone > ${gone.toFixed(2)}) discard;`);
  };
  m.customProgramCacheKey = () => 'fade-depth-' + attr;
  return m;
}
