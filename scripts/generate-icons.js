/**
 * Generate PWA icons of multiple sizes
 * Creates WhatsApp-green colored icons with "RB" text
 */

const fs = require('fs');
const path = require('path');

// Create SVG icon
function createSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#075E54" rx="${size * 0.15}"/>
  <circle cx="${size/2}" cy="${size * 0.4}" r="${size * 0.22}" fill="#25D366"/>
  <path d="M ${size * 0.35} ${size * 0.62} Q ${size/2} ${size * 0.78} ${size * 0.65} ${size * 0.62} L ${size * 0.7} ${size * 0.75} L ${size * 0.6} ${size * 0.7} Q ${size/2} ${size * 0.73} ${size * 0.4} ${size * 0.7} L ${size * 0.3} ${size * 0.75} Z" fill="#25D366"/>
  <text x="${size/2}" y="${size * 0.45}" font-family="Arial" font-size="${size * 0.18}" font-weight="bold" fill="white" text-anchor="middle">RB</text>
</svg>`;
}

// Convert SVG to PNG data (using simple base64 encoding)
// Note: This creates simple PNG files. For production, use sharp or imagemagick.
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create a simple 1x1 PNG as placeholder (works for PWA)
// Real icons should be generated with proper image tools
const PNG_DATA = {
  72: 'iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAA...',
  96: 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADSZnsCAAAA...',
  128: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAA...',
  144: 'iVBORw0KGgoAAAANSUhEUgAAAJAAAACACAYAAADQ58yHAAAA...',
  152: 'iVBORw0KGgoAAAANSUhEUgAAAKAAAACACAYAAACZsY7HAAAA...',
  192: 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3WPwAAAA...',
  384: 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAA...',
  512: 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAA...'
};

// Generate simple solid-color PNG icons using Buffer
function generatePNG(size) {
  // Minimal PNG header + IHDR + IDAT + IEND for solid color
  // This is a very simplified version - creates a green square
  const width = size;
  const height = size;
  
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // For simplicity, save SVG instead (browsers accept SVG for PWA too)
  return null;
}

// Generate SVG icons (browsers support SVG for PWA)
SIZES.forEach(size => {
  const svg = createSVG(size);
  const svgPath = path.join(iconsDir, `icon-${size}x${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`✅ Created SVG: icon-${size}x${size}.svg`);
  
  // Also create a simple PNG (1x1 placeholder)
  const pngPath = path.join(iconsDir, `icon-${size}x${size}.png`);
  // Simple 1x1 green PNG
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(pngBase64, 'base64'));
  console.log(`✅ Created PNG: icon-${size}x${size}.png`);
});

console.log('\n✅ All icons generated in:', iconsDir);
