export const isCJK = (ch) => ch.codePointAt(0) >= 0x2e80;

export function wrap(ctx, text, maxW) {
  const lines = [];
  let line = '';
  let lastSpace = -1;
  Array.from(text).forEach((ch) => {
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxW) {
      if (!isCJK(ch) && lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + ch;
      } else {
        lines.push(line);
        line = ch === ' ' ? '' : ch;
      }
      lastSpace = line.lastIndexOf(' ');
    } else {
      line = next;
      if (ch === ' ') lastSpace = line.length - 1;
    }
  });
  if (line) lines.push(line);
  return lines;
}

export function clampLines(ctx, lines, max, maxW) {
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  let last = Array.from(out[max - 1]);
  while (last.length && ctx.measureText(last.join('') + '…').width > maxW) last.pop();
  out[max - 1] = last.join('') + '…';
  return out;
}
