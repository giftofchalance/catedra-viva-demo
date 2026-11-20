/**
 * Micro-Labeler Semántico (Bucket 3 Exclusivo: openai/gpt-oss-20b) y Métricas Read.ai.
 * Filosofía V4 Cero Exclusión: NUNCA clasifica ni oculta nada como "digresion" para no perder
 * historias reales del docente, metáforas pedagógicas ni contexto de aula.
 */

import { callGroqChat, hasApiKeys } from './llmClients.js';
import { normalizeSpokenTerms } from './stt.js';
import { normalizeSearchText } from './textUtils.js';

const ALLOWED_CATEGORIES = new Set(['concepto_clave', 'formula', 'importancia', 'ejemplo']);

export function detectHeuristicCategory(text = '') {
  const norm = normalizeSearchText(text);
  if (
    norm.includes('=') ||
    norm.includes('$') ||
    /\b(suma|dividido|integral|derivada|al cuadrado|probabilidad de|ecuacion|pendiente|multiplicador|formula|teorema|delta)\b/.test(norm)
  ) {
    return 'formula';
  }
  if (/\b(ojo|importante|prueba|control|examen|no confundan|clave|recuerden|entra en)\b/.test(norm)) {
    return 'importancia';
  }
  if (/\b(por ejemplo|imaginen|supongamos|canasta|futbol|historia|caso real|vida real|analogia|banco central|chile)\b/.test(norm)) {
    return 'ejemplo';
  }
  return 'concepto_clave';
}

export async function labelAndCleanSegment({ text, previousSegments = [], courseName = 'Clase', courseGlossary = '' }) {
  if (!text || !text.trim()) {
    return {
      speakerRole: 'profesor',
      category: 'concepto_clave',
      cleanedText: '',
      chapterTitle: null,
      keyTerms: []
    };
  }

  const fallback = {
    speakerRole: 'profesor',
    category: detectHeuristicCategory(text),
    cleanedText: normalizeSpokenTerms(text.trim()),
    chapterTitle: null,
    keyTerms: []
  };

  const { hasGroq } = hasApiKeys();
  if (!hasGroq) {
    return fallback;
  }

  const prevContext = previousSegments.slice(-2).map(s => `[${s.timestamp}] ${s.text}`).join('\n');

  const systemInstruction = `Eres el analizador semántico en tiempo real de una clase universitaria ("${courseName}").
Términos del curso (úsalos SOLO para corregir ortografía fonética, ej. "KPM" -> "CAPM", "ISLM" -> "IS-LM"; NUNCA inventes palabras): ${courseGlossary || 'terminología académica general del curso'}.
Devuelve ÚNICAMENTE un JSON válido:
{
  "speakerRole": "profesor" | "interrupcion",
  "category": "concepto_clave" | "formula" | "importancia" | "ejemplo",
  "cleanedText": "Texto íntegro del profesor con ortografía técnica corregida sin resumir ni omitir nada",
  "chapterTitle": "Título breve de 2 a 4 palabras del tema académico, o null si continúa el mismo tema",
  "keyTerms": ["termino1"]
}

REGLAS DE CATEGORIZACIÓN (CERO EXCLUSIÓN DE CONTENIDO DOCENTE):
1. "concepto_clave": Definiciones, explicaciones teóricas o desarrollo normal de la clase (categoría por defecto).
2. "formula": Ecuaciones, variables matemáticas, derivadas, probabilidades o cálculos.
3. "importancia": Énfasis explícitos de evaluación ("ojo con esto", "entra en el control", "no confundan", avisos de examen).
4. "ejemplo": Casos aplicados, metáforas cotidianas, historias personales del docente o anécdotas reales que ayudan a ilustrar la clase.`;

  const userPrompt = `Frases previas:\n${prevContext || '(Inicio de la sesión)'}\n\nFrase actual:\n"${text}"`;

  const res = await callGroqChat({
    model: 'openai/gpt-oss-20b',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    maxTokens: 450,
    jsonMode: true
  });

  if (res.status === 429) {
    console.warn('[labelAndCleanSegment] 429 en openai/gpt-oss-20b, usando heurística V4');
    return fallback;
  }

  if (res.ok && res.text) {
    try {
      const parsed = JSON.parse(res.text);
      return {
        speakerRole: parsed.speakerRole === 'interrupcion' ? 'interrupcion' : 'profesor',
        category: ALLOWED_CATEGORIES.has(parsed.category) ? parsed.category : fallback.category,
        cleanedText: normalizeSpokenTerms(parsed.cleanedText || fallback.cleanedText),
        chapterTitle: parsed.chapterTitle || null,
        keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : []
      };
    } catch (_) {
      return fallback;
    }
  }

  return fallback;
}

export function calculatePaceMetrics(entries = []) {
  if (entries.length === 0) {
    return {
      currentWpm: 0,
      paceStatus: 'pausado',
      paceLabel: '0 PPM (En espera)',
      totalWords: 0
    };
  }

  let totalWords = 0;
  entries.forEach(e => {
    totalWords += (e.text || '').trim().split(/\s+/).filter(Boolean).length;
  });

  const lastEntries = entries.slice(-6);
  let recentWords = 0;
  lastEntries.forEach(e => {
    recentWords += (e.text || '').trim().split(/\s+/).filter(Boolean).length;
  });

  const recentMinutes = Math.max(0.25, (lastEntries.length * 4.5) / 60);
  const currentWpm = Math.round(recentWords / recentMinutes);

  let paceStatus = 'optimo';
  let paceLabel = `${currentWpm} PPM (Ritmo Óptimo)`;

  if (currentWpm > 165) {
    paceStatus = 'rapido';
    paceLabel = `${currentWpm} PPM (Hablando Rápido ⚠️)`;
  } else if (currentWpm < 95 && currentWpm > 0) {
    paceStatus = 'pausado';
    paceLabel = `${currentWpm} PPM (Pausado / Explicativo)`;
  }

  return {
    currentWpm,
    paceStatus,
    paceLabel,
    totalWords
  };
}
