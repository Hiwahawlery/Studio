// Gemini calls. Get a free key at aistudio.google.com. The key is stored only in this browser (localStorage).
const AI = (() => {
  // Models are tried in order. If one is retired, unavailable to new users, or out of quota, the next is used.
  // If every listed model fails, the app asks Google which models this key can use and tries those.
  const TEXT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image'];
  const KEY = 'studio_gemini_key';
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/';
  const key = () => localStorage.getItem(KEY) || '';
  const setKey = k => localStorage.setItem(KEY, k.trim());
  const toBase64 = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); });
  const worked = {}; // last model that worked, per kind: tried first next time
  const gone = /no longer available|not found|not supported|deprecated|shut down|not available|no longer supported/i;

  // Ask Google which models this key can call, newest first.
  async function discover(wantImage) {
    const r = await fetch(`${BASE}models?pageSize=200&key=${encodeURIComponent(key())}`);
    const j = await r.json().catch(() => ({}));
    const bad = /live|tts|audio|embed|robotics|veo|lyria|computer|deep-research|cyber/i;
    return (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => n.startsWith('gemini') && !bad.test(n) && (wantImage ? /image/.test(n) : !/image/.test(n) && /flash/.test(n)))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }

  async function tryModels(models, parts, wantImage, tried) {
    let last = '';
    for (const m of models) {
      if (tried.has(m)) continue;
      tried.add(m);
      const r = await fetch(`${BASE}models/${m}:generateContent?key=${encodeURIComponent(key())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: wantImage ? { responseModalities: ['TEXT', 'IMAGE'] } : {} })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { worked[wantImage ? 'img' : 'txt'] = m; return { parts: j.candidates?.[0]?.content?.parts || [] }; }
      const msg = j.error?.message || `Gemini request failed (${r.status})`;
      last = `${m}: ${msg}`;
      // Wrong key or bad request: another model will not help.
      if (!(r.status === 404 || r.status === 429 || gone.test(msg))) return { error: msg };
    }
    return { error: last };
  }

  async function call(models, parts, wantImage) {
    if (!key()) throw new Error('Paste your free Gemini API key first.');
    const kind = wantImage ? 'img' : 'txt', tried = new Set();
    const order = worked[kind] ? [worked[kind], ...models] : models;
    let res = await tryModels(order, parts, wantImage, tried);
    if (res.parts) return res.parts;
    // Listed models all failed: use whatever this key can actually call.
    try { res = await tryModels(await discover(wantImage), parts, wantImage, tried) || res; } catch { /* keep first error */ }
    if (res.parts) return res.parts;
    throw new Error(res.error || 'Gemini request failed');
  }
  function toImage(parts) {
    const p = parts.find(x => x.inlineData);
    if (!p) throw new Error('No image came back. Try a clearer description.');
    return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
  }

  return {
    build: 5, key, setKey,
    generate: prompt => call(IMAGE_MODELS, [{ text: prompt }], true).then(toImage),
    edit: (blob, prompt) => toBase64(blob).then(data =>
      call(IMAGE_MODELS, [{ text: prompt }, { inlineData: { mimeType: blob.type || 'image/png', data } }], true)).then(toImage),
    translate: async text => {
      const parts = await call(TEXT_MODELS, [{ text: 'Translate the text below. Reply with ONLY JSON like {"ku":"...","ar":"..."}. "ku" = Kurdish (Sorani) written in Arabic script. "ar" = Modern Standard Arabic.\n\n' + text }], false);
      const m = parts.map(p => p.text || '').join('').match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Translation failed. Try again.');
      return JSON.parse(m[0]);
    }
  };
})();
