const ROOT = new URL('../../assets/', import.meta.url);

export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: new URL('vendor/three/three.module.min.js', ROOT).href, format: 'module', shortCircuit: true };
  if (spec.startsWith('scene3d/') || spec.startsWith('shares3d/') || spec.startsWith('books3d/')) return { url: new URL(spec, ROOT).href, format: 'module', shortCircuit: true };
  return next(spec, ctx);
}
