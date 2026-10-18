import {
  Doc, makeLayer, layoutText, fontString, BLENDS, drawLayers, drawOverlay, hitTest,
  handlePositions, resizeFrom, boundsOf, rectFrom, overlaps,
} from "./engine.js";
import * as AI from "./ai.js";
import { T, LANGS } from "./i18n.js";
import { FONT_GROUPS, loadFont } from "./fonts.js";
import { PAGE_GROUPS, ALL_PAGES, DPI, findPage, pagePixels, mmToPx, pxToMm } from "./presets.js";

const $ = (s) => document.querySelector(s);

// Never fail silently: unexpected errors show up as a message on screen.
function reportError(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = "Error: " + msg;
  el.classList.add("show");
  clearTimeout(reportError.timer);
  reportError.timer = setTimeout(() => el.classList.remove("show"), 6000);
  console.error(msg);
}
window.addEventListener("error", (e) => reportError(e.message));
window.addEventListener("unhandledrejection", (e) => reportError(e.reason?.message || String(e.reason)));

const stage = $("#stage");
const ctx = stage.getContext("2d");
const doc = new Doc(1080, 1080);
const view = { zoom: 1, ox: 0, oy: 0 };

let tool = "select";
let spaceDown = false;
let drag = null;           // current pointer interaction
let guides = {};          // snap guides shown while moving
let lang = localStorage.getItem("studio_lang") || "ku";   // Kurdish by default
let theme = localStorage.getItem("studio_theme") || "dark";
let orient = localStorage.getItem("studio_orient") || "portrait";
const t = (k) => T[lang]?.[k] || T.en[k] || k;

// ---------- presets ----------
const FILTERS = {
  none: { brightness: 100, contrast: 100, saturate: 100, blur: 0 },
  vintage: { brightness: 106, contrast: 88, saturate: 70, blur: 0 },
  warm: { brightness: 104, contrast: 106, saturate: 125, blur: 0 },
  cool: { brightness: 100, contrast: 104, saturate: 82, blur: 0 },
  mono: { brightness: 102, contrast: 112, saturate: 0, blur: 0 },
};

const GHIBLI_PROMPT =
  "Redraw this image in the hand-painted style of a Studio Ghibli-inspired animated film: " +
  "soft watercolour skies, lush detailed greenery, warm natural light, gentle linework. " +
  "Keep the same subject and composition.";

const TEMPLATES = {
  post: {
    w: 1080, h: 1080, bg: "#0b0b12", layers: [
      { type: "rect", x: 60, y: 60, w: 960, h: 960, fill: "#1d1b3a", radius: 48, name: "Card" },
      { type: "text", x: 120, y: 380, w: 840, text: "Big headline", font: "Vazirmatn", weight: 900, size: 110, color: "#ffffff", align: "center", name: "Headline" },
      { type: "text", x: 120, y: 640, w: 840, text: "Supporting line", font: "Inter", weight: 400, size: 44, color: "#c7c7e0", align: "center", name: "Subline" },
    ],
  },
  poster: {
    w: 1200, h: 1600, bg: "#f5efe6", layers: [
      { type: "ellipse", x: 200, y: 200, w: 800, h: 800, fill: "#ff6b3d", name: "Sun" },
      { type: "text", x: 120, y: 1100, w: 960, text: "Hello — سڵاو — مرحبا", font: "Noto Sans Arabic", weight: 900, size: 96, color: "#111111", align: "center", name: "Title" },
    ],
  },
  story: {
    w: 1080, h: 1920, bg: "#101820", layers: [
      { type: "text", x: 90, y: 760, w: 900, text: "Your story starts here", font: "Vazirmatn", weight: 900, size: 120, color: "#ffffff", align: "center", name: "Title" },
    ],
  },
  ku: {
    w: 1080, h: 1080, bg: "#fff6e6", layers: [
      { type: "rect", x: 80, y: 80, w: 920, h: 920, fill: "#9e1f1f", radius: 40, name: "Frame" },
      { type: "text", x: 120, y: 380, w: 840, text: "بەخێربێن", font: "Vazirmatn", weight: 900, size: 150, color: "#f7e7bd", align: "center", name: "Greeting" },
      { type: "text", x: 120, y: 640, w: 840, text: "Welcome · مرحبا", font: "Inter", weight: 600, size: 52, color: "#f3d27a", align: "center", name: "Subline" },
    ],
  },
  cn: {
    w: 1080, h: 1440, bg: "#fff8ef", layers: [
      { type: "text", x: 90, y: 330, w: 900, text: "春天的故事", font: "ZCOOL XiaoWei", weight: 400, size: 170, color: "#9e1f1f", align: "center", name: "Title" },
      { type: "text", x: 90, y: 700, w: 900, text: "A spring story", font: "Noto Serif SC", weight: 400, size: 56, color: "#6b1212", align: "center", name: "Subline" },
    ],
  },
};

