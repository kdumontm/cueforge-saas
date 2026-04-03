#!/usr/bin/env node
/**
 * Script pour générer les icônes de l'app CueForge.
 * Utilise un SVG simple comme base.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Pour le build final, remplacer assets/icon.png par votre icône HD (1024x1024).
 * Puis convertir en .icns avec:
 *   mkdir icon.iconset
 *   sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
 *   sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
 *   sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
 *   sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
 *   sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
 *   sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
 *   sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
 *   sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
 *   sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
 *   sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
 *   iconutil -c icns icon.iconset
 */

const fs = require('fs');
const path = require('path');

// SVG de l'icône CueForge
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8b5cf6"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ec4899"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="230" fill="url(#bg)"/>
  <!-- Vinyl disc -->
  <circle cx="512" cy="480" r="280" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="40"/>
  <circle cx="512" cy="480" r="200" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="20"/>
  <circle cx="512" cy="480" r="120" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="15"/>
  <circle cx="512" cy="480" r="50" fill="rgba(255,255,255,0.9)"/>
  <circle cx="512" cy="480" r="20" fill="#7c3aed"/>
  <!-- Waveform bars -->
  <g transform="translate(200, 780)" fill="url(#accent)" opacity="0.9">
    <rect x="0" y="-30" width="18" height="60" rx="9"/>
    <rect x="30" y="-50" width="18" height="100" rx="9"/>
    <rect x="60" y="-70" width="18" height="140" rx="9"/>
    <rect x="90" y="-45" width="18" height="90" rx="9"/>
    <rect x="120" y="-80" width="18" height="160" rx="9"/>
    <rect x="150" y="-60" width="18" height="120" rx="9"/>
    <rect x="180" y="-90" width="18" height="180" rx="9"/>
    <rect x="210" y="-55" width="18" height="110" rx="9"/>
    <rect x="240" y="-75" width="18" height="150" rx="9"/>
    <rect x="270" y="-40" width="18" height="80" rx="9"/>
    <rect x="300" y="-85" width="18" height="170" rx="9"/>
    <rect x="330" y="-65" width="18" height="130" rx="9"/>
    <rect x="360" y="-95" width="18" height="190" rx="9"/>
    <rect x="390" y="-50" width="18" height="100" rx="9"/>
    <rect x="420" y="-70" width="18" height="140" rx="9"/>
    <rect x="450" y="-35" width="18" height="70" rx="9"/>
    <rect x="480" y="-60" width="18" height="120" rx="9"/>
    <rect x="510" y="-80" width="18" height="160" rx="9"/>
    <rect x="540" y="-45" width="18" height="90" rx="9"/>
    <rect x="570" y="-55" width="18" height="110" rx="9"/>
    <rect x="600" y="-30" width="18" height="60" rx="9"/>
  </g>
  <!-- CueForge text -->
  <text x="512" y="920" text-anchor="middle" fill="rgba(255,255,255,0.95)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="72" font-weight="700" letter-spacing="4">CUEFORGE</text>
</svg>`;

const trayIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="14" fill="none" stroke="#000" stroke-width="2.5"/>
  <circle cx="18" cy="18" r="8" fill="none" stroke="#000" stroke-width="1.5"/>
  <circle cx="18" cy="18" r="3" fill="#000"/>
</svg>`;

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), iconSvg);
fs.writeFileSync(path.join(assetsDir, 'tray-icon.svg'), trayIconSvg);

console.log('✅ Icônes SVG générées dans assets/');
console.log('📌 Pour le build, convertir icon.svg en icon.png (1024x1024) puis en icon.icns');
console.log('   Voir les instructions dans ce fichier pour la conversion.');
