/**
 * Transcripción de Audio Efímero en Vivo (Buckets 1, 2 y 6) + Deduplicación de Overlap Acústico.
 * IMPORTANTE: Nunca se envía `prompt` a Whisper para evitar ecos de glosario en pausas.
 */

import { callGroqWhisper, callGeminiFlashLite, hasApiKeys } from './llmClients.js';
import { normalizeSearchText } from './textUtils.js';

const WHISPER_SILENCE_HALLUCINATIONS = new Set([
  'gracias', 'gracias.', 'muchas gracias', 'muchas gracias.',
  'bien', 'bien.', 'bueno', 'bueno.', 'sí', 'sí.', 'no', 'no.',
  'y', 'y.', 'o', 'eh', 'ah', 'mm', 'amén', 'amén.', 'subtítulos',
  'hola', 'hola.', 'adiós', 'hasta luego', '...', '.',
  'música', 'música.', '(música)', '[música]', 'musica',
  'aplausos', 'aplausos.', '(aplausos)', '[aplausos]',
  'silencio', 'silencio.',
  'glosario técnico', 'glosario técnico.', 'clase universitaria en español', 'clase universitaria en español.'
]);

export function cleanWhisperOutput(rawText) {
  if (!rawText) return '';
  const text = rawText.replace(/^["'«“]|["'»”]$/g, '').trim();
  const low = text.toLowerCase();

  if (
    low.includes('subtítulos por') ||
    low.includes('subtitulado por') ||
    low.includes('subtítulos realizados') ||
    low.includes('amara.org') ||
    low.includes('gracias por ver') ||
    low.includes('suscríbete') ||
    low.includes('suscrib') ||
    low.includes('dale like') ||
    low.includes('glosario técnico') ||
    low.includes('contexto inmediato anterior') ||
    low.includes('sabes qué es lo más difícil') ||
    (low.includes('hasta la próxima') && text.length < 35)
  ) {
    return '';
  }

  const cleanPunct = low.replace(/[.,¡!¿?…()[\]]/g, '').trim();
  if (WHISPER_SILENCE_HALLUCINATIONS.has(low) || WHISPER_SILENCE_HALLUCINATIONS.has(cleanPunct)) {
    return '';
  }

  if (cleanPunct.length < 4) {
    return '';
  }

  return text;
}

export function normalizeSpokenTerms(text = '') {
  return text
    .replace(/\bISLM\b/gi, 'IS-LM')
    .replace(/\bis lm\b/gi, 'IS-LM')
    .replace(/\bel E\.?M\.?\b/gi, 'la curva LM')
    .replace(/\bKPM\b/g, 'CAPM')
    .replace(/\bkpm\b/gi, 'CAPM')
    .replace(/\bCAPE\b/g, 'CAPM')
    .replace(/\bel cape\b/gi, 'el CAPM')
    .replace(/\bbajo el cape\b/gi, 'bajo el CAPM')
    .replace(/\bC\.?A\.?P\.?M\.?\b/gi, 'CAPM')
    .replace(/\bel guac\b/gi, 'el WACC')
    .replace(/\bel wac\b/gi, 'el WACC')
    .replace(/\bel wak\b/gi, 'el WACC')
    .replace(/\bel BAC\b/gi, 'el WACC')
    .replace(/\bel bac representa\b/gi, 'el WACC representa')
    .replace(/\bwacc\b/gi, 'WACC')
    .replace(/\buna tira alta\b/gi, 'una TIR alta')
    .replace(/\buna tir alta\b/gi, 'una TIR alta')
    .replace(/\bel ban\b/gi, 'el VAN')
    .replace(/\bevaluamos el van\b/gi, 'evaluamos el VAN')
    .replace(/\bsiempre el ban\b/gi, 'siempre el VAN');
}

/**
 * Fusiona suavemente un fragmento nuevo con el anterior si hubo traslape acústico (~1s)
 * para evitar palabras partidas o frases repetidas.
 */
export function mergeOverlappingTranscript(prevText = '', nextText = '') {
  const nextTrim = (nextText || '').trim();
  if (!prevText || !prevText.trim() || !nextTrim) return nextTrim;

  const prevWords = prevText.trim().split(/\s+/).filter(Boolean);
  const nextWords = nextTrim.split(/\s+/).filter(Boolean);
  if (prevWords.length < 2 || nextWords.length < 2) return nextTrim;

  const normWord = (w) => normalizeSearchText(w).replace(/[.,;:!?¿¡"'()[\]]/g, '');
  const prevNorm = prevWords.map(normWord);
  const nextNorm = nextWords.map(normWord);

  const maxOverlap = Math.min(6, prevNorm.length, nextNorm.length);
  for (let k = maxOverlap; k >= 2; k--) {
    const tail = prevNorm.slice(-k);
    const head = nextNorm.slice(0, k);
    const exactMatch = tail.every((w, i) => w && w === head[i]);
    if (exactMatch) {
      const remaining = nextWords.slice(k).join(' ').replace(/^[,;:\s]+/, '').trim();
      return remaining;
    }
  }

  return nextTrim;
}

export async function transcribeLiveAudio(audioBuffer, mimeType = 'audio/mp3') {
  const { hasGroq, hasGemini } = hasApiKeys();
  if (!hasGroq && !hasGemini) {
    throw new Error('No hay claves de API configuradas para transcripción.');
  }

  if (hasGroq) {
    const whisperModels = ['whisper-large-v3', 'whisper-large-v3-turbo'];
    for (const modelName of whisperModels) {
      const res = await callGroqWhisper({ audioBuffer, mimeType, modelName });
      if (res.status === 429) {
        console.warn(`[transcribeLiveAudio] Cuota alcanzada en ${modelName}, rotando al siguiente modelo...`);
        continue;
      }
      if (res.ok) {
        return cleanWhisperOutput(res.text);
      }
      if (res.error) {
        console.warn(`[transcribeLiveAudio] Error en ${modelName}:`, res.error);
      }
    }
  }

  if (hasGemini) {
    const base64Audio = audioBuffer.toString('base64');
    const res = await callGeminiFlashLite({
      promptText: 'Transcribe exactamente lo que dice el profesor en este fragmento de clase en español. Si solo hay silencio, música, respiración o ruido de fondo, responde únicamente la palabra: SILENCIO.',
      temperature: 0.1,
      maxOutputTokens: 350,
      inlineAudio: { dataBase64: base64Audio, mimeType }
    });
    if (res.ok && !res.text.toUpperCase().includes('SILENCIO')) {
      return cleanWhisperOutput(res.text);
    }
  }

  return '';
}
