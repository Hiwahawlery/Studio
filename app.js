// Studio UI: tabs, toolbar, layers, properties, AI buttons, language and theme. Logic lives in engine.js and ai.js.
(() => {
  const $ = id => document.getElementById(id);
  const E = Engine, D = E.doc, stage = document.querySelector('.stage');
  let lang = 'en';
  const t = k => (I18N[lang] || I18N.en)[k] || I18N.en[k];
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  // Self-heal: if an older index.html has no tab bar, create it so the app never crashes
  let tabsBox = $('tabs');
  if (!tabsBox) { tabsBox = document.createElement('nav'); tabsBox.id = 'tabs'; tabsBox.className = 'tabs'; document.querySelector('header.top').after(tabsBox); }
  $('fileOpen').multiple = true;
  const tabName = () => E.tabs[E.tabIndex()].name.replace(/[\\/:*?"<>|]/g, '_');
  const fit = () => E.fitTo(stage.clientWidth, stage.clientHeight);

  // Page size and orientation
  Object.entries(PRESETS).forEach(([k, p]) => $('preset').add(new Option(`${p.label} · ${p.w}×${p.h}`, k)));
  function applyPage() {
    const p = PRESETS[$('preset').value] || { w: D.w, h: D.h }; // 'custom' (from an opened file) keeps its size
    const big = Math.max(p.w, p.h), small = Math.min(p.w, p.h);
    const portrait = $('orient').value === 'p';
    D.w = portrait ? small : big; D.h = portrait ? big : small;
    E.changed();
  }
  $('preset').onchange = () => { E.checkpoint(); applyPage(); };
  $('orient').onchange = () => { E.checkpoint(); applyPage(); };
  $('bg').onchange = e => { E.checkpoint(); D.bg = e.target.value; E.changed(); };
  $('transp').onchange = e => { E.checkpoint(); D.transparent = e.target.checked; E.changed(); };
  // Keep the page-size controls in sync with the active tab
  function syncPage() {
    const big = Math.max(D.w, D.h), small = Math.min(D.w, D.h);
    const k = Object.keys(PRESETS).find(k => Math.max(PRESETS[k].w, PRESETS[k].h) === big && Math.min(PRESETS[k].w, PRESETS[k].h) === small);
    const old = $('preset').querySelector('option[value=custom]'); if (old) old.remove();
    if (k) $('preset').value = k;
    else { $('preset').add(new Option(`Custom · ${D.w}×${D.h}`, 'custom')); $('preset').value = 'custom'; }
    if (D.w !== D.h) $('orient').value = D.w > D.h ? 'l' : 'p';
  }

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

  // Tabs
  let tabSig = '';
  function closeTab(i) {
    if (E.tabs[i].dirty && !confirm(t('closeConfirm'))) return;
    E.closeTab(i);
  }
  function refreshTabs() {
    const sig = E.tabs.map(x => x.id + ':' + x.name + ':' + x.dirty).join('|') + '#' + E.tabIndex();
    if (sig === tabSig) return; // only rebuild when something visible changed
    tabSig = sig;
    const box = tabsBox; box.innerHTML = '';
    E.tabs.forEach((tab, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === E.tabIndex() ? ' on' : '');
      el.title = tab.name;
      const n = document.createElement('span'); n.textContent = (tab.dirty ? '● ' : '') + tab.name;
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Close';
      x.onclick = ev => { ev.stopPropagation(); closeTab(i); };
      el.onclick = () => E.switchTo(i);
      el.ondblclick = () => { const v = prompt('Rename', tab.name); if (v && v.trim()) E.renameTab(i, v.trim()); };
      el.onauxclick = ev => { if (ev.button === 1) closeTab(i); };
      el.append(n, x); box.append(el);
    });
    const add = document.createElement('button'); add.className = 'add'; add.textContent = '+'; add.title = 'New tab';
    add.onclick = () => { E.newTab(); fit(); };
    box.append(add);
    box.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  addEventListener('beforeunload', e => { if (E.tabs.some(x => x.dirty)) { e.preventDefault(); e.returnValue = ''; } });

  // Header: undo, redo, open, save, export, templates
  $('undo').onclick = () => E.undo();
  $('redo').onclick = () => E.redo();
  $('tpl').onchange = e => { if (e.target.value) E.template(e.target.value); e.target.value = ''; };
  $('open').onclick = () => $('fileOpen').click();
  $('fileOpen').onchange = async e => {
    const files = [...e.target.files]; e.target.value = ''; // copy first: clearing the input empties the live list
    for (const f of files) {
      try {
        await E.openProject(await f.text(), f.name.replace(/(\.studio)?\.json$/i, ''));
        fit();
      } catch (err) { console.error(err); alert(`${f.name}: ${t('badFile')}`); }
    }
  };
  $('save').onclick = () => { download(new Blob([E.project()], { type: 'application/json' }), tabName() + '.studio.json'); E.markSaved(); };
  $('export').onclick = () => {
    const jpg = $('fmt').value === 'jpeg', name = tabName();
    E.exportCanvas(+$('scale').value).toBlob(b => download(b, name + (jpg ? '.jpg' : '.png')), jpg ? 'image/jpeg' : 'image/png', 0.95);
  };

  // Theme and language
  $('theme').onclick = () => {
    const d = document.documentElement;
    const now = d.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    d.dataset.theme = now === 'dark' ? 'light' : 'dark';
  };
  function setLang(l) {
    lang = I18N[l] ? l : 'en';
    const dict = I18N[lang];
    localStorage.setItem('studio_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ku' || lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = dict[el.dataset.i18n] || I18N.en[el.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = dict[el.dataset.i18nPh] || ''; });
    $('lang').value = lang;
  }
  $('lang').onchange = e => setLang(e.target.value);

  // Zoom
  $('zm').onclick = () => E.setZoom(E.zoomNow() / 1.25);
  $('zp').onclick = () => E.setZoom(E.zoomNow() * 1.25);
  $('fit').onclick = fit;

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
    refreshTabs();
    refreshLayers();
    refreshProps(E.get(E.selected()));
    $('zv').textContent = Math.round(E.zoomNow() * 100) + '%';
    $('size').textContent = `${D.w} × ${D.h} px`;
    $('bg').value = D.bg; $('transp').checked = D.transparent;
    syncPage();
  }

  // AI tools (Gemini, free key from aistudio.google.com)
  const aiMsg = m => { $('aiMsg').textContent = m; };
  async function busy(btn, job) {
    btn.disabled = true; aiMsg('Working…');
    try { await job(); aiMsg('Done.'); } catch (err) { aiMsg('Error: ' + err.message); }
    btn.disabled = false;
  }
  // The user may switch tabs while the AI works. Return to the tab that started the job before adding results.
  const back = tid => { if (!E.switchToId(tid)) throw new Error('The tab was closed before the result arrived.'); };
  const copyLayer = (s, p) => { const o = { ...s, ...p }; delete o.id; return o; };
  $('generate').onclick = e => busy(e.currentTarget, async () => {
    const p = $('prompt').value.trim();
    if (!p) throw new Error('Type a description first.');
    const tid = E.tabId();
    const src = await AI.generate(p);
    back(tid); await E.addImage(src);
  });
  $('ghibli').onclick = e => busy(e.currentTarget, async () => {
    const s = E.get(E.selected()), tid = E.tabId();
    const src = s && s.type === 'image' ? E.IMG.get(s.id).src : E.exportCanvas(1).toDataURL('image/png');
    const blob = await (await fetch(src)).blob();
    const out = await AI.edit(blob, 'Redraw this image in the style of Studio Ghibli hand-painted anime: soft colors, detailed backgrounds, same subjects and composition. Return the image only.');
    back(tid); await E.addImage(out);
  });
  $('translate').onclick = e => busy(e.currentTarget, async () => {
    const s = E.get(E.selected()), tid = E.tabId();
    if (!s || s.type !== 'text' || !s.text) throw new Error('Select a text layer first.');
    const r = await AI.translate(s.text);
    back(tid);
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
  fit();
  refreshUI();
})();
