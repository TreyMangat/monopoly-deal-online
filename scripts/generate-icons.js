// ============================================================
// Generate PWA icons for Monopoly Deal Online
// Usage: node scripts/generate-icons.js
// Requires: npm install --save-dev canvas
// ============================================================

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [192, 512];
const CORNER_RADIUS_RATIO = 0.18;

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = Math.round(size * CORNER_RADIUS_RATIO);
  const s = size;

  // ---- Rounded rectangle clip ----
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.arcTo(s, 0, s, r, r);
  ctx.lineTo(s, s - r);
  ctx.arcTo(s, s, s - r, s, r);
  ctx.lineTo(r, s);
  ctx.arcTo(0, s, 0, s - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.clip();

  // ---- Background: rich green radial gradient ----
  const bgGrad = ctx.createRadialGradient(s * 0.5, s * 0.4, s * 0.1, s * 0.5, s * 0.5, s * 0.7);
  bgGrad.addColorStop(0, '#2E7D32');
  bgGrad.addColorStop(1, '#1B5E20');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, s, s);

  // ---- Subtle felt texture (tiny dots) ----
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < s; x += Math.max(1, Math.round(s * 0.03))) {
    for (let y = 0; y < s; y += Math.max(1, Math.round(s * 0.03))) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // ---- House icon (center-upper) ----
  const hx = s * 0.5;
  const hy = s * 0.28;
  const hw = s * 0.34;
  const hh = s * 0.22;
  const roofH = s * 0.14;

  // Roof (triangle)
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - hw * 0.6, hy + roofH);
  ctx.lineTo(hx + hw * 0.6, hy + roofH);
  ctx.closePath();
  const roofGrad = ctx.createLinearGradient(hx, hy, hx, hy + roofH);
  roofGrad.addColorStop(0, '#FFD700');
  roofGrad.addColorStop(1, '#FFA000');
  ctx.fillStyle = roofGrad;
  ctx.fill();

  // House body
  const bodyTop = hy + roofH;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(hx - hw * 0.42, bodyTop, hw * 0.84, hh);

  // Door
  ctx.fillStyle = '#5D4037';
  const doorW = hw * 0.2;
  const doorH = hh * 0.55;
  ctx.fillRect(hx - doorW / 2, bodyTop + hh - doorH, doorW, doorH);

  // Door knob
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(hx + doorW * 0.2, bodyTop + hh - doorH * 0.4, s * 0.008, 0, Math.PI * 2);
  ctx.fill();

  // Windows
  ctx.fillStyle = '#81D4FA';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = s * 0.004;
  const winSize = hw * 0.14;
  ctx.fillRect(hx - hw * 0.32, bodyTop + hh * 0.2, winSize, winSize);
  ctx.strokeRect(hx - hw * 0.32, bodyTop + hh * 0.2, winSize, winSize);
  ctx.fillRect(hx + hw * 0.18, bodyTop + hh * 0.2, winSize, winSize);
  ctx.strokeRect(hx + hw * 0.18, bodyTop + hh * 0.2, winSize, winSize);

  // Chimney
  ctx.fillStyle = '#8D6E63';
  const chimW = hw * 0.1;
  const chimH = roofH * 0.7;
  ctx.fillRect(hx + hw * 0.2, hy - chimH * 0.2, chimW, chimH);

  // ---- Fan of 3 cards below the house ----
  const cardW = s * 0.1;
  const cardH = s * 0.14;
  const cardY = bodyTop + hh + s * 0.03;
  const cardCenterX = hx;
  const cardColors = ['#DC143C', '#1565C0', '#2E7D32'];
  const angles = [-15, 0, 15];
  const offsets = [-cardW * 0.9, 0, cardW * 0.9];

  angles.forEach((angle, i) => {
    ctx.save();
    ctx.translate(cardCenterX + offsets[i], cardY + cardH / 2);
    ctx.rotate((angle * Math.PI) / 180);

    // Card body (white)
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = s * 0.015;
    ctx.shadowOffsetY = s * 0.005;
    const cr = s * 0.01;
    roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, cr);
    ctx.fill();

    // Color bar at top
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = cardColors[i];
    roundRectTop(ctx, -cardW / 2, -cardH / 2, cardW, cardH * 0.3, cr);
    ctx.fill();

    ctx.restore();
  });

  // ---- Gold coin in top-right ----
  const coinR = s * 0.065;
  const coinX = s * 0.82;
  const coinY = s * 0.13;
  const coinGrad = ctx.createRadialGradient(coinX - coinR * 0.2, coinY - coinR * 0.2, coinR * 0.1, coinX, coinY, coinR);
  coinGrad.addColorStop(0, '#FFE082');
  coinGrad.addColorStop(0.7, '#FFD700');
  coinGrad.addColorStop(1, '#F9A825');
  ctx.fillStyle = coinGrad;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#F57F17';
  ctx.lineWidth = s * 0.005;
  ctx.stroke();
  // $ sign
  ctx.fillStyle = '#5D4037';
  ctx.font = `bold ${Math.round(coinR * 1.3)}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', coinX, coinY + s * 0.003);

  // ---- "DEAL" text at bottom ----
  const textSize = Math.round(s * 0.13);
  ctx.font = `800 ${textSize}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textY = s * 0.85;

  // Text shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillText('DEAL', s * 0.5, textY + s * 0.006);

  // White text
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('DEAL', s * 0.5, textY);

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function roundRectTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ---- Generate ----

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