// ---------- theme ----------
function applyTheme(name) {
  theme = name;
  document.documentElement.dataset.theme = name;
  localStorage.setItem("studio_theme", name);
  $("#themeBtn").textContent = name === "dark" ? "☀" : "☾";
  $("#themeBtn").title = name === "dark" ? t("light") : t("dark");
  redraw();
}

// ---------- stage sizing and view ----------
function resizeStage() {
  const r = stage.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  stage.width = Math.round(r.width * dpr);
  stage.height = Math.round(r.height * dpr);
  stage.style.width = r.width + "px";
  stage.style.height = r.height + "px";
  redraw();
}

function fitView() {
  const w = stage.clientWidth, h = stage.clientHeight, m = 70;
  view.zoom = Math.min((w - m * 2) / doc.w, (h - m * 2) / doc.h);
  view.ox = (w - doc.w * view.zoom) / 2;
  view.oy = (h - doc.h * view.zoom) / 2;
  redraw();
}

function zoomAt(sx, sy, factor) {
  const before = { x: (sx - view.ox) / view.zoom, y: (sy - view.oy) / view.zoom };
  view.zoom = Math.min(8, Math.max(0.05, view.zoom * factor));
  view.ox = sx - before.x * view.zoom;
  view.oy = sy - before.y * view.zoom;
  redraw();
}

// ---------- drawing ----------
let checkerPat = null;
function checker() {
  if (checkerPat) return checkerPat;
  const c = document.createElement("canvas");
  c.width = c.height = 24;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, 24, 24);
  x.fillStyle = "#e6e6ee"; x.fillRect(0, 0, 12, 12); x.fillRect(12, 12, 12, 12);
  checkerPat = ctx.createPattern(c, "repeat");
  return checkerPat;
}

function redraw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);

  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.zoom, view.zoom);

  // Artboard shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, doc.w, doc.h);
  ctx.restore();

  // Artboard contents, clipped to the artboard
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, doc.w, doc.h);
  ctx.clip();
  ctx.fillStyle = checker();
  ctx.fillRect(0, 0, doc.w, doc.h);
  drawLayers(ctx, doc);
  ctx.restore();

  drawOverlay(ctx, doc, view.zoom, {
    guideX: guides.gx ?? null,
    guideY: guides.gy ?? null,
    handles: tool === "select",
  });

  if (drag?.mode === "draw" && drag.points.length) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = drag.size;
    ctx.strokeStyle = drag.erase ? "rgba(255,80,80,.6)" : drag.color;
    ctx.beginPath();
    drag.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }
  if (drag?.mode === "marquee") {
    const r = rectFrom(drag.start, drag.cur);
    ctx.save();
    ctx.fillStyle = "rgba(124,92,255,.12)";
    ctx.strokeStyle = "#7c5cff";
    ctx.lineWidth = 1 / view.zoom;
    ctx.setLineDash([5 / view.zoom, 4 / view.zoom]);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  ctx.restore();
  updateStatus();
}

function updateStatus() {
  $("#zoomPct").textContent = Math.round(view.zoom * 100) + "%";
  const mw = pxToMm(doc.w), mh = pxToMm(doc.h);
  $("#docInfo").textContent = `${doc.w} × ${doc.h}px · ${mw} × ${mh} mm @ ${DPI} dpi`;
}

// ---------- pointer ----------
function pointerInfo(e) {
  const r = stage.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  return { sx, sy, x: (sx - view.ox) / view.zoom, y: (sy - view.oy) / view.zoom };
}

function handleAt(l, p) {
  let hp = handlePositions(l, 28 / view.zoom);
  if (l.type === "text") hp = hp.filter((h) => h.rot || h.hy === 0);
  const tol = 9 / view.zoom;
  return hp.find((h) => Math.hypot(p.x - h.x, p.y - h.y) <= tol) || null;
}

function topLayerAt(p) {
  return [...doc.layers].reverse().find((l) => l.visible && !l.locked && hitTest(l, p.x, p.y, 2 / view.zoom));
}

function setTool(name) {
  tool = name;
  document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === name));
  stage.style.cursor = name === "hand" ? "grab" : name === "select" ? "default" : "crosshair";
  redraw();
}

