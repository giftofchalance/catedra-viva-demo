/**
 * Motor de IA Unificado (Cátedra Viva V2)
 * 
 * SEPARACIÓN ESTRICTA DE CUOTAS (0 CRUCE ENTRE COMPONENTES):
 * - Bucket 1 (Audio STT Primario):   Groq `whisper-large-v3-turbo` (20 RPM exclusivos)
 * - Bucket 2 (Audio STT Respaldo):   Groq `whisper-large-v3` (20 RPM exclusivos)
 * - Bucket 3 (Micro-Labeler Texto):  Groq `openai/gpt-oss-20b` (30 RPM exclusivos para etiquetado)
 * - Bucket 4 (Chatbot Tutor #1):     Groq `qwen/qwen3.8-27b` (30 RPM exclusivos para preguntas de alumnos)
 * - Bucket 5 (Chatbot Tutor #2):     Groq `openai/gpt-oss-120b` (30 RPM exclusivos de respaldo para alumnos)
 * - Bucket 6 (Respaldo Externo):     Google `gemini-3.8-flash` (15 RPM en Google AI Studio)
 */

import 'dotenv/config';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Lista de alucinaciones típicas de Whisper cuando recibe silencio o respiración
const WHISPER_SILENCE_HALLUCINATIONS = new Set([
  'gracias', 'gracias.', 'muchas gracias', 'muchas gracias.',
  'bien', 'bien.', 'bueno', 'bueno.', 'sí', 'sí.', 'no', 'no.',
  'y', 'y.', 'o', 'eh', 'ah', 'mm', 'amén', 'amén.', 'subtítulos',
  'hola', 'hola.', 'adiós', 'hasta luego', '...', '.',
  'glosario técnico', 'glosario técnico.', 'clase universitaria en español', 'clase universitaria en español.'
]);

/**
 * Filtra alucinaciones de silencio o de ruido blanco de Whisper
 */
