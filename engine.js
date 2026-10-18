// Document model, geometry and drawing.
// No DOM access: everything draws into a 2D canvas context that the caller provides.

export const BLENDS = [
  "source-over", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
];

const DEG = Math.PI / 180;
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
export const isRTL = (s) => RTL_RE.test(s || "");

const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

export function makeLayer(props) {
  return {
    name: "", visible: true, locked: false, rot: 0, opacity: 1, blend: "source-over",
    fx: { brightness: 100, contrast: 100, saturate: 100, blur: 0 },
    ...props,
  };
}

// ---------------------------------------------------------------------------
// Document: layers, selection, assets and undo/redo.
// Every user action that changes the design calls snapshot() once first.
// Live changes while dragging or typing use update(), which does not record history.
// ---------------------------------------------------------------------------
export class Doc {
  constructor(w = 1080, h = 1080) {
    this.w = w;
    this.h = h;
    this.bg = "#ffffff";
    this.layers = [];          // bottom → top
    this.selection = [];       // layer ids
    this.nextId = 1;
    this.assets = new Map();   // assetId → { src, img }
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = [];
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  get(id) { return this.layers.find((l) => l.id === id); }
  selected() { return this.selection.map((id) => this.get(id)).filter(Boolean); }
  setSelection(ids) { this.selection = ids; this.emit(); }

  // ----- assets (image data lives here, layers only hold the id) -----
  newAssetId() { return "a" + Math.random().toString(36).slice(2, 10); }
  addAsset(id, src, img) { this.assets.set(id, { src, img }); }
  assetImg(id) { return this.assets.get(id)?.img; }
  assetSrc(id) { return this.assets.get(id)?.src; }

  // ----- history -----
  _state() { return JSON.stringify({ w: this.w, h: this.h, bg: this.bg, layers: this.layers }); }

  snapshot() {
    this.undoStack.push(this._state());
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
  }

  _apply(json) {
    const s = JSON.parse(json);
    this.w = s.w; this.h = s.h; this.bg = s.bg; this.layers = s.layers;
    this.selection = this.selection.filter((id) => this.get(id));
    this.emit();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this._state());
    this._apply(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this._state());
    this._apply(this.redoStack.pop());
  }

  // ----- edits -----
  add(props, { record = true } = {}) {
    if (record) this.snapshot();
    const layer = { ...makeLayer(props), id: this.nextId++ };
    this.layers.push(layer);
    if (record) { this.selection = [layer.id]; this.emit(); }
    return layer;
  }

  // Live update: no history entry, no re-render. Call snapshot() once at the start of the action.
  update(id, patch) {
    const l = this.get(id);
    if (l) Object.assign(l, patch);
  }

  remove(ids = this.selection) {
    if (!ids.length) return;
    this.snapshot();
    this.layers = this.layers.filter((l) => !ids.includes(l.id));
    this.selection = [];
    this.emit();
  }

  _clone(list) {
    const copies = list.map((l) => ({ ...structuredClone(l), id: this.nextId++, x: l.x + 24, y: l.y + 24 }));
    this.layers.push(...copies);
    this.selection = copies.map((c) => c.id);
    return copies;
  }

  duplicate(ids = this.selection) {
    const src = this.layers.filter((l) => ids.includes(l.id));
    if (!src.length) return;
    this.snapshot();
    this._clone(src);
    this.emit();
  }

  copy() { this.clipboard = this.selected().map((l) => structuredClone(l)); }

  paste() {
    if (!this.clipboard.length) return;
    this.snapshot();
    this.clipboard = this._clone(this.clipboard).map((c) => structuredClone(c));
    this.emit();
  }

  moveTo(id, index) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const j = Math.max(0, Math.min(this.layers.length - 1, index));
    if (i === j) return;
    this.snapshot();
    const [l] = this.layers.splice(i, 1);
    this.layers.splice(j, 0, l);
    this.emit();
  }

  setSize(w, h) {
    this.snapshot();
    this.w = w; this.h = h;
    this.emit();
  }

  // Replace the whole design (templates, opened projects). Undoable.
  reset({ w, h, bg, layers }) {
    this.snapshot();
    this.w = w; this.h = h; this.bg = bg;
    this.nextId = Math.max(0, ...layers.map((l) => l.id ?? 0)) + 1;
    this.layers = layers.map((l) => ({ ...makeLayer(l), id: l.id ?? this.nextId++ }));
    this.selection = [];
    this.emit();
  }
}