stage.addEventListener("pointerdown", (e) => {
  const p = pointerInfo(e);
  const mode = spaceDown || tool === "hand" ? "pan" : tool;
  stage.setPointerCapture(e.pointerId);

  if (mode === "pan") {
    drag = { mode: "pan", sx: p.sx, sy: p.sy, ox: view.ox, oy: view.oy };
    return;
  }
  if (mode === "brush" || mode === "eraser") {
    drag = {
      mode: "draw", erase: mode === "eraser", color: $("#brushColor").value,
      size: +$("#brushSize").value, points: [{ x: p.x, y: p.y }],
    };
    redraw();
    return;
  }
  if (mode === "text") {
    doc.add({
      type: "text", x: p.x, y: p.y, w: Math.round(doc.w * 0.5), text: "Your text",
      font: "Vazirmatn", weight: 700, size: Math.round(doc.w / 16), color: "#111111",
      align: "start", name: t("tool_text"),
    });
    setTool("select");
    return;
  }
  if (mode === "rect" || mode === "ellipse") {
    const l = doc.add({
      type: mode, x: p.x, y: p.y, w: 1, h: 1, fill: "#7c5cff", radius: 24,
      name: mode === "rect" ? t("tool_rect") : t("tool_ellipse"),
    });
    drag = { mode: "create", id: l.id, sx: p.x, sy: p.y };
    return;
  }

  // ----- select tool -----
  const sel = doc.selected();
  if (sel.length === 1 && sel[0].type !== "path") {
    const hit = handleAt(sel[0], p);
    if (hit) {
      doc.snapshot();
      const l = sel[0];
      if (hit.rot) {
        drag = { mode: "rotate", id: l.id, cx: l.x + l.w / 2, cy: l.y + l.h / 2, changed: false, snap: true };
      } else {
        drag = { mode: "resize", id: l.id, hx: hit.hx, hy: l.type === "text" ? 0 : hit.hy, orig: { ...l }, changed: false, snap: true };
      }
      return;
    }
  }

  const under = topLayerAt(p);
  if (under) {
    if (e.shiftKey) {
      if (doc.selection.includes(under.id)) {
        doc.setSelection(doc.selection.filter((id) => id !== under.id));
        return;
      }
      doc.setSelection([...doc.selection, under.id]);
    } else if (!doc.selection.includes(under.id)) {
      doc.setSelection([under.id]);
    }
    const items = doc.selected().filter((l) => !l.locked).map((l) => ({ id: l.id, x: l.x, y: l.y }));
    doc.snapshot();
    drag = { mode: "move", start: { x: p.x, y: p.y }, items, changed: false, snap: true };
    return;
  }

  if (!e.shiftKey) doc.setSelection([]);
  drag = { mode: "marquee", start: { x: p.x, y: p.y }, cur: { x: p.x, y: p.y }, additive: e.shiftKey };
  redraw();
});

stage.addEventListener("pointermove", (e) => {
  const p = pointerInfo(e);
  $("#coords").textContent = `x ${Math.round(p.x)}  y ${Math.round(p.y)}`;
  if (!drag) return;

  switch (drag.mode) {
    case "pan":
      view.ox = drag.ox + (p.sx - drag.sx);
      view.oy = drag.oy + (p.sy - drag.sy);
      redraw();
      return;

    case "draw":
      drag.points.push({ x: p.x, y: p.y });
      redraw();
      return;

    case "marquee":
      drag.cur = { x: p.x, y: p.y };
      redraw();
      return;

    case "create": {
      const l = doc.get(drag.id);
      l.x = Math.min(drag.sx, p.x);
      l.y = Math.min(drag.sy, p.y);
      l.w = Math.max(1, Math.abs(p.x - drag.sx));
      l.h = Math.max(1, Math.abs(p.y - drag.sy));
      redraw();
      return;
    }

    case "move": {
      let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      const moved = drag.items.map((it) => ({ ...doc.get(it.id), x: it.x + dx, y: it.y + dy }));
      const snap = snapDelta(boundsOf(moved), 6 / view.zoom);
      dx += snap.dx; dy += snap.dy;
      guides = { gx: snap.gx, gy: snap.gy };
      for (const it of drag.items) doc.update(it.id, { x: it.x + dx, y: it.y + dy });
      if (dx || dy) drag.changed = true;
      redraw();
      return;
    }

    case "resize": {
      const r = resizeFrom(drag.orig, drag.hx, drag.hy, p.x, p.y);
      doc.update(drag.id, { x: r.x, y: r.y, w: r.w, h: r.h });
      drag.changed = true;
      redraw();
      return;
    }

    case "rotate": {
      let a = (Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      doc.update(drag.id, { rot: ((a % 360) + 360) % 360 });
      drag.changed = true;
      redraw();
      return;
    }
  }
});

stage.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  guides = {};

  if (d.mode === "draw" && d.points.length) finalizeStroke(d);

  if (d.mode === "marquee") {
    const r = rectFrom(d.start, d.cur);
    const hits = doc.layers
      .filter((l) => l.visible && !l.locked && overlaps(boundsOf([l]), r))
      .map((l) => l.id);
    doc.setSelection(d.additive ? [...new Set([...doc.selection, ...hits])] : hits);
  }

  if (d.mode === "create") setTool("select");

  // A click without a change should not leave an empty undo step.
  if (d.snap && !d.changed) doc.undoStack.pop();

  doc.emit();
});

