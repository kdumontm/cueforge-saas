'use strict';
const path = require('path');
const fs = require('fs');

// Export Serato format (crate .crate file + metadata sidecar)
// Serato stores cues in the audio file's ID3/XMP tags typically,
// but we can also generate a .crate file for the Serato library

function exportSerato(tracks, outputDir) {
  // Generate Serato _Crates folder with a .crate file
  const crateDir = path.join(outputDir, '_Serato_', 'Subcrates');
  fs.mkdirSync(crateDir, { recursive: true });

  const crateName = 'CueForge Export';
  const cratePath = path.join(crateDir, `${crateName}.crate`);

  // Serato crate format (binary)
  // Header
  const VERSION = Buffer.from([0x01, 0x00, 0x00, 0x00]);
  const VRSN = Buffer.from('vrsn\x00\x00\x00\x10\x00\x31\x00\x2e\x00\x30\x00\x2f\x00\x53\x00\x65\x00\x72\x00\x61\x00\x74\x00\x6f\x00\x20\x00\x53\x00\x63\x00\x72\x00\x61\x00\x74\x00\x63\x00\x68\x00\x4c\x00\x69\x00\x76\x00\x65\x00\x20\x00\x43\x00\x72\x00\x61\x00\x74\x00\x65\x00\x73\x00\x00\x00');

  // Build track entries
  const trackBuffers = tracks.map(track => {
    const filePath = track.file_path;
    // Each track entry: 'otrk' tag with 'ptrk' sub-tag containing the path
    const pathUtf16 = Buffer.from(filePath, 'utf16le');
    const ptrkLen = Buffer.alloc(4);
    ptrkLen.writeUInt32BE(pathUtf16.length);
    const ptrk = Buffer.concat([Buffer.from('ptrk'), ptrkLen, pathUtf16]);
    const otrkLen = Buffer.alloc(4);
    otrkLen.writeUInt32BE(ptrk.length);
    return Buffer.concat([Buffer.from('otrk'), otrkLen, ptrk]);
  });

  const crateData = Buffer.concat([VRSN, ...trackBuffers]);
  fs.writeFileSync(cratePath, crateData);

  // Also generate a simple text summary
  const summaryPath = path.join(outputDir, 'CueForge_Serato_Export.txt');
  const lines = ['CueForge Export for Serato DJ', '=' .repeat(40), ''];
  tracks.forEach(t => {
    const cues = JSON.parse(t.cue_points || '[]');
    lines.push(`${t.title || t.file_name} | ${t.artist || 'Unknown'}`);
    lines.push(`  BPM: ${t.bpm || '?'} | Key: ${t.key_name || '?'}`);
    lines.push(`  File: ${t.file_path}`);
    cues.forEach((c, i) => {
      lines.push(`  Cue ${i + 1}: ${c.name || `Cue ${i + 1}`} @ ${formatTime(c.time)}`);
    });
    lines.push('');
  });
  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');

  return { cratePath, summaryPath };
}

function formatTime(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

module.exports = { exportSerato };
