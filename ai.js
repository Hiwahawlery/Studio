// AI features. Calls go straight from the browser to the provider using the user's own key.
// The key is never stored in the project files.

const OPENAI = "https://api.openai.com/v1";

// Removes the background locally in the browser (open-source model, no upload).
// Returns a PNG Blob with transparency. The first run downloads the model.
export async function removeBackground(blob) {
  const { removeBackground: remove } = await import(
    "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm"
  );
  return remove(blob);
}

async function post(path, key, body) {
  const r = await fetch(OPENAI + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

// Returns a data: URL of a generated square image.
export async function generateImage(prompt, key) {
  const j = await post("/images/generations", key, {
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
  });
  return "data:image/png;base64," + j.data[0].b64_json;
}

// Redraws an existing image in a chosen style (image edit endpoint).
// Returns a data: URL of the result.
export async function styleTransfer(blob, prompt, key) {
  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("prompt", prompt);
  fd.append("image", blob, "input.png");
  fd.append("size", "1024x1024");
  const r = await fetch(OPENAI + "/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return "data:image/png;base64," + j.data[0].b64_json;
}

// Returns { ku, ar }: Central Kurdish (Sorani) and Modern Standard Arabic.
export async function translate(text, key) {
  const j = await post("/chat/completions", key, {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Translate the user text for a graphic design. Return JSON with keys "ku" (Central Kurdish / Sorani, Arabic script, using Kurdish letters ڕ ڵ ۆ ێ ە where needed) and "ar" (Modern Standard Arabic). Keep it short and natural for posters and social media.',
      },
      { role: "user", content: text },
    ],
  });
  const out = JSON.parse(j.choices[0].message.content);
  return { ku: out.ku, ar: out.ar };
}