stage.addEventListener("dblclick", (e) => {
  const l = topLayerAt(pointerInfo(e));
  if (l?.type === "text") {
    doc.setSelection([l.id]);
    $("#props textarea")?.focus();
  }
});

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const p = pointerInfo(e);
  if (e.ctrlKey || e.metaKey) {
    zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * 0.0015));
  } else {
    view.ox -= e.deltaX;
    view.oy -= e.deltaY;
    redraw();
  }
}, { passive: false });

// Offset needed to align a box with the artboard's edges and centre.
function snapDelta(b, thr) {
  let dx = 0, dy = 0, gx = null, gy = null;
  const tx = [0, doc.w / 2, doc.w], ty = [0, doc.h / 2, doc.h];
  for (const p of [b.x, b.x + b.w / 2, b.x + b.w]) {
    for (const v of tx) if (gx === null && Math.abs(p - v) < thr) { dx = v - p; gx = v; }
  }
  for (const p of [b.y, b.y + b.h / 2, b.y + b.h]) {
    for (const v of ty) if (gy === null && Math.abs(p - v) < thr) { dy = v - p; gy = v; }
  }
  return { dx, dy, gx, gy };
}

function finalizeStroke(d) {
  const pad = d.size / 2 + 2;
  const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
  const minX = xs.reduce((a, b) => Math.min(a, b)), maxX = xs.reduce((a, b) => Math.max(a, b));
  const minY = ys.reduce((a, b) => Math.min(a, b)), maxY = ys.reduce((a, b) => Math.max(a, b));
  const x = minX - pad, y = minY - pad;
  doc.add({
    type: "path", name: d.erase ? t("tool_eraser") : t("tool_brush"),
    color: d.color, size: d.size, x, y,
    w: maxX - minX + pad * 2, h: maxY - minY + pad * 2,
    points: d.points.map((p) => ({ x: p.x - x, y: p.y - y })),
    blend: d.erase ? "destination-out" : "source-over",
  });
}

// ---------- keyboard ----------
const TOOL_KEYS = { v: "select", t: "text", r: "rect", o: "ellipse", b: "brush", e: "eraser", h: "hand" };

window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (e.key === " ") { spaceDown = true; e.preventDefault(); return; }

  if (mod) {
    e.preventDefault();
    if (k === "z") (e.shiftKey ? doc.redo() : doc.undo());
    else if (k === "y") doc.redo();
    else if (k === "d") doc.duplicate();
    else if (k === "c") doc.copy();
    else if (k === "v") doc.paste();
    else if (k === "a") doc.setSelection(doc.layers.filter((l) => !l.locked).map((l) => l.id));
    else if (k === "s") saveProject();
    return;
  }
  if (TOOL_KEYS[k] && !e.altKey) { setTool(TOOL_KEYS[k]); return; }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); doc.remove(); return; }
  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    if (!doc.selection.length) return;
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    doc.snapshot();
    for (const l of doc.selected()) doc.update(l.id, { x: l.x + dx, y: l.y + dy });
    doc.emit();
    return;
  }
  if (k === "[" || k === "]") {
    const l = doc.selected()[0];
    if (l) doc.moveTo(l.id, doc.layers.indexOf(l) + (k === "]" ? 1 : -1));
  }
});

window.addEventListener("keyup", (e) => { if (e.key === " ") spaceDown = false; });

// Paste an image from the clipboard, or drop image files onto the canvas.
window.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) insertImageFile(item.getAsFile());
});
stage.addEventListener("dragover", (e) => e.preventDefault());
stage.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
  if (f) insertImageFile(f);
});

