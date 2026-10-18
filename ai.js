// Gemini calls. Get a free key at aistudio.google.com. The key is stored only in this browser (localStorage).
const AI = (() => {
  // Model names are tried in order; the next one is used only when a model does not exist (404).
  const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
  const KEY = 'studio_gemini_key';
  const key = () => localStorage.getItem(KEY) || '';
  const setKey = k => localStorage.setItem(KEY, k.trim());
  const toBase64 = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); });

  async function call(models, parts, wantImage) {
    if (!key()) throw new Error('Paste your free Gemini API key first.');
    let last = 'Gemini request failed';
    for (const m of models) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: wantImage ? { responseModalities: ['TEXT', 'IMAGE'] } : {} })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j.candidates?.[0]?.content?.parts || [];
      last = j.error?.message || last;
      if (r.status !== 404) break;
    }
    throw new Error(last);
  }
  function toImage(parts) {
    const p = parts.find(x => x.inlineData);
    if (!p) throw new Error('No image came back. Try a clearer description.');
    return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
  }

  return {
    key, setKey,
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
