const ROOT = new URL('../../assets/', import.meta.url);

export async function resolve(spec, ctx, next) {
  if (spec.startsWith('scene3d/')) return { url: new URL(spec, ROOT).href, format: 'module', shortCircuit: true };
  return next(spec, ctx);
}
