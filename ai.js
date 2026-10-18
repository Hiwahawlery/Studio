// AI features. Two providers, chosen in the settings:
//   "openai": images (gpt-image-1) and translation (gpt-4o-mini)
//   "gemini": images and translation (Gemini 2.5 Flash and Gemini 2.5 Flash Image)
// Calls go straight from the browser to the provider, using the user's own key.
// Keys are kept only in this browser and are never written into project files.

const OPENAI = "https://api.openai.com/v1";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

const TRANSLATE_SYSTEM =
  'Translate the user text for a graphic design. Return JSON with keys "ku" (Central Kurdish / Sorani, Arabic script, using Kurdish letters ڕ ڵ ۆ ێ ە where needed) and "ar" (Modern Standard Arabic). Keep it short and natural for posters and social media.';

// Removes the background locally in the browser (open-source model, no upload, no key).
// Returns a PNG Blob with transparency. The first run downloads the model.
export async function removeBackground(blob) {
  const { removeBackground: remove } = await import(
    "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm"
  );
  return remove(blob);
}

// ----- shared helpers -----
async function postJSON(url, headers, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Gemini: one endpoint for text and images. The key goes in a header, not the URL,
// so it doesn't end up in logs or history.
function gemini(model, parts, generationConfig, key) {
  return postJSON(
    `${GEMINI}/models/${model}:generateContent`,
    { "x-goog-api-key": key },
    { contents: [{ parts }], generationConfig }
  );
}

function geminiImage(j) {
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const d = part?.inlineData || part?.inline_data;
  if (!d) throw new Error("Gemini did not return an image. Try a different prompt.");
  return `data:${d.mimeType || d.mime_type || "image/png"};base64,${d.data}`;
}

// ----- public API -----

// Returns a data: URL of a generated square image.
export async function generateImage(prompt, key, provider = "openai") {
  if (provider === "gemini") {
    const j = await gemini(GEMINI_IMAGE_MODEL, [{ text: prompt }],
      { responseModalities: ["TEXT", "IMAGE"] }, key);
    return geminiImage(j);
  }
  const j = await postJSON(`${OPENAI}/images/generations`, { Authorization: `Bearer ${key}` }, {
    model: "gpt-image-1", prompt, size: "1024x1024",
  });
  return "data:image/png;base64," + j.data[0].b64_json;
}

// Redraws an existing image in a chosen style. Returns a data: URL of the result.
export async function styleTransfer(blob, prompt, key, provider = "openai") {
  if (provider === "gemini") {
    const data = await blobToBase64(blob);
    const j = await gemini(GEMINI_IMAGE_MODEL,
      [{ text: prompt }, { inlineData: { mimeType: "image/png", data } }],
      { responseModalities: ["TEXT", "IMAGE"] }, key);
    return geminiImage(j);
  }
  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("prompt", prompt);
  fd.append("image", blob, "input.png");
  fd.append("size", "1024x1024");
  const r = await fetch(`${OPENAI}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return "data:image/png;base64," + j.data[0].b64_json;
}

// Returns { ku, ar }: Central Kurdish (Sorani) and Modern Standard Arabic.
export async function translate(text, key, provider = "openai") {
  if (provider === "gemini") {
    const j = await gemini(GEMINI_TEXT_MODEL,
      [{ text: `${TRANSLATE_SYSTEM}\n\nText: ${text}` }],
      { responseMimeType: "application/json" }, key);
    const out = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    if (!out.ku || !out.ar) throw new Error("Gemini returned an unexpected translation.");
    return { ku: out.ku, ar: out.ar };
  }
  const j = await postJSON(`${OPENAI}/chat/completions`, { Authorization: `Bearer ${key}` }, {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TRANSLATE_SYSTEM },
      { role: "user", content: text },
    ],
  });
  const out = JSON.parse(j.choices[0].message.content);
  return { ku: out.ku, ar: out.ar };
}
