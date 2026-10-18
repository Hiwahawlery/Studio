# Studio

A browser-based photo and design editor, built from scratch.

## Features

- **Layers:** images, text, rectangles, ellipses, brush and eraser strokes
- **Editing:** move, resize and rotate with handles; snap to the artboard centre and edges; multi-select (Shift-click or marquee)
- **Layer panel:** show/hide, lock, reorder (drag, or `[` / `]`), duplicate, delete
- **Blend modes** (multiply, screen, overlay, and more) and per-image brightness, contrast, saturation and blur
- **Text:** wrapping, alignment, outline, weight. Arabic and Kurdish (Sorani) text is detected and set right-to-left
- **Undo / redo** with Ctrl+Z / Ctrl+Shift+Z
- **Templates:** social post, poster, story
- **AI:** background removal (runs in your browser), image generation, and English → Kurdish + Arabic translation (all use your free Gemini API key)
- **Interface languages:** English, Kurdish, Arabic (switches layout direction)
- **Export:** PNG (transparent) or JPG at 1×, 2× or 3×
- **Save / Open:** `.studio.json` project files that include the images

## Run it

Open `index.html` in Chrome, Edge or Firefox. No install step.

Internet access is needed for the fonts, the background-removal model, and the AI features.

## Keyboard

| Key | Action |
|---|---|
| V / T / R / O / B / E / H | Select / Text / Rectangle / Ellipse / Brush / Eraser / Hand |
| Space + drag | Pan |
| Ctrl + wheel | Zoom |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+C / Ctrl+V / Ctrl+D | Copy / Paste / Duplicate |
| Ctrl+A | Select all |
| Ctrl+S | Save project |
| Arrows (Shift for 10px) | Nudge |
| [ / ] | Send backward / bring forward |
| Delete | Remove selected |

You can also paste an image from the clipboard or drag an image file onto the canvas.

## Files

- `index.html`: page layout
- `styles.css`: look and feel
- `engine.js`: document model, geometry, text layout, drawing (no UI code)
- `app.js`: tools, pointer and keyboard handling, panels, import/export
- `ai.js`: AI calls
- `i18n.js`: interface strings in English, Kurdish and Arabic
- `fonts.js`: font catalogue (Kurdish/Arabic/Persian, Chinese, English, display) and on-demand loading
- `presets.js`: page sizes (A0–A6, US sizes, business card, posters, social, screen), 300 dpi conversion
- `logo.svg`: the logo

## Put it on GitHub

```bash
cd studio
git init
git add .
git commit -m "Initial commit: Studio editor"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/studio.git
git push -u origin main
```

Create the empty repository `studio` on github.com first (no README, no .gitignore).

**To change the code later:**

```bash
git add .
git commit -m "Describe the change"
git push
```

**To publish it as a website (free):** repository → Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save. It will be live at `https://YOUR-USERNAME.github.io/studio/`.

## Notes

- Your Gemini key is saved only in your browser. Do not put it in the code or commit it.
- Background removal uses `@imgly/background-removal`, loaded from jsDelivr.
- AI models in `ai.js`: `gemini-2.5-flash-image` (images) and `gemini-2.5-flash` (translation). Get a free key at https://aistudio.google.com/apikey.
- Text rendering on canvas needs browser support for `roundRect` and `ctx.filter` (current Chrome, Edge, Firefox; Safari 17+ for filters).
- Kurdish and Arabic interface text should be checked by a native speaker before release.
