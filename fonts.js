// Font catalogue. Each family loads from Google Fonts the first time a layer uses it.

export const FONT_GROUPS = [
  {
    label: "Kurdish · Arabic · Persian",
    fonts: [
      "Vazirmatn", "Noto Sans Arabic", "Noto Naskh Arabic", "Amiri", "Cairo", "Tajawal",
      "Mada", "Changa", "Reem Kufi", "Lalezar", "Rakkas", "Scheherazade New",
    ],
  },
  {
    label: "Chinese",
    fonts: [
      "Noto Sans SC", "Noto Serif SC", "ZCOOL XiaoWei", "ZCOOL QingKe HuangYou",
      "ZCOOL KuaiLe", "Ma Shan Zheng", "Zhi Mang Xing", "Liu Jian Mao Cao", "Long Cang",
    ],
  },
  {
    label: "English · Display",
    fonts: [
      "Inter", "Roboto", "Montserrat", "Poppins", "Playfair Display", "Oswald",
      "Bebas Neue", "Pacifico", "Lobster", "Dancing Script", "Abril Fatface",
    ],
  },
];

export const ALL_FONTS = FONT_GROUPS.flatMap((g) => g.fonts);

const cache = new Map();

// Resolves once the family is usable (or has failed to load, so the editor never hangs).
export function loadFont(name) {
  if (!ALL_FONTS.includes(name)) return Promise.resolve();
  if (cache.has(name)) return cache.get(name);

  const p = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}&display=swap`;
    link.onload = () => {
      document.fonts.load(`40px "${name}"`).then(() => resolve(), () => resolve());
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  cache.set(name, p);
  return p;
}
