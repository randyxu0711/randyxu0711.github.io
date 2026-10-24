const DESK = { x0: 600, z0: 30, w: 1600, d: 800, top: 740, t: 32 };
const WINDOW = { z0: 700, z1: 1900, sill: 900, h: 1200, cols: 4, rows: 3 };

export const ROOM = {
  W: 3600,
  D: 4200,
  H: 2700,
  DESK,
  WINDOW,
  DESK_LAMP: [DESK.x0 + 500, DESK.top + 1000, DESK.z0 + 750],
  FLOOR_LAMP: [2700, 1500, 3500],
  BOOKCASE: [3440, 1300, 2100],
  GLOBE: [1900, 900, 4000],
};

const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((k) => k / l);
};
const toward = (from, to) => norm(to.map((k, i) => k - from[i]));

const ALT = Math.PI / 6;
const AZ = (25 * Math.PI) / 180;
export const SUN = [-Math.cos(ALT) * Math.cos(AZ), Math.sin(ALT), Math.cos(ALT) * Math.sin(AZ)];

const SKY = [0, WINDOW.sill + WINDOW.h, (WINDOW.z0 + WINDOW.z1) / 2];
const DESK_CENTER = [DESK.x0 + DESK.w / 2, DESK.top, DESK.z0 + DESK.d / 2];

export function toView(view, [x, y, z]) {
  if (view === 'books') return [z, y, -x];
  if (view === 'globe') return [-x, y, -z];
  return [x, y, z];
}

export function sunDir(view) {
  if (view === 'books') return toView(view, toward(ROOM.BOOKCASE, SKY));
  if (view === 'globe') return toView(view, toward(ROOM.GLOBE, SKY));
  return toView(view, SUN);
}

export function lampDir(view) {
  if (view === 'books') return toView(view, toward(ROOM.BOOKCASE, ROOM.FLOOR_LAMP));
  if (view === 'globe') return toView(view, toward(ROOM.GLOBE, ROOM.FLOOR_LAMP));
  return toView(view, toward(DESK_CENTER, ROOM.DESK_LAMP));
}