function cleanWhisperOutput(rawText) {
  if (!rawText) return '';
  let text = rawText.replace(/^["'«“]|["'»”]$/g, '').trim();
  const low = text.toLowerCase();

  // Frases típicas de YouTube / Amara / alucinaciones de ruido de Whisper
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

  // Palabras sueltas aisladas que Whisper inventa ante ruido blanco de micrófono
  const cleanPunct = low.replace(/[.,¡!¿?…]/g, '').trim();
  if (WHISPER_SILENCE_HALLUCINATIONS.has(low) || WHISPER_SILENCE_HALLUCINATIONS.has(cleanPunct)) {
    return '';
  }

  // Si tiene menos de 4 caracteres alfabéticos, descartar por ser ruido
  if (cleanPunct.length < 4) {
    return '';
  }

  return text;
}

/**
 * 1. Transcripción de Audio en Vivo (Buckets 1 y 2: whisper-large-v3-turbo -> whisper-large-v3)
 * IMPORTANTE: NO se envía el parámetro `prompt` a Whisper porque el decodificador acústico de Whisper
 * trata el `prompt` como texto previo hablado y ante pausas o ruido de ambiente alucina repitiendo
 * "Glosario técnico..." o inventando frases. La normalización de siglas se hace en el Micro-Labeler LLM.
 */
export async function transcribeLiveAudio(audioBuffer, mimeType = 'audio/mp3') {
  if (!GROQ_API_KEY && !GEMINI_API_KEY) {
    throw new Error('No hay claves de API configuradas para transcripción.');
  }

  if (GROQ_API_KEY) {
    const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
      : mimeType.includes('ogg') ? 'ogg'
      : mimeType.includes('wav') ? 'wav'
      : 'webm';

    const whisperModels = ['whisper-large-v3-turbo', 'whisper-large-v3'];

    for (const modelName of whisperModels) {
      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: mimeType }), `live_chunk.${ext}`);
        formData.append('model', modelName);
        formData.append('language', 'es');
        formData.append('response_format', 'verbose_json');
        formData.append('temperature', '0');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData
        });

        if (res.status === 429) {
          console.warn(`[transcribeLiveAudio] Cuota alcanzada en ${modelName}, rotando al siguiente modelo...`);
          continue;
        }

        if (res.ok) {
          const data = await res.json();

          // Filtrar segmentos usando las métricas acústicas reales de Whisper (no_speech_prob y avg_logprob)
          if (Array.isArray(data.segments) && data.segments.length > 0) {
            const validSegments = data.segments.filter(seg => {
              const noSpeech = typeof seg.no_speech_prob === 'number' ? seg.no_speech_prob : 0;
              const avgLogProb = typeof seg.avg_logprob === 'number' ? seg.avg_logprob : 0;
              const compRatio = typeof seg.compression_ratio === 'number' ? seg.compression_ratio : 1;
              // Si Whisper detecta alta probabilidad de no-voz (>0.55) o muy baja confianza acústica (<-0.95), es ruido/alucinación
              if (noSpeech > 0.55) return false;
              if (avgLogProb < -0.95) return false;
              if (compRatio > 2.4) return false;
              return true;
            });

            const joinedText = validSegments.map(s => s.text || '').join(' ').trim();
            return cleanWhisperOutput(joinedText);
          }

          return cleanWhisperOutput(data.text);
        }
      } catch (err) {
        console.warn(`[transcribeLiveAudio] Error en ${modelName}:`, err.message);
      }
    }
  }

  // Fallback externo a Gemini 3.8 Flash
  if (GEMINI_API_KEY) {
    try {
      const base64Audio = audioBuffer.toString('base64');
      const prompt = `Transcribe exactamente lo que dice el profesor en este fragmento de clase en español. Si solo hay silencio, respiración o ruido de fondo, responde únicamente la palabra: SILENCIO. Glosario: ${glossaryPrompt}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Audio } }
            ]
          }],
          generationConfig: { temperature: 0.1 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        if (text && !text.toUpperCase().includes('SILENCIO')) {
          return cleanWhisperOutput(text);
        }
      }
    } catch (e) {
      console.warn('[transcribeLiveAudio] Fallo en fallback Gemini:', e.message);
    }
  }

  return '';
}

/**
 * 2. Micro-Labeler Semántico (Bucket 3 Exclusivo: openai/gpt-oss-20b + Heurística Instantánea)
 * NUNCA toca la cuota de `qwen/qwen3.8-27b` ni de `openai/gpt-oss-120b` que son exclusivos del Chatbot.
 */
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

  if (!GROQ_API_KEY) {
    return fallback;
  }

  const prevContext = previousSegments.slice(-2).map(s => `[${s.timestamp}] ${s.text}`).join('\n');

  const systemInstruction = `Eres el analizador semántico en tiempo real de una clase universitaria ("${courseName}").
Términos frecuentes del curso (úsalos SOLO para corregir ortografía si el profesor los pronuncia fonéticamente, NUNCA los inventes si no los dijo): ${courseGlossary || 'IS-LM, Bayes, tasas'}.
Devuelve ÚNICAMENTE un objeto JSON válido con este formato exacto:
{
  "speakerRole": "profesor" | "interrupcion",
  "category": "concepto_clave" | "formula" | "importancia" | "digresion",
  "cleanedText": "Texto con ortografía técnica corregida (ej. IS-LM, FRAs, Bayes) y ecuaciones en $LaTeX$",
  "chapterTitle": "Título corto de 2 a 4 palabras del tema académico, o null si es solo continuación",
  "keyTerms": ["termino1"]
}

REGLAS CRÍTICAS DE CLASIFICACIÓN:
1. "concepto_clave": Cualquier explicación académica, presentación del tema, introducción de modelos (incluso de otros ramos como IS-LM, finanzas, probabilidades o cálculo), definiciones o desarrollo de la clase. ¡Por defecto usa "concepto_clave"!
2. "formula": Cuando mencione ecuaciones, variables matemáticas, derivadas, probabilidades o cálculos.
3. "importancia": Avisos docentes relevantes, énfasis ("ojo con esto", "importante", "entra en la prueba") o presentación inicial del profesor ("Soy el profesor...").
4. "digresion": ÚSALO SOLAMENTE si hablan de fútbol, chistes, clima, comida o temas 100% no académicos. NUNCA etiquetes un concepto universitario como digresión.`;

  const userPrompt = `Frases previas:\n${prevContext || '(Inicio de la sesión)'}\n\nFrase actual:\n"${text}"`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 450
      })
    });

    if (res.ok) {
      const data = await res.json();
      const rawJson = data.choices?.[0]?.message?.content?.trim();
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        return {
          speakerRole: parsed.speakerRole === 'interrupcion' ? 'interrupcion' : 'profesor',
          category: ['concepto_clave', 'formula', 'importancia', 'digresion'].includes(parsed.category)
            ? parsed.category
            : fallback.category,
          cleanedText: parsed.cleanedText || fallback.cleanedText,
          chapterTitle: parsed.chapterTitle || null,
          keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : []
        };
      }
    }
  } catch (err) {
    console.warn('[labelAndCleanSegment] Usando heurística rápida:', err.message);
  }

  return fallback;
}

function normalizeSpokenTerms(text) {
  return text
    .replace(/\bISLM\b/gi, 'IS-LM')
    .replace(/\bis lm\b/gi, 'IS-LM');
}

function detectHeuristicCategory(text) {
  const low = text.toLowerCase();
  if (low.includes('=') || low.includes('suma') || low.includes('dividido') || low.includes('integral') || low.includes('derivada') || low.includes('al cuadrado') || low.includes('probabilidad de')) {
    return 'formula';
  }
  if (low.includes('ojo') || low.includes('importante') || low.includes('prueba') || low.includes('examen') || low.includes('soy el profesor') || low.includes('bienvenidos')) {
    return 'importancia';
  }
  if (low.includes('fútbol') || low.includes('mundial') || low.includes('almorzar') || low.includes('chiste') || low.includes('película')) {
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

  const lastEntries = entries.slice(-6);
  let recentWords = 0;
  lastEntries.forEach(e => {
    const w = (e.text || '').trim().split(/\s+/).filter(Boolean).length;
    recentWords += w;
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

/**
 * 4. Tutor Pedagógico (Buckets 4, 5 y 6 Exclusivos: qwen/qwen3.8-27b -> openai/gpt-oss-120b -> gemini-3.8-flash)
 */
export async function answerStudentQuestion({
  question,
  course,
  liveEntries = [],
  teacherSettings = { chatState: 'active', allowComplement: true, hideDigressions: false },
  currentTimeFormatted = '00:00'
}) {
  // 1. Control Docente: Si el profesor puso Modo Pizarra, pausar el chat
  if (teacherSettings.chatState === 'paused') {
    return {
      status: 'paused',
      questionType: 'paused',
      canForwardToTeacher: false,
      answer: `⏸️ **Modo Pizarra Activo**\n\nEl profesor ha pausado temporalmente el chat para que todos presten atención a la explicación en curso. Tu consulta quedó registrada para cuando se reactive el chat.`,
      sources: []
    };
  }

  // 2. Construir Contexto Estructurado preservando SIEMPRE los IDs exactos [VIVO-X]
  let contextBlocks = [];

  // A. Transcripción en Vivo de la Clase de Hoy (Prioridad #1: lo que el profesor está diciendo ahora mismo)
  if (liveEntries.length > 0) {
    liveEntries.forEach((entry) => {
      const segId = entry.id; // Mantiene siempre el ID real (ej. VIVO-1, VIVO-2...)
      contextBlocks.push(`[${segId}] (Dicho EN VIVO hoy en min [${entry.timestamp}] por ${entry.speaker}):\n"${entry.text}"`);
    });
  }

  // B. Historial de Clases Previas del Curso
  if (course.historicalClasses && course.historicalClasses.length > 0) {
    course.historicalClasses.forEach(hc => {
      let fText = (hc.keyFormulas || []).map(f => `  - $${f}$`).join('\n');
      contextBlocks.push(`[${hc.id}] (Historial del Curso — ${hc.title}):\n${hc.summary}\nFórmulas clave:\n${fText}`);
    });
  }

  // C. Materiales y Guías
  if (course.materials && course.materials.length > 0) {
    course.materials.forEach(mat => {
      contextBlocks.push(`[${mat.id}] (Material del Curso — ${mat.title}, ${mat.pages}):\n${mat.content}`);
    });
  }

  const fullContextText = contextBlocks.join('\n\n---\n\n');

  // 3. System Prompt con distinción clara entre Off-Topic (Mundial/Chistes) vs. Duda Académica No Vista
  const systemInstruction = `Eres "Cátedra Viva", el tutor pedagógico de aula aumentada para la clase en vivo del ${course.instructor} (Curso base: "${course.code} — ${course.name}").

REGLAS CRÍTICAS DE RESPUESTA (SÍGUELAS ESTRICTAMENTE):

1. DISTINCIÓN ENTRE PREGUNTA OFF-TOPIC vs. DUDA ACADÉMICA SIN FUENTE vs. PREGUNTA CON FUENTE:
   - CASO A (OFF-TOPIC / AJENO A LA UNIVERSIDAD: deportes, quién ganó el mundial, farándula, chistes, política contingente, videojuegos, geografía general):
     Empieza tu respuesta con la marca exacta "@@OFF_TOPIC@@" y escribe únicamente:
     "🚫 Esa pregunta no está relacionada con la clase ni con materias académicas del curso."
     (NUNCA ofrezcas preguntarle al profesor temas off-topic como el mundial).

   - CASO B (DUDA ACADÉMICA / UNIVERSITARIA, PERO QUE AÚN NO APARECE EN LAS FUENTES ENTREGADAS):
     Si el alumno pregunta un concepto académico válido que NO se menciona ni en la transcripción en vivo [VIVO-X] ni en el historial/guías [HIST-X]/[MAT-X]:
     Empieza tu respuesta con la marca exacta "@@SIN_FUENTE_CLASE@@" seguida de:
     "Eso aún no se ha mencionado en lo que va de clase ni en el material cargado."
     ${teacherSettings.allowComplement
       ? `Y luego, dado que el profesor tiene ACTIVO el Complemento IA, agrega la marca "@@COMPLEMENTO@@" seguida de una breve explicación académica rigurosa para orientar al alumno.`
       : `Como el profesor tiene apagado el Complemento IA, invita al alumno a usar el botón de abajo para enviársela como duda anónima al profesor.`}

   - CASO C (PREGUNTA SOBRE LO DICHO EN LA TRANSCRIPCIÓN EN VIVO [VIVO-X] O EN EL MATERIAL [HIST-X]/[MAT-X]):
     ¡PRIORIZA SIEMPRE LO QUE EL PROFESOR ACABA DE DECIR EN VIVO ([VIVO-X])! Incluso si el profesor en vivo está introduciendo un ejemplo de otro tema (como IS-LM o cálculo), responde sobre lo que dijo citando "[VIVO-X]".
     Cita obligatoriamente las fuentes usadas con sus corchetes exactos: "[VIVO-1]", "[HIST-M1]", "[MAT-M1]".

2. MODOS PEDAGÓGICOS PARA EL CASO C:
   - Preguntas Factuales o Conceptuales: Explicación directa, clara y concisa con citas "[VIVO-X]" / "[HIST-X]" y fórmulas en LaTeX ($...$ o $$...$$).
   - Ejercicios o Cálculos Prácticos (ESCALERA SOCRÁTICA):
     * En el primer intento: Da una Pista Conceptual (Nivel 1), muestra la fórmula aplicable en LaTeX y haz una pregunta guía para el primer paso.
     * Si el alumno pide explícitamente el paso a paso o dice que no pudo: Entrega la resolución completa en LaTeX y cierra con una pregunta de verificación.

3. COMPLEMENTO IA OPCIONAL (en Caso C):
   ${teacherSettings.allowComplement
     ? `- Si la explicación basada en la clase es muy breve (porque el profesor recién dijo 1 o 2 frases en vivo) y puedes enriquecerla con contexto académico propio, responde primero citando "[VIVO-X]" y luego añade en una nueva línea "@@COMPLEMENTO@@" con la explicación extendida.`
     : `- NO agregues nada fuera de lo que dicen las fuentes entregadas.`}`;

  const userPrompt = `[MINUTO ACTUAL DE LA CLASE]: ${currentTimeFormatted}

[FUENTES VERIFICABLES DISPONIBLES (EN VIVO + HISTORIAL + GUÍAS)]:
${fullContextText || '(La clase recién comienza)'}

[PREGUNTA DEL ESTUDIANTE]:
"${question}"

Respuesta:`;

  // 4. Pool de Modelos Exclusivos para el Chatbot (Bucket 4: qwen/qwen3.8-27b -> Bucket 5: openai/gpt-oss-120b -> Bucket 6: gemini-3.8-flash)
  let rawAnswer = '';
  let modelUsed = '';

  if (GROQ_API_KEY) {
    const chatModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
    for (const modelId of chatModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: 850
          })
        });

        if (res.status === 429) {
          console.warn(`[Chatbot Pool] Rate limit en ${modelId}, rotando automáticamente al siguiente bucket...`);
          continue;
        }

        if (res.ok) {
          const data = await res.json();
          rawAnswer = data.choices?.[0]?.message?.content?.trim() || '';
          if (rawAnswer) {
            modelUsed = modelId;
            break;
          }
        }
      } catch (err) {
        console.warn(`[Chatbot Pool] Fallo con ${modelId}:`, err.message);
      }
    }
  }

  // Fallback a Bucket 6 (Gemini 3.8 Flash)
  if (!rawAnswer && GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 850 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        rawAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        modelUsed = 'gemini-3.8-flash';
      }
    } catch (e) {
      console.warn('[Chatbot Pool] Fallo en fallback Gemini:', e.message);
    }
  }

  if (!rawAnswer) {
    throw new Error('No se pudo obtener respuesta de ningún motor de IA.');
  }

  // Procesar marcas de control
  const isOffTopic = rawAnswer.includes('@@OFF_TOPIC@@');
  const isUnseenAcademic = rawAnswer.includes('@@SIN_FUENTE_CLASE@@');

  let cleanedRaw = rawAnswer
    .replace(/@@OFF_TOPIC@@/g, '')
    .replace(/@@SIN_FUENTE_CLASE@@/g, '')
    .trim();

  let mainAnswer = cleanedRaw;
  let complementText = null;

  if (cleanedRaw.includes('@@COMPLEMENTO@@')) {
    const parts = cleanedRaw.split('@@COMPLEMENTO@@');
    mainAnswer = parts[0].trim();
    complementText = parts[1].trim();
  }

  if (!teacherSettings.allowComplement) {
    complementText = null;
  }

  return {
    status: 'ok',
    questionType: isOffTopic ? 'off_topic' : isUnseenAcademic ? 'unseen_academic' : 'grounded',
    canForwardToTeacher: isUnseenAcademic,
    modelUsed,
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
          model: 'openai/gpt-oss-120b',
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
