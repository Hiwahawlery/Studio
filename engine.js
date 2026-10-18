// Studio engine: document model, layers, drawing, undo/redo, export. No DOM controls here.
const Engine = (() => {
  const doc = { w: 1080, h: 1080, bg: '#ffffff', transparent: false, layers: [] };
  const IMG = new Map(); // layer id -> <img>. Images stay out of undo snapshots.
  const canvas = document.getElementById('c');
  const g = canvas.getContext('2d');
  const meas = document.createElement('canvas').getContext('2d');
  const listeners = [];
  let seq = 1, zoom = 0.5, selId = null, past = [], future = [], drag = null;

  const snap = () => JSON.stringify({ w: doc.w, h: doc.h, bg: doc.bg, transparent: doc.transparent, layers: doc.layers });
  const get = id => doc.layers.find(l => l.id === id) || null;
  const fontOf = L => `${L.italic ? 'italic ' : ''}${L.weight || 400} ${L.size}px ${FONTS.stack(L.font || 'Inter')}`;
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

  function changed() { render(); listeners.forEach(f => f()); }
  function checkpoint() { past.push(snap()); if (past.length > 200) past.shift(); future = []; }
  function restore(s) { Object.assign(doc, JSON.parse(s)); if (!get(selId)) selId = null; changed(); }
  const undo = () => { if (past.length) { future.push(snap()); restore(past.pop()); } };
  const redo = () => { if (future.length) { past.push(snap()); restore(future.pop()); } };

  // Wrap text to the box width. Words wrap at spaces; long runs (Chinese has no spaces) break by character.
  function lines(L) {
    meas.font = fontOf(L);
    const out = [], W = L.w;
    const fit = t => {
      const o = []; let s = t;
      while (s.length > 1 && meas.measureText(s).width > W) {
        let k = s.length - 1;
        while (k > 1 && meas.measureText(s.slice(0, k)).width > W) k--;
        o.push(s.slice(0, k)); s = s.slice(k);
      }
      o.push(s); return o;
    };
    for (const para of String(L.text || '').split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (!cur || meas.measureText(t).width <= W) { cur = t; continue; }
        out.push(...fit(cur)); cur = word;
      }
      out.push(...fit(cur));
    }
    return out;
  }
  const boxH = L => (L.type === 'text' ? lines(L).length * L.size * 1.25 : L.h);

  function drawText(c, L) {
    FONTS.ensure(L.font || 'Inter', L.weight || 400, changed);
    const ls = lines(L), lh = L.size * 1.25;
    c.font = fontOf(L); c.fillStyle = L.fill; c.textBaseline = 'top';
    ls.forEach((t, i) => {
      // Each line gets its own direction, so Kurdish/Arabic run right-to-left and English/numbers/Chinese left-to-right.
      const rtl = L.dir !== 'ltr' && /[\u0590-\u08FF]/.test(t);
      c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = 'left';
      const tw = c.measureText(t).width, a = L.align || (rtl ? 'right' : 'left');
      const x = a === 'center' ? L.x + (L.w - tw) / 2 : a === 'right' ? L.x + L.w - tw : L.x;
      c.fillText(t, x, L.y + i * lh);
    });
  }
  function drawLayer(c, L) {
    c.save(); c.globalAlpha = L.opacity ?? 1;
    if (L.type === 'rect') { c.fillStyle = L.fill; c.beginPath(); c.roundRect(L.x, L.y, L.w, L.h, L.r || 0); c.fill(); }
    else if (L.type === 'ellipse') { c.fillStyle = L.fill; c.beginPath(); c.ellipse(L.x + L.w / 2, L.y + L.h / 2, L.w / 2, L.h / 2, 0, 0, Math.PI * 2); c.fill(); }
    else if (L.type === 'image') { const im = IMG.get(L.id); if (im) c.drawImage(im, L.x, L.y, L.w, L.h); }
    else drawText(c, L);
    c.restore();
  }
  function render() {
    const z = zoom * (window.devicePixelRatio || 1);
    canvas.width = Math.round(doc.w * z); canvas.height = Math.round(doc.h * z);
    canvas.style.width = doc.w * zoom + 'px'; canvas.style.height = doc.h * zoom + 'px';
    g.setTransform(z, 0, 0, z, 0, 0); g.clearRect(0, 0, doc.w, doc.h);
    if (!doc.transparent) { g.fillStyle = doc.bg; g.fillRect(0, 0, doc.w, doc.h); }
    for (const L of doc.layers) if (L.visible !== false) drawLayer(g, L);
    const S = get(selId);
    if (S) { g.save(); g.setLineDash([6 / zoom, 4 / zoom]); g.lineWidth = 2 / zoom; g.strokeStyle = '#7c5cff'; g.strokeRect(S.x, S.y, S.w, boxH(S)); g.restore(); }
  }

  function hit(x, y) {
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const L = doc.layers[i];
      if (L.visible !== false && x >= L.x && x <= L.x + L.w && y >= L.y && y <= L.y + boxH(L)) return L;
    }
    return null;
  }
  function add(type, p = {}) {
    checkpoint();
    const text = type === 'text';
    const L = { id: 'L' + seq++, type, visible: true, x: doc.w * 0.2, y: doc.h * 0.3, w: doc.w * 0.6, h: doc.h * 0.2, fill: text ? '#1c2230' : '#7c5cff',
      ...(text ? { text: 'Text', size: Math.round(doc.h * 0.06), weight: 700, font: 'Inter', align: 'left' } : {}), ...p };
    doc.layers.push(L); selId = L.id; changed(); return L;
  }
  function remove(id) { checkpoint(); doc.layers = doc.layers.filter(l => l.id !== id); if (selId === id) selId = null; changed(); }
  function move(id, dir) { // +1 moves a layer toward the top of the stack
    const i = doc.layers.findIndex(l => l.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= doc.layers.length) return;
    checkpoint(); [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]]; changed();
  }
  function duplicate(id) {
    const L = get(id); if (!L) return;
    checkpoint();
    const C = { ...L, id: 'L' + seq++, x: L.x + 40, y: L.y + 40 };
    if (IMG.has(L.id)) IMG.set(C.id, IMG.get(L.id));
    doc.layers.splice(doc.layers.indexOf(L) + 1, 0, C); selId = C.id; changed();
  }
  function update(id, p) { const L = get(id); if (!L) return; checkpoint(); Object.assign(L, p); changed(); }
  async function addImage(src) {
    const im = await loadImg(src);
    const k = Math.min(1, doc.w * 0.7 / im.naturalWidth, doc.h * 0.7 / im.naturalHeight);
    const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const L = add('image', { x: (doc.w - w) / 2, y: (doc.h - h) / 2, w, h });
    IMG.set(L.id, im); changed(); return L;
  }
  function template(name) {
    const T = TEMPLATES[name]; if (!T) return;
    checkpoint();
    const r = Math.min(doc.w, doc.h);
    for (const t of T) {
      const L = { id: 'L' + seq++, type: t.type, visible: true, x: t.x * doc.w, y: t.y * doc.h, w: t.w * doc.w, h: (t.h || 0) * doc.h, fill: t.fill, r: (t.r || 0) * r };
      if (t.type === 'text') Object.assign(L, { text: t.text, size: Math.round(t.size * doc.h), weight: t.weight, font: t.font, align: t.align });
      doc.layers.push(L);
    }
    changed();
  }

  const toDoc = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]; };
  canvas.addEventListener('pointerdown', e => {
    const [x, y] = toDoc(e), L = hit(x, y);
    selId = L ? L.id : null;
    drag = L ? { id: L.id, dx: x - L.x, dy: y - L.y, before: snap(), moved: false } : null;
    canvas.setPointerCapture(e.pointerId); changed();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const [x, y] = toDoc(e), L = get(drag.id);
    if (!drag.moved) { past.push(drag.before); if (past.length > 200) past.shift(); future = []; drag.moved = true; }
    L.x = Math.round(x - drag.dx); L.y = Math.round(y - drag.dy); changed();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function exportCanvas(scale) {
    const c = document.createElement('canvas');
    c.width = Math.round(doc.w * scale); c.height = Math.round(doc.h * scale);
    const x = c.getContext('2d'); x.scale(scale, scale);
    if (!doc.transparent) { x.fillStyle = doc.bg; x.fillRect(0, 0, doc.w, doc.h); }
    for (const L of doc.layers) if (L.visible !== false) drawLayer(x, L);
    return c;
  }
  const project = () => JSON.stringify({ app: 'studio', v: 1, w: doc.w, h: doc.h, bg: doc.bg, transparent: doc.transparent, layers: doc.layers, images: Object.fromEntries([...IMG].map(([k, im]) => [k, im.src])) });
  function load(text) {
    const o = JSON.parse(text);
    IMG.clear(); past = []; future = []; selId = null;
    Object.assign(doc, { w: o.w, h: o.h, bg: o.bg, transparent: !!o.transparent, layers: o.layers || [] });
    return Promise.all(Object.entries(o.images || {}).map(([id, src]) => loadImg(src).then(im => IMG.set(id, im)))).then(() => changed());
  }

  const setZoom = z => { zoom = Math.min(3, Math.max(0.1, z)); changed(); };
  const fitTo = (sw, sh) => setZoom(Math.min((sw - 60) / doc.w, (sh - 60) / doc.h));
  const select = id => { selId = id; changed(); };
  const onChange = f => listeners.push(f);

  changed();
  return { doc, canvas, IMG, get, add, addImage, remove, move, duplicate, update, undo, redo, template, select, setZoom, fitTo, onChange, changed, checkpoint, toDoc, boxH, exportCanvas, project, load, selected: () => selId, zoomNow: () => zoom };
})();
