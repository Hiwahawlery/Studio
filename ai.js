// HewAi: the AI features of Studio, powered by Google Gemini.
//   Translation:        gemini-2.5-flash (text)
//   Images and styles:  gemini-2.5-flash-image
// Calls go straight from the browser to Google, using the user's own free API key
// (get one at https://aistudio.google.com/apikey). The key stays in this browser only.

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const TEXT_MODEL = "gemini-3.8-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";

const TRANSLATE_PROMPT =
  'Translate the text below for a graphic design. Return JSON with keys "ku" (Central Kurdish / Sorani, Arabic script, using Kurdish letters ڕ ڵ ۆ ێ ە where needed) and "ar" (Modern Standard Arabic). Keep it short and natural for posters and social media.\n\nText: ';

// Removes the background locally in the browser (open-source model, no upload, no key).
// Returns a PNG Blob with transparency. The first run downloads the model.
export async function removeBackground(blob) {
  const { removeBackground: remove } = await import(
    "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm"
  );
  return remove(blob);
}

// One Gemini request. The key goes in a header, not in the URL, so it stays out of logs.
async function generate(model, parts, generationConfig, key) {
  const r = await fetch(`${GEMINI}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly(j.error && j.error.message, r.status));
  return j;
}

// Turns Google's error messages into something a user can act on.
function friendly(message, status) {
  if (status === 400 && /API key/i.test(message || "")) return "The Gemini API key is not valid.";
  if (status === 403) return "This key has no access to the model. Check its settings in Google AI Studio.";
  if (status === 429) return "Too many requests or the free limit is reached. Wait a minute and try again.";
  return message || `Gemini error (HTTP ${status})`;
}

function partsOf(j) {
  const c = (j.candidates || [])[0];
  return (c && c.content && c.content.parts) || [];
}

function imageFrom(j) {
  const part = partsOf(j).find((p) => p.inlineData || p.inline_data);
  const d = part && (part.inlineData || part.inline_data);
  if (!d) throw new Error("Gemini did not return an image. Try a different prompt.");
  return `data:${d.mimeType || d.mime_type || "image/png"};base64,${d.data}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ----- public API -----

// Returns a data: URL of a generated image.
export async function generateImage(prompt, key) {
  const j = await generate(IMAGE_MODEL, [{ text: prompt }],
    { responseModalities: ["TEXT", "IMAGE"] }, key);
  return imageFrom(j);
}

// Redraws an existing image in a chosen style. Returns a data: URL of the result.
export async function styleTransfer(blob, prompt, key) {
  const data = await blobToBase64(blob);
  const j = await generate(IMAGE_MODEL,
    [{ text: prompt }, { inlineData: { mimeType: "image/png", data } }],
    { responseModalities: ["TEXT", "IMAGE"] }, key);
  return imageFrom(j);
}

// Returns { ku, ar }: Central Kurdish (Sorani) and Modern Standard Arabic.
export async function translate(text, key) {
  const j = await generate(TEXT_MODEL, [{ text: TRANSLATE_PROMPT + text }],
    { responseMimeType: "application/json" }, key);
  let out;
  try {
    const first = partsOf(j)[0];
    out = JSON.parse((first && first.text) || "{}");
  } catch (e) {
    out = {};
  }
  if (!out.ku || !out.ar) throw new Error("Gemini returned an unexpected translation. Try again.");
  return { ku: out.ku, ar: out.ar };
}