// ---------- layers panel ----------
const ICON = { image: "🖼", rect: "▭", ellipse: "◯", text: "T", path: "✎" };
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderLayers() {
  const list = $("#layerList");
  list.innerHTML = "";
  for (const l of [...doc.layers].reverse()) {
    const row = document.createElement("div");
    row.className = "layer" + (doc.selection.includes(l.id) ? " sel" : "");
    row.draggable = true;
    row.innerHTML = `
      <span class="ico">${ICON[l.type] || "•"}</span>
      <span class="nm">${esc(l.name || l.type)}</span>
      <button class="mini" data-a="vis" title="Visibility">${l.visible ? "◉" : "○"}</button>
      <button class="mini" data-a="lock" title="Lock">${l.locked ? "🔒" : "🔓"}</button>`;

    row.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "vis" || a === "lock") {
        doc.snapshot();
        doc.update(l.id, a === "vis" ? { visible: !l.visible } : { locked: !l.locked });
        doc.emit();
        return;
      }
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const ids = !additive
        ? [l.id]
        : doc.selection.includes(l.id)
          ? doc.selection.filter((i) => i !== l.id)
          : [...doc.selection, l.id];
      doc.setSelection(ids);
    });
    row.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", String(l.id)));
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      doc.moveTo(+e.dataTransfer.getData("text/plain"), doc.layers.indexOf(l));
    });
    list.appendChild(row);
  }
}

// ---------- properties panel ----------
function fontOptions(current) {
  return FONT_GROUPS.map((g) =>
    `<optgroup label="${g.label}">${g.fonts.map((f) => `<option ${f === current ? "selected" : ""}>${f}</option>`).join("")}</optgroup>`
  ).join("");
}

function renderProps() {
  const box = $("#props");
  const sel = doc.selected();
  if (!sel.length) {
    box.innerHTML = `<p class="muted">${t("empty")}</p>`;
    return;
  }
  if (sel.length > 1) {
    box.innerHTML = `
      <p class="muted">${sel.length} ${t("multi_selected")}</p>
      <div class="btnrow">
        <button data-act="ch">${t("center_h")}</button>
        <button data-act="cv">${t("center_v")}</button>
      </div>`;
    bindActs(box);
    return;
  }

  const l = sel[0];
  const num = (k, label, extra = "") =>
    `<label>${t(label)}<input type="number" data-k="${k}" value="${Number(l[k] ?? 0).toFixed(k === "opacity" ? 2 : 0)}" ${extra}></label>`;
  const color = (k, label) => `<label>${t(label)}<input type="color" data-k="${k}" value="${l[k] || "#000000"}"></label>`;
  const select = (k, label, opts) =>
    `<label>${t(label)}<select data-k="${k}">${opts.map((o) => `<option value="${o.v}" ${o.v === l[k] ? "selected" : ""}>${o.t}</option>`).join("")}</select></label>`;
  const range = (f, label, min, max) =>
    `<label>${t(label)}<input type="range" data-fx="${f}" min="${min}" max="${max}" value="${l.fx[f]}"></label>`;

  let h = `<div class="grid2">`;
  h += num("x", "x") + num("y", "y");
  h += num("w", "width");
  if (l.type !== "text") h += num("h", "height");
  h += num("rot", "rotation", 'step="1"') + num("opacity", "opacity", 'step="0.05" min="0" max="1"');
  h += `</div>`;

  if (l.type === "text") {
    h += `<label>${t("text")}<textarea data-k="text" rows="4">${esc(l.text)}</textarea></label>`;
    h += `<label>${t("font")}<select data-k="font">${fontOptions(l.font)}</select></label>`;
    h += `<div class="grid2">${num("size", "size")}${num("weight", "weight", 'step="100" min="100" max="900"')}</div>`;
    h += `<div class="grid2">${color("color", "color")}${select("align", "align", [
      { v: "start", t: t("start") }, { v: "center", t: t("center") }, { v: "end", t: t("end") },
    ])}</div>`;
    h += `<div class="grid2">${num("strokeWidth", "stroke_w")}${color("strokeColor", "stroke_c")}</div>`;
    h += `<div class="btnrow">
      <button data-act="fit">${t("fit_width")}</button>
      <button data-act="tr">${t("translate")}</button>
    </div>`;
  } else if (l.type === "image") {
    h += `<label>${t("filters")}<select data-film>${[
      { v: "none", t: t("film_none") }, { v: "vintage", t: t("film_vintage") },
      { v: "warm", t: t("film_warm") }, { v: "cool", t: t("film_cool") }, { v: "mono", t: t("film_mono") },
    ].map((o) => `<option value="${o.v}">${o.t}</option>`).join("")}</select></label>`;
    h += range("brightness", "brightness", 0, 200) + range("contrast", "contrast", 0, 200);
    h += range("saturate", "saturate", 0, 300) + range("blur", "blur", 0, 20);
    h += `<div class="btnrow"><button data-act="rm">${t("remove_bg")}</button><button data-act="ghibli">${t("ghibli")}</button></div>`;
  } else if (l.type === "rect" || l.type === "ellipse") {
    h += color("fill", "fill");
    if (l.type === "rect") h += num("radius", "radius");
    h += `<div class="grid2">${num("strokeWidth", "stroke_w")}${color("strokeColor", "stroke_c")}</div>`;
  } else if (l.type === "path") {
    h += color("color", "color") + num("size", "size");
  }

  h += select("blend", "blend", BLENDS.map((b) => ({ v: b, t: b })));
  h += `<div class="btnrow">
    <button data-act="ch">${t("center_h")}</button>
    <button data-act="cv">${t("center_v")}</button>
  </div>`;

  box.innerHTML = h;

  box.querySelectorAll("[data-k]").forEach((el) => {
    el.addEventListener("focus", () => doc.snapshot());
    el.addEventListener("input", () => {
      const raw = el.type === "number" || el.type === "range" ? parseFloat(el.value) : el.value;
      if (typeof raw === "number" && Number.isNaN(raw)) return;
      doc.update(l.id, { [el.dataset.k]: raw });
      redraw();
    });
    if (el.tagName === "SELECT" || el.type === "color") el.addEventListener("change", () => doc.emit());
  });
  box.querySelectorAll("[data-fx]").forEach((el) => {
    el.addEventListener("focus", () => doc.snapshot());
    el.addEventListener("input", () => {
      l.fx[el.dataset.fx] = parseFloat(el.value);
      redraw();
    });
  });
  box.querySelectorAll("[data-film]").forEach((el) => {
    el.addEventListener("change", () => {
      doc.snapshot();
      doc.update(l.id, { fx: { ...FILTERS[el.value] } });
      doc.emit();
    });
  });
  bindActs(box);
}

