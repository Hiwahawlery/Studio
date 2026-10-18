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
  document.querySelectorAll('nav.tabs').forEach((n, i) => { if (i) n.remove(); }); // never more than one tab bar
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

  const SVG = p => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = {
    eye: SVG('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: SVG('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    lock: SVG('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    unlock: SVG('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>')
  };
  function refreshLayers() {
    const box = $('layers'), sel = E.selected();
    box.innerHTML = '';
    [...E.doc.layers].reverse().forEach(L => {
      const shown = L.visible !== false, locked = !!L.locked;
      const row = document.createElement('div');
      row.className = 'lay' + (L.id === sel ? ' on' : '') + (shown ? '' : ' off') + (locked ? ' lk' : '');
      const mk = (cls, html, title, fn) => { const b = document.createElement('button'); b.className = 'ic ' + cls; b.innerHTML = html; b.title = title; b.onclick = fn; return b; };
      const eye = mk(shown ? '' : 'act', shown ? ICON.eye : ICON.eyeOff, shown ? 'Hide (Alt+click: show only this layer)' : 'Show', ev => {
        if (ev.altKey) { const only = E.doc.layers.every(x => x.id === L.id || x.visible === false); E.bulk(x => { x.visible = only ? true : x.id === L.id; }); }
        else E.update(L.id, { visible: !shown });
      });
      const lock = mk(locked ? 'act' : '', locked ? ICON.lock : ICON.unlock, locked ? 'Unlock' : 'Lock (Alt+click: lock all others)', ev => {
        if (ev.altKey) E.bulk(x => { x.locked = x.id !== L.id; });
        else E.update(L.id, { locked: !locked });
      });
      const name = document.createElement('span');
      name.textContent = L.type === 'text' ? (L.text || 'Text').slice(0, 24) : L.type;
      row.append(eye, lock, name);
      row.onclick = e => { if (!e.target.closest('button')) E.select(L.id); };
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
    if (L.locked) {
      box.querySelectorAll('input,select,textarea').forEach(el => { el.disabled = true; });
      const n = document.createElement('p'); n.className = 'muted'; n.textContent = t('lockedNote'); box.prepend(n);
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
    const S = E.get(E.selected());
    ['up', 'down', 'dup', 'del'].forEach(id => { $(id).disabled = !S || !!S.locked; });
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

  // ---- Shortcuts (Illustrator style). Letters use physical keys (e.code) so they also work on Kurdish/Arabic/Chinese layouts.
  // Keys: "+" joins keys of one shortcut, "|" separates alternatives.
  const HELP = [
    ['Tools', [['T', 'Add text'], ['M', 'Add rectangle'], ['L', 'Add ellipse'], ['Ctrl+Shift+P', 'Place image'], ['Space+drag', 'Pan (hand tool)'], ['Esc', 'Deselect']]],
    ['Edit', [['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z|Ctrl+Y', 'Redo'], ['Ctrl+C|Ctrl+X', 'Copy / Cut'], ['Ctrl+V', 'Paste'], ['Ctrl+Shift+V', 'Paste in place'], ['Ctrl+F', 'Paste in front'], ['Ctrl+B', 'Paste in back'], ['Ctrl+D', 'Duplicate'], ['Delete', 'Delete layer']]],
    ['Move', [['Arrows', 'Nudge 1 px'], ['Shift+Arrows', 'Nudge 10 px'], ['Shift+drag', 'Keep to one axis'], ['Alt+drag', 'Drag a copy']]],
    ['Arrange', [['Ctrl+]', 'Bring forward'], ['Ctrl+[', 'Send backward'], ['Ctrl+Shift+]', 'Bring to front'], ['Ctrl+Shift+[', 'Send to back']]],
    ['Lock & hide', [['Ctrl+2|Ctrl+Shift+L', 'Lock selected layer'], ['Ctrl+Alt+2|Ctrl+Alt+Shift+L', 'Unlock all'], ['Ctrl+3|Ctrl+Shift+H', 'Hide selected layer'], ['Ctrl+Alt+3|Ctrl+Alt+Shift+H', 'Show all'], ['Alt+click', 'On the eye: show only this layer'], ['Alt+click', 'On the lock: lock all other layers']]],
    ['View & file', [['Ctrl+0', 'Fit on screen'], ['Ctrl+1|Alt+1', 'Actual size (100%)'], ['Ctrl+=|Ctrl+-', 'Zoom in / out'], ['Ctrl+wheel|Alt+wheel', 'Zoom'], ['Ctrl+S', 'Save project'], ['Ctrl+O', 'Open project'], ['Ctrl+Shift+E', 'Export'], ['?|F1', 'This list']]]
  ];
  let helpEl = null;
  function toggleHelp(force) {
    const open = force !== undefined ? force : !helpEl;
    if (!open) { if (helpEl) { helpEl.remove(); helpEl = null; } return; }
    if (helpEl) return;
    helpEl = document.createElement('div'); helpEl.className = 'modal';
    const card = document.createElement('div'); card.className = 'card';
    const h = document.createElement('h2'); h.textContent = t('shortcuts') + '  ·  Ctrl = ⌘ on Mac';
    const cols = document.createElement('div'); cols.className = 'cols';
    HELP.forEach(([title, rows]) => {
      const sec = document.createElement('div'), h4 = document.createElement('h4'), kv = document.createElement('div');
      h4.textContent = title; kv.className = 'kv';
      rows.forEach(([k, d]) => {
        const keys = document.createElement('span');
        k.split('|').forEach((alt, i) => {
          if (i) keys.append(' or ');
          alt.split('+').forEach((part, j) => { if (j) keys.append('+'); const kb = document.createElement('kbd'); kb.textContent = part; keys.append(kb); });
        });
        const desc = document.createElement('span'); desc.textContent = d; kv.append(keys, desc);
      });
      if (title === 'Lock & hide') sec.style.gridColumn = '1 / -1';
      sec.append(h4, kv); cols.append(sec);
    });
    card.append(h, cols); helpEl.append(card); document.body.append(helpEl);
    helpEl.onclick = e => { if (e.target === helpEl) toggleHelp(false); };
  }
  if ($('help')) $('help').onclick = () => toggleHelp();

  // Hand tool: hold Space and drag to pan
  let pan = null;
  const setHand = v => { E.setHand(v); stage.classList.toggle('hand', v); if (!v) { pan = null; stage.classList.remove('grabbing'); } };
  stage.addEventListener('pointerdown', e => {
    if (!E.isHand()) return;
    pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing'); e.preventDefault();
  });
  stage.addEventListener('pointermove', e => { if (pan) { stage.scrollLeft = pan.l - (e.clientX - pan.x); stage.scrollTop = pan.t - (e.clientY - pan.y); } });
  stage.addEventListener('pointerup', () => { pan = null; stage.classList.remove('grabbing'); });
  addEventListener('keyup', e => { if (e.key === ' ') setHand(false); });
  addEventListener('blur', () => setHand(false));
  stage.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.altKey || e.metaKey)) return;
    e.preventDefault(); E.setZoom(E.zoomNow() * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    const c = e.code, mod = e.ctrlKey || e.metaKey, sh = e.shiftKey, alt = e.altKey, s = E.selected(), stop = () => e.preventDefault();
    if (e.key === ' ') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); stop(); setHand(true); return; }
    if (e.key === '?' || c === 'F1') { stop(); toggleHelp(); return; }
    if (c === 'Escape') { if (helpEl) toggleHelp(false); else E.select(null); return; }
    if (helpEl) return;
    if (mod) {
      const lock = c === 'Digit2' || (c === 'KeyL' && sh), hide = c === 'Digit3' || (c === 'KeyH' && sh);
      if (lock) { stop(); if (alt) E.bulk(L => { L.locked = false; }); else if (s) E.update(s, { locked: true }); }
      else if (hide) { stop(); if (alt) E.bulk(L => { L.visible = true; }); else if (s) E.update(s, { visible: false }); }
      else if (c === 'KeyZ') { stop(); sh ? E.redo() : E.undo(); }
      else if (c === 'KeyY') { stop(); E.redo(); }
      else if (c === 'KeyC') { if (s) { stop(); E.copy(s); } }
      else if (c === 'KeyX') { if (s) { stop(); E.cut(s); } }
      else if (c === 'KeyV') { stop(); E.paste(sh ? 'place' : 'offset'); }
      else if (c === 'KeyF') { stop(); E.paste('front'); }
      else if (c === 'KeyB') { stop(); E.paste('back'); }
      else if (c === 'KeyD') { if (s) { stop(); E.duplicate(s); } }
      else if (c === 'BracketRight') { if (s) { stop(); E.arrange(s, sh ? 'front' : 'forward'); } }
      else if (c === 'BracketLeft') { if (s) { stop(); E.arrange(s, sh ? 'back' : 'backward'); } }
      else if (c === 'KeyS') { stop(); $('save').click(); }
      else if (c === 'KeyO') { stop(); $('open').click(); }
      else if (c === 'KeyE' && sh) { stop(); $('export').click(); }
      else if (c === 'KeyP' && sh) { stop(); ADD.image(); }
      else if (c === 'Digit0') { stop(); fit(); }
      else if (c === 'Digit1') { stop(); E.setZoom(1); }
      else if (c === 'Equal' || c === 'NumpadAdd') { stop(); E.setZoom(E.zoomNow() * 1.25); }
      else if (c === 'Minus' || c === 'NumpadSubtract') { stop(); E.setZoom(E.zoomNow() / 1.25); }
      return;
    }
    if (alt && c === 'Digit1') { stop(); E.setZoom(1); return; }
    if (c.startsWith('Arrow') && s) {
      stop(); const n = sh ? 10 : 1;
      E.nudge(s, c === 'ArrowLeft' ? -n : c === 'ArrowRight' ? n : 0, c === 'ArrowUp' ? -n : c === 'ArrowDown' ? n : 0); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && s) { stop(); E.remove(s); return; }
    if (!alt && !sh) {
      if (c === 'KeyT') { stop(); ADD.text(); }
      else if (c === 'KeyM') { stop(); ADD.rect(); }
      else if (c === 'KeyL') { stop(); ADD.ellipse(); }
    }
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
