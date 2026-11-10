/**
 * Motor de IA Unificado (Groq Whisper v3 Turbo + Qwen 27B / GPT-OSS 120B + Gemini 3.8 Flash)
 * Provee:
 * 1. Transcripción robusta con inyección de glosario dinámico del curso.
 * 2. Micro-labeler semántico en tiempo real (roles, categorías, LaTeX y capítulos Read.ai).
 * 3. Métricas de oratoria (WPM, ritmo, capítulos).
 * 4. Chatbot socrático con citas interactivas y control maestro docente (Modo Pizarra).
 */

import 'dotenv/config';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * 1. Transcripción de Audio en Vivo con Whisper Large v3 Turbo en Groq
 */
export async function transcribeLiveAudio(audioBuffer, mimeType = 'audio/mp3', glossaryPrompt = '') {
  if (!GROQ_API_KEY && !GEMINI_API_KEY) {
    throw new Error('No hay claves de API configuradas para transcripción.');
  }

  // 1. Intentar con Groq Whisper Large v3 Turbo
  if (GROQ_API_KEY) {
    try {
      const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
        : mimeType.includes('ogg') ? 'ogg'
        : mimeType.includes('wav') ? 'wav'
        : 'webm';

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: mimeType }), `live_chunk.${ext}`);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'es');
      formData.append('response_format', 'json');
      
      const defaultVocab = 'Cátedra Viva, clase universitaria, fórmulas, conceptos.';
      formData.append('prompt', glossaryPrompt ? `${defaultVocab} Términos del ramo: ${glossaryPrompt}` : defaultVocab);

      let res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: formData
      });

      if (res.status === 429) {
        // Pausa breve por rate-limit y 1 reintento
        await new Promise(r => setTimeout(r, 1500));
        res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData
        });
      }

      if (res.ok) {
        const data = await res.json();
        let text = data.text?.trim() || '';
        if (text) {
          text = text.replace(/^["'«“]|["'»”]$/g, '').trim();
          const low = text.toLowerCase();
          // Filtrar alucinaciones comunes de silencio en Whisper
          if (
            low.includes('subtítulos por') || 
            low.includes('amara.org') || 
            low.includes('gracias por ver') || 
            low.includes('suscríbete') ||
            low.includes('suscri') ||
            low.includes('hasta la próxima') && text.length < 30
          ) {
            return '';
          }
          return text;
        }
      }
    } catch (err) {
      console.warn('[transcribeLiveAudio] Fallo con Groq Whisper:', err.message);
    }
  }

  // 2. Fallback a Gemini si Groq no responde
  if (GEMINI_API_KEY) {
    try {
      const base64Audio = audioBuffer.toString('base64');
      const prompt = `Transcribe exactamente lo que se habla en este fragmento de clase en español. Si solo hay silencio o ruido, responde únicamente: SILENCIO. Glosario: ${glossaryPrompt}`;
      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Audio } }
            ]
          }
        ],
        generationConfig: { temperature: 0.1 }
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        if (text && !text.toUpperCase().includes('SILENCIO')) {
          return text;
        }
      }
    } catch (e) {
      console.warn('[transcribeLiveAudio] Fallo en fallback Gemini:', e.message);
    }
  }

  return '';
}

/**
 * 2. Micro-Labeler Semántico: Clasifica roles, categorías pedagógicas, notación LaTeX y capítulos
 */