function bindActs(root) {
  root.querySelectorAll("[data-act]").forEach((b) => {
    b.addEventListener("click", () => runAct(b.dataset.act));
  });
}

function runAct(a) {
  const sel = doc.selected();
  if (!sel.length) return;
  if (a === "ch" || a === "cv") {
    doc.snapshot();
    for (const l of sel) doc.update(l.id, a === "ch" ? { x: (doc.w - l.w) / 2 } : { y: (doc.h - l.h) / 2 });
    doc.emit();
  } else if (a === "rm") removeBackgroundSelected();
  else if (a === "tr") translateSelected();
  else if (a === "fit") fitTextWidth();
  else if (a === "ghibli") ghibliSelected();
}

// Sets a text layer's box width to its longest line, so the box hugs the words.
function fitTextWidth() {
  const sel = doc.selected().filter((l) => l.type === "text");
  if (!sel.length) return;
  doc.snapshot();
  for (const l of sel) {
    ctx.font = fontString(l);
    const widest = Math.max(...(l.text || " ").split("\n").map((line) => ctx.measureText(line).width));
    doc.update(l.id, { w: Math.ceil(widest) + 4 });
  }
  doc.emit();
}

// ---------- images ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function insertImageSrc(src, name) {
  const img = await loadImage(src);
  const id = doc.newAssetId();
  doc.addAsset(id, src, img);
  const scale = Math.min(1, (doc.w * 0.8) / img.naturalWidth, (doc.h * 0.8) / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  doc.add({ type: "image", asset: id, x: (doc.w - w) / 2, y: (doc.h - h) / 2, w, h, name: name || "Image" });
}

async function insertImageFile(file) {
  if (!file) return;
  try {
    await insertImageSrc(await blobToDataURL(file), file.name);
  } catch (err) {
    toast(`${t("error")}: ${err.message}`, 5000);
  }
}

// ---------- AI actions ----------
// The Gemini API key from the settings. Stored only in this browser.
function apiKey() {
  const k = $("#apiKey").value.trim();
  if (!k) throw new Error(t("need_key"));
  return k;
}

async function removeBackgroundSelected() {
  const l = doc.selected().find((x) => x.type === "image");
  if (!l) return toast(t("need_image"));
  toast(t("working") + " (first run downloads the AI model)", 60000);
  try {
    const blob = await (await fetch(doc.assetSrc(l.asset))).blob();
    const out = await AI.removeBackground(blob);
    const src = await blobToDataURL(out);
    const img = await loadImage(src);
    const id = doc.newAssetId();
    doc.addAsset(id, src, img);
    doc.snapshot();
    doc.update(l.id, { asset: id, name: (l.name || "Image") + " · no bg" });
    doc.emit();
    toast(t("done"));
  } catch (err) {
    toast(`${t("error")}: ${err.message}`, 6000);
  }
}

