import { mainName } from 'shares3d/layout.js';

const NEAR = 8;
const SWIPE = 50;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createHeld(t) {
  const root = el('div', 'held');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-hidden', 'true');

  const stage = el('div', 'h-stage');
  const card = el('div', 'h-card');
  card.tabIndex = 0;
  const slide = el('div', 'h-slide');
  const flipper = el('div', 'h-flip');
  const front = el('div', 'h-front');
  const back = el('div', 'h-back');
  flipper.append(front, back);
  slide.append(flipper);
  card.append(slide);
  stage.append(card);

  const bar = el('div', 'h-bar');
  const prevBtn = el('button', 'key', '‹');
  const flipBtn = el('button', 'key', t('shares3d.flip'));
  const openLink = el('a', 'key', `${t('shares3d.open')} ↗`);
  const arch = el('span', 'h-arch');
  const closeBtn = el('button', 'key', t('shares3d.put_back'));
  const nextBtn = el('button', 'key', '›');
  [prevBtn, flipBtn, closeBtn, nextBtn].forEach((b) => { b.type = 'button'; });
  flipBtn.setAttribute('aria-pressed', 'false');
  openLink.target = '_blank';
  openLink.rel = 'noopener';
  arch.hidden = true;
  bar.append(prevBtn, flipBtn, openLink, arch, closeBtn, nextBtn);
  root.append(stage, bar);
  document.body.append(root);

  let listener = () => {};
  let shown = false;
  let flipped = false;
  let busy = false;
  let current = null;
  let backLabel = null;
  let backAlso = null;
  let opener = null;
  const act = (a, arg) => listener(a, arg);

  function applyLabels() {
    prevBtn.setAttribute('aria-label', t('shares3d.prev'));
    nextBtn.setAttribute('aria-label', t('shares3d.next'));
    flipBtn.textContent = t('shares3d.flip');
    openLink.textContent = `${t('shares3d.open')} ↗`;
    closeBtn.textContent = t('shares3d.put_back');
    if (current) arch.textContent = t('shares3d.archived');
    if (current && backLabel) backLabel.textContent = current.n ? t('shares3d.note') : t('shares3d.summary');
    if (current && backAlso) backAlso.textContent = t('shares3d.also_in', current.also.join('、'));
  }

  function fill(item) {
    current = item;
    card.style.setProperty('--stamp', item.stamp);
    const name = mainName(item.s);

    front.replaceChildren();
    const tabs = el('div', 'h-tabs');
    item.tabs.forEach((tab) => {
      const b = el('button', null, tab.name);
      b.type = 'button';
      b.style.setProperty('--c', tab.css);
      b.addEventListener('click', () => act('tag', tab.name));
      tabs.append(b);
    });
    const photo = el('figure', 'h-photo');
    photo.append(el('span', null, name));
    if (item.m) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => img.classList.add('in'));
      img.addEventListener('error', () => {
        if (item.m0 && img.getAttribute('src') !== item.m0) img.src = item.m0;
        else img.remove();
      });
      img.src = item.m;
      if (item.cached) img.classList.add('now');
      photo.append(img);
    }
    const meta = el('div', 'h-meta');
    meta.append(el('span', 'h-stamp', item.x ? '封存 ARCHIVED' : item.s), el('span', 'h-date', `${+item.d.slice(5, 7)}/${+item.d.slice(8, 10)}`));
    if (item.i) meta.append(el('span', 'h-num', `№ ${item.i}`));
    front.append(tabs, photo, el('h2', 'h-title', item.t), meta);
    if (item.n) front.append(el('div', 'h-sticky'));

    backLabel = el('div', 'h-label', item.n ? t('shares3d.note') : t('shares3d.summary'));
    back.replaceChildren(backLabel, el('h3', 'h-btitle', item.t), el('p', 'h-text', item.n || item.e || ''), el('div', 'h-btags', item.g.join(' · ')));
    backAlso = null;
    if (item.also && item.also.length) {
      backAlso = el('div', 'h-also', t('shares3d.also_in', item.also.join('、')));
      back.append(backAlso);
    }

    openLink.href = item.u;
    arch.hidden = !item.x;
    arch.textContent = t('shares3d.archived');
    if (shown) root.setAttribute('aria-label', item.t);
  }

  function target() {
    return card.getBoundingClientRect();
  }

  function setFlip(v) {
    flipped = v;
    flipper.classList.toggle('flipped', v);
    flipBtn.setAttribute('aria-pressed', String(v));
  }

  function flip(force) {
    setFlip(force === undefined ? !flipped : !!force);
  }

  function recolor(stampCss, tabs) {
    card.style.setProperty('--stamp', stampCss);
    front.querySelectorAll('.h-tabs button').forEach((sp, k) => { if (tabs[k]) sp.style.setProperty('--c', tabs[k].css); });
  }

  function show(focus = true) {
    opener = document.activeElement;
    shown = true;
    applyLabels();
    root.setAttribute('aria-hidden', 'false');
    if (current) root.setAttribute('aria-label', current.t);
    root.classList.add('on');
    if (focus) flipBtn.focus({ preventScroll: true });
  }

  function paste() {}

  function hide() {
    const inside = root.contains(document.activeElement);
    shown = false;
    if (inside) {
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      else document.activeElement.blur();
    }
    opener = null;
    root.classList.remove('on');
    root.setAttribute('aria-hidden', 'true');
    flipper.classList.add('snap');
    setFlip(false);
    flipper.getBoundingClientRect();
    flipper.classList.remove('snap');
    slide.getAnimations().forEach((a) => a.cancel());
  }

  function snapUnflip() {
    if (!flipped) return;
    flipper.classList.add('snap');
    setFlip(false);
    flipper.getBoundingClientRect();
    flipper.classList.remove('snap');
  }

  async function step(dir, item) {
    if (busy) return;
    busy = true;
    try {
      if (reduce.matches) {
        snapUnflip();
        fill(item);
        paste();
        return;
      }
      const out = slide.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 14}%)`, opacity: 0 }],
        { duration: 150, easing: 'ease-in', fill: 'forwards' }
      );
      await out.finished;
      snapUnflip();
      fill(item);
      const into = slide.animate(
        [{ transform: `translateX(${dir * 14}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 200, easing: 'ease-out' }
      );
      out.cancel();
      await into.finished;
      paste();
    } catch (e) {
      slide.getAnimations().forEach((a) => a.cancel());
    } finally {
      busy = false;
    }
  }

  function bump(dir) {
    if (reduce.matches) return;
    slide.animate(
      [{ transform: 'none' }, { transform: `translateX(${dir * 2.5}%)`, offset: 0.4 }, { transform: 'none' }],
      { duration: 240, easing: 'ease-out' }
    );
  }

  let down = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('.h-tabs')) return;
    down = { x: e.clientX, y: e.clientY };
  });
  card.addEventListener('pointercancel', () => { down = null; });
  card.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
      act(dx < 0 ? 'next' : 'prev');
    } else if (Math.hypot(dx, dy) < NEAR) {
      flip();
      act('flip');
    }
  });

  card.addEventListener('keydown', (e) => {
    if (e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    flip();
    act('flip');
  });

  document.addEventListener('keydown', (e) => {
    if (shown && e.key === 'Tab') {
      const stops = [card, ...card.querySelectorAll('.h-tabs button'), ...bar.querySelectorAll('button, a')].filter((n) => !n.hidden);
      const i = stops.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i < 0 || i === stops.length - 1 ? 0 : i + 1);
      stops[next].focus({ preventScroll: true });
      e.preventDefault();
      return;
    }
    if (!shown || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Escape') return;
    if (e.key === 'ArrowLeft') act('prev');
    else if (e.key === 'ArrowRight') act('next');
    else if (e.key === 'Escape') act('close');
    else return;
    e.preventDefault();
  });

  prevBtn.addEventListener('click', () => act('prev'));
  nextBtn.addEventListener('click', () => act('next'));
  closeBtn.addEventListener('click', () => act('close'));
  flipBtn.addEventListener('click', () => {
    flip();
    act('flip');
  });
  openLink.addEventListener('click', () => act('open'));

  document.addEventListener('langchange', applyLabels);
  applyLabels();

  return { el: root, fill, target, show, paste, hide, flip, step, bump, recolor, focus: () => card.focus({ preventScroll: true }), busy: () => busy, onAction: (cb) => { listener = cb; } };
}