export async function labelAndCleanSegment({ text, previousSegments = [], courseName = 'Clase' }) {
  if (!text || !text.trim()) {
    return {
      speakerRole: 'profesor',
      category: 'concepto_clave',
      cleanedText: '',
      chapterTitle: 'Introducción',
      keyTerms: []
    };
  }

  // Heurística de respaldo inicial
  const fallback = {
    speakerRole: 'profesor',
    category: detectHeuristicCategory(text),
    cleanedText: text.trim(),
    chapterTitle: courseName,
    keyTerms: []
  };

  if (!GROQ_API_KEY && !GEMINI_API_KEY) {
    return fallback;
  }

  const prevContext = previousSegments.slice(-2).map(s => `[${s.timestamp}] ${s.speaker}: ${s.text}`).join('\n');

  const systemInstruction = `Eres el clasificador semántico en tiempo real de Cátedra Viva para el curso universitario "${courseName}".
Tu tarea es analizar el último fragmento hablado por el profesor o aula y clasificarlo con precisión.

DEBES responder ÚNICAMENTE un objeto JSON válido con este esquema:
{
  "speakerRole": "profesor" | "interrupcion",
  "category": "concepto_clave" | "formula" | "importancia" | "digresion",
  "cleanedText": "Texto corregido, manteniendo fidelidad al habla pero formateando fórmulas matemáticas en LaTeX con $...$ o $$...$$",
  "chapterTitle": "Título breve del tema o subtema que se está explicando (máximo 4 palabras)",
  "keyTerms": ["término1", "término2"]
}

Criterios de Categoría:
- "concepto_clave": Definiciones teóricas, conceptos del ramo, explicaciones pedagógicas de fondo.
- "formula": Ecuaciones, derivaciones, propiedades matemáticas o cálculos algebraicos.
- "importancia": Frases de énfasis docente ("ojo con esto", "pregunta de examen", "esto es fundamental").
- "digresion": Anécdotas personales, chistes, avisos de recreo, comentarios del clima o fútbol, desvaríos fuera de la materia.`;

  const userPrompt = `Contexto previo reciente de la clase:\n${prevContext || '(Inicio de clase)'}\n\nNueva frase recién capturada:\n"${text}"\n\nResponde únicamente el JSON:`;

  try {
    if (GROQ_API_KEY) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 300
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawJson = data.choices?.[0]?.message?.content?.trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          return {
            speakerRole: parsed.speakerRole || 'profesor',
            category: parsed.category || fallback.category,
            cleanedText: parsed.cleanedText || text.trim(),
            chapterTitle: parsed.chapterTitle || fallback.chapterTitle,
            keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : []
          };
        }
      }
    }
  } catch (err) {
    console.warn('[labelAndCleanSegment] Error con Qwen, usando heurística:', err.message);
  }

  return fallback;
}

function detectHeuristicCategory(text) {
  const low = text.toLowerCase();
  if (low.includes('=') || low.includes('suma') || low.includes('dividido') || low.includes('integral') || low.includes('derivada') || low.includes('al cuadrado')) {
    return 'formula';
  }
  if (low.includes('ojo') || low.includes('importante') || low.includes('prueba') || low.includes('examen') || low.includes('recuerden')) {
    return 'importancia';
  }
  if (low.includes('el otro día') || low.includes('fútbol') || low.includes('partido') || low.includes('almorzar') || low.includes('chiste')) {
    return 'digresion';
  }
  return 'concepto_clave';
}

/**
 * 3. Métricas de Ritmo y Oratoria en Tiempo Real (Estilo Read.ai)
 */
