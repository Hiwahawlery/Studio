// Studio UI: toolbar, layers, properties, AI buttons, language and theme. Logic lives in engine.js and ai.js.
(() => {
  const $ = id => document.getElementById(id);
  const E = Engine, D = E.doc, stage = document.querySelector('.stage');
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  // Page size and orientation
  Object.entries(PRESETS).forEach(([k, p]) => $('preset').add(new Option(`${p.label} · ${p.w}×${p.h}`, k)));
  function applyPage() {
    const p = PRESETS[$('preset').value], big = Math.max(p.w, p.h), small = Math.min(p.w, p.h);
    const portrait = $('orient').value === 'p';
    D.w = portrait ? small : big; D.h = portrait ? big : small;
    E.changed();
  }
  $('preset').onchange = () => { E.checkpoint(); applyPage(); };
  $('orient').onchange = () => { E.checkpoint(); applyPage(); };
  $('bg').onchange = e => { E.checkpoint(); D.bg = e.target.value; E.changed(); };
  $('transp').onchange = e => { E.checkpoint(); D.transparent = e.target.checked; E.changed(); };

  // Tools: Text, Rectangle, Ellipse add a layer; Add image opens the file picker
  const ADD = {
    text: () => E.add('text', { x: D.w * 0.1, y: D.h * 0.4, w: D.w * 0.8 }),
    rect: () => E.add('rect', { x: D.w * 0.25, y: D.h * 0.3, w: D.w * 0.5, h: D.h * 0.3, r: 0 }),
    ellipse: () => E.add('ellipse', { x: D.w * 0.3, y: D.h * 0.3, w: D.w * 0.4, h: D.h * 0.4 }),
    image: () => $('fileImg').click()
  };
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => ADD[b.dataset.tool]?.());
  $('fileImg').onchange = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const r = new FileReader(); r.onload = () => E.addImage(r.result); r.readAsDataURL(f);
  };

  // Header: undo, redo, open, save, export, templates
  $('undo').onclick = () => E.undo();
  $('redo').onclick = () => E.redo();
  $('tpl').onchange = e => { if (e.target.value) E.template(e.target.value); e.target.value = ''; };
  $('open').onclick = () => $('fileOpen').click();
  $('fileOpen').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await E.load(await f.text()); };
  $('save').onclick = () => download(new Blob([E.project()], { type: 'application/json' }), 'design.studio.json');
  $('export').onclick = () => {
    const jpg = $('fmt').value === 'jpeg';
    E.exportCanvas(+$('scale').value).toBlob(b => download(b, 'design.' + (jpg ? 'jpg' : 'png')), jpg ? 'image/jpeg' : 'image/png', 0.95);
  };

  // Theme and language
  $('theme').onclick = () => {
    const d = document.documentElement;
    const now = d.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    d.dataset.theme = now === 'dark' ? 'light' : 'dark';
  };
  function setLang(l) {
    const dict = I18N[l] || I18N.en;
    localStorage.setItem('studio_lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ku' || l === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = dict[el.dataset.i18n] || I18N.en[el.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = dict[el.dataset.i18nPh] || ''; });
    $('lang').value = l;
  }
  $('lang').onchange = e => setLang(e.target.value);

  // Zoom
  $('zm').onclick = () => E.setZoom(E.zoomNow() / 1.25);
  $('zp').onclick = () => E.setZoom(E.zoomNow() * 1.25);
  $('fit').onclick = () => E.fitTo(stage.clientWidth, stage.clientHeight);

  // Layer buttons act on the selected layer
  $('up').onclick = () => { const s = E.selected(); if (s) E.move(s, 1); };
  $('down').onclick = () => { const s = E.selected(); if (s) E.move(s, -1); };
  $('dup').onclick = () => { const s = E.selected(); if (s) E.duplicate(s); };
  $('del').onclick = () => { const s = E.selected(); if (s) E.remove(s); };

  function refreshLayers() {
    const box = $('layers'), sel = E.selected();
    box.innerHTML = '';
    [...E.doc.layers].reverse().forEach(L => {
      const row = document.createElement('div');
      row.className = 'lay' + (L.id === sel ? ' on' : '');
      const eye = document.createElement('input');
      eye.type = 'checkbox'; eye.checked = L.visible !== false; eye.title = 'Show / hide';
      eye.onchange = () => E.update(L.id, { visible: eye.checked });
      const name = document.createElement('span');
      name.textContent = L.type === 'text' ? (L.text || 'Text').slice(0, 24) : L.type;
      row.append(eye, name);
      row.onclick = e => { if (e.target !== eye) E.select(L.id); };
      box.append(row);
    });
  }

  function refreshProps(L) {
    const box = $('props');
    box.innerHTML = '';
    if (!L) { box.innerHTML = '<p class="muted">Select a layer to edit it.</p>'; return; }
    const field = (label, el) => { const w = document.createElement('label'); w.append(label, el); box.append(w); };
    const num = (v, fn) => { const el = document.createElement('input'); el.type = 'number'; el.value = Math.round(v || 0); el.onchange = () => fn(+el.value || 0); return el; };
    const sel = (opts, v, fn) => { const el = document.createElement('select'); opts.forEach(([val, t]) => el.add(new Option(t, val))); el.value = v; el.onchange = () => fn(el.value); return el; };
    const col = (v, fn) => { const el = document.createElement('input'); el.type = 'color'; el.value = v; el.onchange = () => fn(el.value); return el; };
    const set = p => E.update(L.id, p);
    field('X', num(L.x, v => set({ x: v })));
    field('Y', num(L.y, v => set({ y: v })));
    if (L.type === 'text') {
      const ta = document.createElement('textarea'); ta.rows = 3; ta.value = L.text; ta.onchange = () => set({ text: ta.value });
      field('Text', ta);
      field('Font', sel(FONTS.list.map(n => [n, n]), L.font, v => set({ font: v })));
      field('Size', num(L.size, v => set({ size: v })));
      field('Weight', sel([[400, 'Regular'], [700, 'Bold']], L.weight, v => set({ weight: +v })));
      field('Align', sel([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], L.align || 'left', v => set({ align: v })));
      field('Width', num(L.w, v => set({ w: v })));
      field('Color', col(L.fill, v => set({ fill: v })));
    }
    if (L.type === 'rect' || L.type === 'ellipse') {
      field('Width', num(L.w, v => set({ w: v })));
      field('Height', num(L.h, v => set({ h: v })));
      if (L.type === 'rect') field('Radius', num(L.r, v => set({ r: v })));
      field('Color', col(L.fill, v => set({ fill: v })));
    }
    if (L.type === 'image') {
      const ratio = L.h / L.w;
      field('Width', num(L.w, v => set({ w: v, h: Math.round(v * ratio) })));
    }
  }

  function refreshUI() {
    refreshLayers();
    refreshProps(E.get(E.selected()));
    $('zv').textContent = Math.round(E.zoomNow() * 100) + '%';
    $('size').textContent = `${D.w} × ${D.h} px`;
    $('bg').value = D.bg; $('transp').checked = D.transparent;
  }

  // AI tools (Gemini, free key from aistudio.google.com)
  const aiMsg = t => { $('aiMsg').textContent = t; };
  async function busy(btn, job) {
    btn.disabled = true; aiMsg('Working…');
    try { await job(); aiMsg('Done.'); } catch (err) { aiMsg('Error: ' + err.message); }
    btn.disabled = false;
  }
  const copyLayer = (s, p) => { const o = { ...s, ...p }; delete o.id; return o; };
  $('generate').onclick = e => busy(e.currentTarget, async () => {
    const p = $('prompt').value.trim();
    if (!p) throw new Error('Type a description first.');
    await E.addImage(await AI.generate(p));
  });
  $('ghibli').onclick = e => busy(e.currentTarget, async () => {
    const s = E.get(E.selected());
    const src = s && s.type === 'image' ? E.IMG.get(s.id).src : E.exportCanvas(1).toDataURL('image/png');
    const blob = await (await fetch(src)).blob();
    await E.addImage(await AI.edit(blob, 'Redraw this image in the style of Studio Ghibli hand-painted anime: soft colors, detailed backgrounds, same subjects and composition. Return the image only.'));
  });
  $('translate').onclick = e => busy(e.currentTarget, async () => {
    const s = E.get(E.selected());
    if (!s || s.type !== 'text' || !s.text) throw new Error('Select a text layer first.');
    const r = await AI.translate(s.text);
    const a = E.add('text', copyLayer(s, { text: r.ku, font: 'Noto Sans Arabic', align: 'right', y: s.y + E.boxH(s) + 20 }));
    E.add('text', copyLayer(s, { text: r.ar, font: 'Noto Sans Arabic', align: 'right', y: a.y + E.boxH(a) + 20 }));
  });
  $('key').value = AI.key();
  $('key').onchange = e => AI.setKey(e.target.value);

  // Keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Delete
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), s = E.selected();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? E.redo() : E.undo(); }
    else if (mod && k === 'y') { e.preventDefault(); E.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && s) { e.preventDefault(); E.remove(s); }
  });
  E.canvas.addEventListener('pointermove', e => { const [x, y] = E.toDoc(e); $('pos').textContent = `x ${Math.round(x)} · y ${Math.round(y)}`; });

  // Start
  E.onChange(refreshUI);
  $('preset').value = 'instagram';
  applyPage();
  setLang(localStorage.getItem('studio_lang') || 'en');
  E.fitTo(stage.clientWidth, stage.clientHeight);
  refreshUI();
})();