async function ghibliSelected() {
  const l = doc.selected().find((x) => x.type === "image");
  if (!l) return toast(t("need_image"));
  toast(t("working"), 90000);
  try {
    const blob = await (await fetch(doc.assetSrc(l.asset))).blob();
    const src = await AI.styleTransfer(blob, GHIBLI_PROMPT, apiKey());
    await insertImageSrc(src, "Ghibli style");
    toast(t("ghibli_done"));
  } catch (err) {
    toast(`${t("error")}: ${err.message}`, 6000);
  }
}

async function generateImageAction() {
  const prompt = window.prompt(t("prompt"));
  if (!prompt) return;
  toast(t("working"), 60000);
  try {
    const src = await AI.generateImage(prompt, apiKey());
    await insertImageSrc(src, "AI image");
    toast(t("done"));
  } catch (err) {
    toast(`${t("error")}: ${err.message}`, 6000);
  }
}

async function translateSelected() {
  const l = doc.selected().find((x) => x.type === "text");
  if (!l) return toast(t("need_text"));
  toast(t("working"), 30000);
  try {
    const { ku, ar } = await AI.translate(l.text, apiKey());
    doc.snapshot();
    const gap = Math.round(l.size * 0.5);
    const base = { type: "text", x: l.x, w: l.w, size: l.size, weight: l.weight, color: l.color, font: "Vazirmatn", align: "center", name: "" };

    const heightOf = (text) => {
      const tmp = makeLayer({ ...base, text });
      layoutText(ctx, tmp);
      return tmp.h;
    };

    let y = l.y + l.h + gap;
    doc.add({ ...base, text: ku, y, name: "Kurdish" }, { record: false });
    y += heightOf(ku) + gap;
    doc.add({ ...base, text: ar, y, name: "Arabic" }, { record: false });
    doc.emit();
    toast(t("done"));
  } catch (err) {
    toast(`${t("error")}: ${err.message}`, 6000);
  }
}

// ---------- pages ----------
function buildPageSelect() {
  $("#pageSelect").innerHTML =
    PAGE_GROUPS.map((g) =>
      `<optgroup label="${g.label}">${g.items.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</optgroup>`
    ).join("") + `<option value="custom">${t("custom_mm")}</option>`;
}

// Keeps the page dropdown in step with the artboard's real size.
function syncPageSelect() {
  const match = ALL_PAGES.find((p) => {
    const [w, h] = pagePixels(p);
    return (w === doc.w && h === doc.h) || (w === doc.h && h === doc.w);
  });
  const sel = $("#pageSelect");
  const want = match ? match.id : "custom";
  if (sel.value !== want) sel.value = want;
  $("#customBox").hidden = want !== "custom";
  $("#orient").value = orient;
}

function applyPage(id) {
  const p = findPage(id);
  if (!p) return;
  let [w, h] = pagePixels(p);
  if (p.mm && w !== h) {
    const wantLandscape = orient === "landscape";
    if (wantLandscape !== w > h) [w, h] = [h, w];
  }
  doc.setSize(w, h);
  fitView();
}

// ---------- templates, background ----------
function applyTemplate(name) {
  const tpl = TEMPLATES[name];
  if (!tpl) return;
  doc.reset({ w: tpl.w, h: tpl.h, bg: tpl.bg, layers: tpl.layers });   // one undo step
  fitView();
}

// ---------- export and project files ----------
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportImage() {
  const fmt = $("#expFmt").value;
  const scale = +$("#expScale").value;
  const c = document.createElement("canvas");
  c.width = Math.round(doc.w * scale);
  c.height = Math.round(doc.h * scale);
  const x = c.getContext("2d");
  if (fmt === "jpg") { x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height); }
  x.setTransform(scale, 0, 0, scale, 0, 0);
  drawLayers(x, doc);
  const name = ($("#docName").value || "design").trim();
  c.toBlob((blob) => download(blob, `${name}.${fmt}`), fmt === "jpg" ? "image/jpeg" : "image/png", 0.95);
}

function saveProject() {
  const used = new Set(doc.layers.filter((l) => l.asset).map((l) => l.asset));
  const assets = {};
  for (const id of used) assets[id] = doc.assetSrc(id);
  const data = { app: "studio", version: 4, w: doc.w, h: doc.h, bg: doc.bg, layers: doc.layers, assets };
  const name = ($("#docName").value || "design").trim();
  download(new Blob([JSON.stringify(data)], { type: "application/json" }), `${name}.studio.json`);
}

