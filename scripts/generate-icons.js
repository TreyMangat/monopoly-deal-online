// ============================================================
// Generate PWA icons for Property Deal
// Usage: node scripts/generate-icons.js
// Requires: npm install --save-dev canvas
// ============================================================

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [192, 512];
const BG_COLOR = '#141624';
const TEXT_COLOR = '#2ED1C0';
const CORNER_RADIUS_RATIO = 0.18; // 18% of size

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = Math.round(size * CORNER_RADIUS_RATIO);

  // Draw rounded rectangle background
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = BG_COLOR;
  ctx.fill();

  // Draw "PD" text centered
  const fontSize = Math.round(size * 0.42);
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PD', size / 2, size / 2 + Math.round(size * 0.02));

  return canvas.toBuffer('image/png');
}

// Ensure output directory exists
const outDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const size of SIZES) {
  const buf = generateIcon(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
}

console.log('Done!');
