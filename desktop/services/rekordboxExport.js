'use strict';
const path = require('path');
const fs = require('fs');

// Rekordbox Camelot notation
const CAMELOT = {
  'C maj': '8B', 'G maj': '9B', 'D maj': '10B', 'A maj': '11B',
  'E maj': '12B', 'B maj': '1B', 'F# maj': '2B', 'Db maj': '3B',
  'Ab maj': '4B', 'Eb maj': '5B', 'Bb maj': '6B', 'F maj': '7B',
  'A min': '8A', 'E min': '9A', 'B min': '10A', 'F# min': '11A',
  'C# min': '12A', 'G# min': '1A', 'Eb min': '2A', 'Bb min': '3A',
  'F min': '4A', 'C min': '5A', 'G min': '6A', 'D min': '7A',
};

function xmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

function trackToXml(track) {
  const cuePoints = JSON.parse(track.cue_points || '[]');
  const camelot = CAMELOT[track.key_name] || '';

  const cuesXml = cuePoints.map((cue, i) => {
    const time = (cue.time * 1000).toFixed(3); // ms
    const color = ['0xFF0000', '0xFF6600', '0xFFFF00', '0x00FF00'][i] || '0xFFFFFF';
    return `      <POSITION_MARK Name="${xmlEscape(cue.name || `Cue ${i + 1}`)}" Type="0" Start="${time}" Num="${i}" Red="255" Green="0" Blue="0"/>`;
  }).join('\n');

  // Beat grid (simplified)
  const bpm = track.bpm || 120;
  const beatInterval = 60000 / bpm; // ms per beat

  return `    <TRACK TrackID="${track.id}" Name="${xmlEscape(track.title || track.file_name)}" Artist="${xmlEscape(track.artist || '')}" Album="${xmlEscape(track.album || '')}" TotalTime="${Math.floor(track.duration || 0)}" DiscNumber="0" TrackNumber="0" Year="" Bpm="${bpm.toFixed(2)}" AverageBpm="${bpm.toFixed(2)}" Tonality="${xmlEscape(track.key_name || '')}" Location="file://localhost${xmlEscape(track.file_path)}" Rating="0" Color="0x000000FF">
${cuesXml}
      <TEMPO Inizio="0.000" Bpm="${bpm.toFixed(2)}" Metro="4/4" Battito="1"/>
    </TRACK>`;
}

function exportRekordbox(tracks, outputPath) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const tracksXml = tracks.map(trackToXml).join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="CueForge" Version="2.0.0" Company="CueForge"/>
  <COLLECTION Entries="${tracks.length}">
${tracksXml}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="CueForge Export" Type="1" KeyType="0" Entries="${tracks.length}">
${tracks.map((t, i) => `        <TRACK Key="${i + 1}"/>`).join('\n')}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;

  fs.writeFileSync(outputPath, xml, 'utf-8');
  return outputPath;
}

module.exports = { exportRekordbox };
