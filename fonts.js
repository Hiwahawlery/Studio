// Fonts for Latin, Arabic-script text (Kurdish, Arabic, Persian) and Chinese. Loaded from Google Fonts in index.html.
const FONTS = {
  list: ['Inter', 'Noto Sans Arabic', 'Noto Sans SC'],
  // Each name falls back to system fonts that cover Arabic script and Chinese.
  stack: name => `"${name}", "Segoe UI", Tahoma, Arial, "Noto Sans Arabic", "Noto Sans SC", "Microsoft YaHei", sans-serif`,
  pending: new Set(),
  // Ask the browser to load a font, then call onReady so the canvas redraws with it.
  ensure(name, weight, onReady) {
    const probe = `${weight} 16px "${name}"`;
    if (!document.fonts || document.fonts.check(probe) || this.pending.has(probe)) return;
    this.pending.add(probe);
    document.fonts.load(probe).then(() => { this.pending.delete(probe); onReady(); }, () => this.pending.delete(probe));
  }
};
