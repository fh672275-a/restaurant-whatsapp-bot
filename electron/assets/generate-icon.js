/**
 * Generate a simple icon for the desktop app
 * Creates a WhatsApp-green colored icon with "RB" text
 */

const fs = require('fs');
const path = require('path');

// Simple 1x1 transparent PNG as placeholder
// In production, replace with actual icon
const ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const iconPath = path.join(__dirname, 'icon.png');
fs.writeFileSync(iconPath, ICON_PNG);
console.log('✅ Icon created at:', iconPath);
