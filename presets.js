// Page sizes. Print sizes are in millimetres and converted to pixels at 300 dpi,
// so exporting at 1× gives a file that is ready for a print shop.
// Screen sizes are given in pixels directly.

export const DPI = 300;

export const PAGE_GROUPS = [
  {
    label: "Print",
    items: [
      { id: "a0", name: "A0 · 841 × 1189 mm", mm: [841, 1189] },
      { id: "a1", name: "A1 · 594 × 841 mm", mm: [594, 841] },
      { id: "a2", name: "A2 · 420 × 594 mm", mm: [420, 594] },
      { id: "a3", name: "A3 · 297 × 420 mm", mm: [297, 420] },
      { id: "a4", name: "A4 · 210 × 297 mm", mm: [210, 297] },
      { id: "a5", name: "A5 · 148 × 210 mm", mm: [148, 210] },
      { id: "a6", name: "A6 · 105 × 148 mm", mm: [105, 148] },
      { id: "letter", name: "US Letter · 8.5 × 11 in", mm: [215.9, 279.4] },
      { id: "legal", name: "US Legal · 8.5 × 14 in", mm: [215.9, 355.6] },
      { id: "tabloid", name: "Tabloid · 11 × 17 in", mm: [279.4, 431.8] },
      { id: "card", name: "Business card · 90 × 55 mm", mm: [90, 55] },
      { id: "poster50", name: "Poster · 50 × 70 cm", mm: [500, 700] },
      { id: "banner", name: "Roll-up banner · 85 × 200 cm", mm: [850, 2000] },
    ],
  },
  {
    label: "Social",
    items: [
      { id: "ig-square", name: "Instagram post · 1080 × 1080", px: [1080, 1080] },
      { id: "ig-story", name: "Instagram story · 1080 × 1920", px: [1080, 1920] },
      { id: "fb-cover", name: "Facebook cover · 1640 × 624", px: [1640, 624] },
      { id: "yt-thumb", name: "YouTube thumbnail · 1280 × 720", px: [1280, 720] },
      { id: "x-post", name: "X post · 1600 × 900", px: [1600, 900] },
    ],
  },
  {
    label: "Screen",
    items: [
      { id: "fhd", name: "Full HD · 1920 × 1080", px: [1920, 1080] },
      { id: "4k", name: "4K · 3840 × 2160", px: [3840, 2160] },
    ],
  },
];

export const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.items);

export const findPage = (id) => ALL_PAGES.find((p) => p.id === id);

// Pixel size of a preset.
export function pagePixels(p) {
  if (p.mm) return [Math.round((p.mm[0] / 25.4) * DPI), Math.round((p.mm[1] / 25.4) * DPI)];
  return p.px.slice();
}

export const mmToPx = (mm) => Math.round((mm / 25.4) * DPI);
export const pxToMm = (px) => Math.round((px / DPI) * 25.4);
