// Page sizes and starter templates. Template positions and sizes are fractions of the page (0 to 1).
const PRESETS = {
  instagram: { label: 'Instagram post', w: 1080, h: 1080 },
  story: { label: 'Story / Reel', w: 1080, h: 1920 },
  youtube: { label: 'YouTube thumbnail', w: 1280, h: 720 },
  facebook: { label: 'Facebook cover', w: 1640, h: 624 },
  a4: { label: 'A4 print (300 dpi)', w: 2480, h: 3508 }
};
const TEMPLATES = {
  headline: [
    { type: 'rect', x: 0.05, y: 0.05, w: 0.9, h: 0.9, r: 0.05, fill: '#211d3d' },
    { type: 'text', x: 0.1, y: 0.36, w: 0.8, text: 'Big headline', size: 0.09, weight: 700, font: 'Inter', align: 'center', fill: '#ffffff' },
    { type: 'text', x: 0.1, y: 0.6, w: 0.8, text: 'Supporting line', size: 0.04, weight: 400, font: 'Inter', align: 'center', fill: '#c9c6e8' }
  ]
};