// ---------------------------------------------------------------------------
// Geometry. Layers are boxes (x, y, w, h) rotated around their centre (rot, degrees).
// ---------------------------------------------------------------------------

// Doc point → layer-local coordinates (relative to centre, unrotated).
export function toLocal(l, px, py) {
  const dx = px - (l.x + l.w / 2), dy = py - (l.y + l.h / 2);
  const a = -l.rot * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

// Layer-local (centre-relative) → doc point.
export function toWorld(cx, cy, rot, lx, ly) {
  const a = rot * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
}

export function corners(l) {
  const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(cx, cy, l.rot, (a * l.w) / 2, (b * l.h) / 2));
}

export function boundsOf(list) {
  if (!list.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of list) {
    for (const p of corners(l)) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function hitTest(l, px, py, pad = 0) {
  const p = toLocal(l, px, py);
  return Math.abs(p.x) <= l.w / 2 + pad && Math.abs(p.y) <= l.h / 2 + pad;
}

// Handle positions in doc coords. `pad` is how far the rotation handle sits above the box.
export function handlePositions(l, pad) {
  const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
  const out = HANDLES.map(([hx, hy]) => ({ hx, hy, ...toWorld(cx, cy, l.rot, (hx * l.w) / 2, (hy * l.h) / 2) }));
  out.push({ rot: true, ...toWorld(cx, cy, l.rot, 0, -l.h / 2 - pad) });
  return out;
}

// Resize a layer by dragging handle (hx, hy). The opposite edge stays fixed in the world.
// Returns the new { x, y, w, h }.
export function resizeFrom(orig, hx, hy, px, py, minSize = 4) {
  const lp = toLocal(orig, px, py);
  const ax = (-hx * orig.w) / 2, ay = (-hy * orig.h) / 2;   // anchor = opposite edge
  let nw = orig.w, nh = orig.h;
  if (hx) nw = Math.max(minSize, Math.abs(lp.x - ax));
  if (hy) nh = Math.max(minSize, Math.abs(lp.y - ay));

  const anchor = toWorld(orig.x + orig.w / 2, orig.y + orig.h / 2, orig.rot, ax, ay);
  const na = { x: (-hx * nw) / 2, y: (-hy * nh) / 2 };        // new anchor, relative to new centre
  const v = toWorld(0, 0, orig.rot, na.x, na.y);
  const nc = { x: anchor.x - v.x, y: anchor.y - v.y };
  return { w: nw, h: nh, x: nc.x - nw / 2, y: nc.y - nh / 2 };
}

export function rectFrom(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function overlaps(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------
export function fontString(l) {
  return `${l.italic ? "italic " : ""}${l.weight} ${l.size}px "${l.font}"`;
}

// Splits text into lines that fit maxW. The ctx must already have the font set.
export function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

// Lays out a text layer and updates its height. Returns the lines.
export function layoutText(ctx, l) {
  ctx.font = fontString(l);
  const lines = wrapLines(ctx, l.text || " ", l.w);
  l.h = lines.length * l.size * (l.lineHeight || 1.25);
  return lines;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
export function drawLayers(ctx, doc) {
  ctx.fillStyle = doc.bg;
  ctx.fillRect(0, 0, doc.w, doc.h);
  for (const l of doc.layers) if (l.visible) drawLayer(ctx, doc, l);
}

function drawLayer(ctx, doc, l) {
  if (l.type === "text") layoutText(ctx, l); // sizes the box first so we can centre it

  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.globalCompositeOperation = l.blend;
  ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
  ctx.rotate(l.rot * DEG);

  switch (l.type) {
    case "image": {
      const img = doc.assetImg(l.asset);
      const f = l.fx;
      ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) blur(${f.blur}px)`;
      if (img && img.complete) ctx.drawImage(img, -l.w / 2, -l.h / 2, l.w, l.h);
      break;
    }
    case "rect":
      ctx.beginPath();
      ctx.roundRect(-l.w / 2, -l.h / 2, l.w, l.h, l.radius || 0);
      fillAndStroke(ctx, l);
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(0, 0, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
      fillAndStroke(ctx, l);
      break;
    case "text":
      drawText(ctx, l);
      break;
    case "path":
      drawPath(ctx, l);
      break;
  }
  ctx.restore();
}

function fillAndStroke(ctx, l) {
  if (l.fill && l.fill !== "transparent") {
    ctx.fillStyle = l.fill;
    ctx.fill();
  }
  if (l.strokeWidth > 0) {
    ctx.lineWidth = l.strokeWidth;
    ctx.strokeStyle = l.strokeColor || "#000000";
    ctx.stroke();
  }
}

function drawText(ctx, l) {
  const lines = layoutText(ctx, l);
  const rtl = isRTL(l.text);
  const lh = l.size * (l.lineHeight || 1.25);

  ctx.font = fontString(l);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textBaseline = "top";

  // Start/end follow the text direction, so Arabic and Kurdish align correctly.
  const anchorRight = (l.align === "start" && rtl) || (l.align === "end" && !rtl);
  ctx.textAlign = l.align === "center" ? "center" : anchorRight ? "right" : "left";
  const ax = l.align === "center" ? 0 : anchorRight ? l.w / 2 : -l.w / 2;
  const top = -l.h / 2;

  ctx.fillStyle = l.color;
  ctx.strokeStyle = l.strokeColor || "#000000";
  ctx.lineWidth = l.strokeWidth || 0;
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const y = top + i * lh;
    if (l.strokeWidth > 0) ctx.strokeText(line, ax, y);
    ctx.fillText(line, ax, y);
  });
}

function drawPath(ctx, l) {
  const p = l.points || [];
  if (!p.length) return;
  const ox = -l.w / 2, oy = -l.h / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = l.size;
  ctx.strokeStyle = l.color;
  ctx.fillStyle = l.color;

  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0].x + ox, p[0].y + oy, l.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Smooth curve through the midpoints of the sampled points.
  ctx.beginPath();
  ctx.moveTo(p[0].x + ox, p[0].y + oy);
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2 + ox, my = (p[i].y + p[i + 1].y) / 2 + oy;
    ctx.quadraticCurveTo(p[i].x + ox, p[i].y + oy, mx, my);
  }
  const last = p[p.length - 1];
  ctx.lineTo(last.x + ox, last.y + oy);
  ctx.stroke();
}

// Selection outline, handles and smart guides. Draw in doc coordinates; `zoom` keeps lines thin.
export function drawOverlay(ctx, doc, zoom, { guideX = null, guideY = null, handles = true } = {}) {
  const k = 1 / zoom;
  const sel = doc.selected();
  ctx.save();
  ctx.lineWidth = k;

  if (guideX != null || guideY != null) {
    ctx.strokeStyle = "#ff4fd8";
    ctx.setLineDash([6 * k, 4 * k]);
    if (guideX != null) { ctx.beginPath(); ctx.moveTo(guideX, -1e5); ctx.lineTo(guideX, 1e5); ctx.stroke(); }
    if (guideY != null) { ctx.beginPath(); ctx.moveTo(-1e5, guideY); ctx.lineTo(1e5, guideY); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  if (sel.length) {
    ctx.strokeStyle = "#7c5cff";
    for (const l of sel) {
      const c = corners(l);
      ctx.beginPath();
      c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
    }

    if (sel.length === 1 && handles && sel[0].type !== "path") {
      const l = sel[0];
      let hp = handlePositions(l, 28 * k);
      if (l.type === "text") hp = hp.filter((p) => p.rot || p.hy === 0); // text only resizes by width
      const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
      const topMid = toWorld(cx, cy, l.rot, 0, -l.h / 2);
      const rotH = hp.find((p) => p.rot);

      ctx.beginPath();
      ctx.moveTo(topMid.x, topMid.y);
      ctx.lineTo(rotH.x, rotH.y);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      for (const p of hp) {
        ctx.beginPath();
        if (p.rot) ctx.arc(p.x, p.y, 5 * k, 0, Math.PI * 2);
        else ctx.rect(p.x - 4 * k, p.y - 4 * k, 8 * k, 8 * k);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