export function calculatePaceMetrics(entries = []) {
  if (entries.length === 0) {
    return {
      currentWpm: 0,
      averageWpm: 0,
      paceStatus: 'pausado',
      paceLabel: '0 PPM (En espera)',
      totalWords: 0
    };
  }

  let totalWords = 0;
  entries.forEach(e => {
    const words = (e.text || '').trim().split(/\s+/).filter(Boolean).length;
    totalWords += words;
  });

  // Calcular WPM sobre los últimos 60 segundos
  const lastEntries = entries.slice(-6);
  let recentWords = 0;
  lastEntries.forEach(e => {
    const w = (e.text || '').trim().split(/\s+/).filter(Boolean).length;
    recentWords += w;
  });
  
  // Estimando intervalo reciente (~30 segundos si hay 6 chunks de 5s)
  const recentMinutes = Math.max(0.5, (lastEntries.length * 5) / 60);
  const currentWpm = Math.round(recentWords / recentMinutes);

  let paceStatus = 'optimo';
  let paceLabel = `${currentWpm} PPM (Ritmo Óptimo)`;

  if (currentWpm > 165) {
    paceStatus = 'rapido';
    paceLabel = `${currentWpm} PPM (Hablando Rápido ⚠️)`;
  } else if (currentWpm < 90 && currentWpm > 0) {
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

/**
 * 4. Tutor Pedagógico con Citas Interactivas, Escalera Socrática y Modo Pizarra
 */
export async function answerStudentQuestion({
  question,
  course,
  liveEntries = [],
  teacherSettings = { chatState: 'active', allowComplement: true, hideDigressions: true },
  currentTimeFormatted = '00:00'
}) {
  // 1. Control Docente: Si el profesor puso Modo Pizarra, pausar el chat
  if (teacherSettings.chatState === 'paused') {
    return {
      status: 'paused',
      answer: `⏸️ **Modo Pizarra Activo**\n\nEl profesor ha pausado temporalmente el chat para que todos presten atención a la explicación en la pizarra. Tu pregunta ha quedado guardada en espera para cuando el profesor reactive el chat.`,
      sources: []
    };
  }

  // 2. Construir Contexto Estructurado con Citas Verificables
  let contextBlocks = [];

  // A. Historial de Clases Previas
  if (course.historicalClasses && course.historicalClasses.length > 0) {
    course.historicalClasses.forEach(hc => {
      let fText = (hc.keyFormulas || []).map(f => `  - $${f}$`).join('\n');
      contextBlocks.push(`[${hc.id}] (Historial del Curso — ${hc.title}):\n${hc.summary}\nFórmulas clave:\n${fText}`);
    });
  }

  // B. Materiales y Guías
  if (course.materials && course.materials.length > 0) {
    course.materials.forEach(mat => {
      contextBlocks.push(`[${mat.id}] (Material del Curso — ${mat.title}, ${mat.pages}):\n${mat.content}`);
    });
  }

  // C. Transcripción en Vivo de la Clase de Hoy
  const validLiveEntries = liveEntries.filter(entry => {
    if (teacherSettings.hideDigressions && entry.category === 'digresion') {
      return false;
    }
    return true;
  });

  if (validLiveEntries.length > 0) {
    validLiveEntries.forEach((entry, idx) => {
      const segId = `VIVO-${idx + 1}`;
      contextBlocks.push(`[${segId}] (Dicho en clase en min [${entry.timestamp}] por ${entry.speaker}):\n${entry.text}`);
    });
  }

  const fullContextText = contextBlocks.join('\n\n---\n\n');

  // 3. System Prompt Pedagógico y Reglas de Citas
  const systemInstruction = `Eres "Cátedra Viva", el tutor pedagógico inteligente del curso universitario "${course.code} — ${course.name}", dictado por el ${course.instructor}.
Tu misión es acompañar a los estudiantes durante la clase presencial resolviendo dudas con rigor académico, empatía y honestidad sobre las fuentes.

REGLAS CRÍTICAS DE CONTROL Y RESPUESTA:

1. CITAS OBLIGATORIAS VERIFICABLES:
- Cada afirmación teórica, fórmula o referencia a lo dicho DEBE citar obligatoriamente la etiqueta exacta de donde la obtuviste (ejemplo: "[VIVO-2]", "[HIST-M1]" o "[MAT-M1]").
- La interfaz del estudiante convertirá automáticamente estas etiquetas en botones clicables interactivos (ej: "min 00:25", "Clase 1"). No inventes etiquetas.

2. TRES MODOS DE RESPUESTA SEGÚN EL TIPO DE PREGUNTA:
A. Factual o Logística (ej. "¿cuándo es la entrega?", "¿qué valor tiene la constante?"):
   - Responde de forma directa, concisa y citando la fuente.
B. Conceptual (ej. "¿por qué la curva IS tiene pendiente negativa?", "¿qué es el Teorema de Bayes?"):
   - Explica el concepto con claridad, usando ejemplos y notación matemática formal en LaTeX con $...$ o $$...$$.
C. Ejercicio o Cálculo Práctico (ESCALERA SOCRÁTICA EN 5 NIVELES):
   - Si el estudiante plantea un ejercicio o pregunta cómo calcularlo, NO regales la respuesta en el primer turno para evitar la atrofia del aprendizaje.
   - Nivel 1 (Pista Conceptual): Identifica las fórmulas o teoremas aplicables y pregúntale cuál es el primer paso.
   - Nivel 2-4: Guía paso a paso según lo que el alumno intente.
   - Nivel 5 (Si el alumno explícitamente se rinde o pide la solución completa): Muestra el desarrollo algebraico paso a paso en LaTeX y CIERRA OBLIGATORIAMENTE con una breve pregunta de verificación conceptual ("¿Qué pasaría si cambiamos este valor?").

3. COMPLEMENTO DEL TUTOR:
${teacherSettings.allowComplement 
  ? `- El profesor ha HABILITADO el complemento de la IA. Si la respuesta se beneficia de una analogía o ejemplo extra que NO se dijo textualmente en clase, escribe primero la respuesta basada en fuentes y luego, en una nueva línea separada, escribe exactamente la marca "@@COMPLEMENTO@@" seguida de tu explicación adicional (la app la pondrá en un recuadro violeta de IA).`
  : `- El profesor ha DESHABILITADO el complemento externo. Responde EXCLUSIVAMENTE con lo que está en el contexto entregado.`}

4. FILTRO DE ALCANCE Y HONESTIDAD (SIN FUENTE):
- Si la pregunta es sobre temas que NO están en la transcripción ni en el material del curso (o temas off-topic como fútbol, chistes o geografía):
  DEBES responder EXACTAMENTE:
  "Eso no se ha visto en esta clase ni en el material del curso. ¿Quieres que se lo pregunte al profesor?"`;

  const userPrompt = `[ESTADO ACTUAL DE LA CLASE EN VIVO]
Minuto de la clase: ${currentTimeFormatted}

[CONTEXTO DE FUENTES VERIFICABLES DISPONIBLES]:
${fullContextText || '(La clase recién comienza, aún no hay material ni intervenciones)'}

[PREGUNTA DEL ESTUDIANTE]:
"${question}"

Genera tu respuesta pedagógica en Markdown con notación LaTeX:`;

  // 4. Inferencia con Pool de Modelos en Cascada (Groq Qwen 27B / GPT-OSS 120B -> Gemini 3.8 Flash)
  let rawAnswer = '';

  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 800
        })
      });

      if (res.ok) {
        const data = await res.json();
        rawAnswer = data.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch (err) {
      console.warn('[answerStudentQuestion] Fallo con Groq Qwen 27B:', err.message);
    }
  }

  if (!rawAnswer && GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        rawAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      }
    } catch (e) {
      console.warn('[answerStudentQuestion] Fallo en fallback Gemini:', e.message);
    }
  }

  if (!rawAnswer) {
    throw new Error('No se pudo obtener respuesta de ningún motor de IA.');
  }

  // Separar complemento IA si existe
  let mainAnswer = rawAnswer;
  let complementText = null;

  if (rawAnswer.includes('@@COMPLEMENTO@@')) {
    const parts = rawAnswer.split('@@COMPLEMENTO@@');
    mainAnswer = parts[0].trim();
    complementText = parts[1].trim();
  }

  return {
    status: 'ok',
    answer: mainAnswer,
    complement: complementText,
    timestamp: new Date().toISOString()
  };
}

/**
 * 5. Generar Resumen Post-Clase para guardar en RAG Histórico
 */
export async function generateClassSummary(course, liveEntries = []) {
  const fullTranscript = liveEntries.map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n');

  const systemInstruction = `Eres un asistente académico experto. Analiza la siguiente transcripción de clase del curso "${course.name}" y genera un resumen conciso estructurado para archivar en la base de datos histórica.
Responde un JSON con:
{
  "title": "Título temático de la sesión",
  "summary": "Resumen en 2-3 párrafos de las ideas principales",
  "keyFormulas": ["fórmula 1 en LaTeX", "fórmula 2 en LaTeX"]
}`;

  try {
    if (GROQ_API_KEY) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: fullTranscript || 'Sin transcripción' }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });

      if (res.ok) {
        const data = await res.json();
        return JSON.parse(data.choices?.[0]?.message?.content);
      }
    }
  } catch (err) {
    console.warn('[generateClassSummary] Error:', err.message);
  }

  return {
    title: `Sesión de ${course.name}`,
    summary: 'Resumen generado automáticamente a partir de las intervenciones del aula.',
    keyFormulas: []
  };
}