async function openProject(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== "studio") throw new Error("not a Studio project");
  for (const [id, src] of Object.entries(data.assets || {})) {
    doc.addAsset(id, src, await loadImage(src));
  }
  doc.reset({ w: data.w, h: data.h, bg: data.bg, layers: data.layers });
  $("#docName").value = file.name.replace(/\.studio\.json$/i, "").replace(/\.json$/i, "");
  fitView();
}

// ---------- fonts ----------
// Loads every font a text layer uses; redraws once each one is ready.
function ensureFonts() {
  const fonts = new Set(doc.layers.filter((l) => l.type === "text").map((l) => l.font));
  for (const f of fonts) loadFont(f).then(redraw);
}

// ---------- toast ----------
function toast(msg, ms = 2800) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), ms);
}

// ---------- language ----------
function applyLang(code) {
  lang = LANGS[code] ? code : "en";
  localStorage.setItem("studio_lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS[lang].dir;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("#lang").value = lang;
  buildPageSelect();
  applyTheme(theme);
  doc.emit();
}

// ---------- wiring ----------
function wire() {
  document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));

  $("#addImage").onclick = () => $("#fileInput").click();
  $("#fileInput").onchange = (e) => { insertImageFile(e.target.files[0]); e.target.value = ""; };

  $("#undoBtn").onclick = () => doc.undo();
  $("#redoBtn").onclick = () => doc.redo();
  $("#zUp").onclick = () => { const l = doc.selected()[0]; if (l) doc.moveTo(l.id, doc.layers.indexOf(l) + 1); };
  $("#zDown").onclick = () => { const l = doc.selected()[0]; if (l) doc.moveTo(l.id, doc.layers.indexOf(l) - 1); };
  $("#dupBtn").onclick = () => doc.duplicate();
  $("#delBtn").onclick = () => doc.remove();

  $("#templates").onchange = (e) => { applyTemplate(e.target.value); e.target.value = ""; };

  $("#pageSelect").onchange = (e) => {
    if (e.target.value === "custom") {
      $("#customBox").hidden = false;
      return;
    }
    $("#customBox").hidden = true;
    applyPage(e.target.value);
  };
  $("#orient").onchange = (e) => {
    orient = e.target.value;
    localStorage.setItem("studio_orient", orient);
    const id = $("#pageSelect").value;
    if (id !== "custom") applyPage(id);
  };
  $("#customApply").onclick = () => {
    const w = mmToPx(+$("#customW").value || 210), h = mmToPx(+$("#customH").value || 297);
    doc.setSize(w, h);
    fitView();
  };

  $("#bgColor").addEventListener("focus", () => doc.snapshot());
  $("#bgColor").addEventListener("input", (e) => {
    doc.bg = e.target.value;
    $("#bgTransparent").checked = false;
    redraw();
  });
  $("#bgTransparent").addEventListener("change", (e) => {
    doc.snapshot();
    doc.bg = e.target.checked ? "transparent" : $("#bgColor").value;
    doc.emit();
  });

  $("#zoomIn").onclick = () => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.25);
  $("#zoomOut").onclick = () => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 0.8);
  $("#fitBtn").onclick = fitView;

  $("#exportBtn").onclick = exportImage;
  $("#saveBtn").onclick = saveProject;
  $("#openBtn").onclick = () => $("#openFile").click();
  $("#openFile").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { await openProject(f); toast(t("done")); } catch (err) { toast(`${t("error")}: ${err.message}`, 5000); }
  };

  $("#themeBtn").onclick = () => applyTheme(theme === "dark" ? "light" : "dark");

  $("#aiRemoveBg").onclick = removeBackgroundSelected;
  $("#aiGhibli").onclick = ghibliSelected;
  $("#aiGenerate").onclick = generateImageAction;
  $("#aiTranslate").onclick = translateSelected;

  // The Gemini key is saved in this browser. Keys from older versions are removed.
  localStorage.removeItem("studio_openai_key");
  localStorage.removeItem("studio_key_openai");
  localStorage.removeItem("studio_provider");
  $("#apiKey").value = localStorage.getItem("studio_key_gemini") || "";
  $("#apiKey").addEventListener("input", (e) => localStorage.setItem("studio_key_gemini", e.target.value.trim()));

  $("#lang").addEventListener("change", (e) => applyLang(e.target.value));
}

// ---------- start ----------
doc.onChange(() => {
  syncPageSelect();
  ensureFonts();
  redraw();
  renderLayers();
  renderProps();
});
wire();
buildPageSelect();
resizeStage();
applyTemplate("post");
doc.undoStack = [];
applyLang(lang);
setTool("select");
fitView();
window.addEventListener("resize", resizeStage);
