/**
 * Transcripción estructurada de la clase de macroeconomía sobre el Modelo IS-LM.
 * Contiene timestamps, segundos transcurridos, hablante y texto.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseTimestampToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

export function loadTranscriptEntries() {
  const filePath = path.join(__dirname, '..', 'transcripcion.txt');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).map(l => l.trim());

  const entries = [];
  let currentTimestamp = null;
  let currentText = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('Archivo de audio') || line.startsWith('Modelo IS-LM') || line.startsWith('Transcripción')) {
      continue;
    }
    if (/^\d{2}:\d{2}:\d{2}$/.test(line)) {
      if (currentTimestamp !== null && currentText.length > 0) {
        entries.push({
          id: entries.length + 1,
          timestamp: currentTimestamp,
          seconds: parseTimestampToSeconds(currentTimestamp),
          speaker: "Profesor",
          text: currentText.join(' ')
        });
        currentText = [];
      }
      currentTimestamp = line;
    } else {
      currentText.push(line);
    }
  }

  if (currentTimestamp !== null && currentText.length > 0) {
    entries.push({
      id: entries.length + 1,
      timestamp: currentTimestamp,
      seconds: parseTimestampToSeconds(currentTimestamp),
      speaker: "Profesor",
      text: currentText.join(' ')
    });
  }

  return entries;
}

export const TRANSCRIPT_ENTRIES = loadTranscriptEntries();

export const FULL_TRANSCRIPT_TEXT = TRANSCRIPT_ENTRIES
  .map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`)
  .join('\n');
