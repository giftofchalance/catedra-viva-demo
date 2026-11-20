/**
 * Motor de IA Unificado (Cátedra Viva V2)
 * 
 * SEPARACIÓN ESTRICTA DE CUOTAS (0 CRUCE ENTRE COMPONENTES):
 * - Bucket 1 (Audio STT Primario):   Groq `whisper-large-v3-turbo` (20 RPM exclusivos)
 * - Bucket 2 (Audio STT Respaldo):   Groq `whisper-large-v3` (20 RPM exclusivos)
 * - Bucket 3 (Micro-Labeler Texto):  Groq `openai/gpt-oss-20b` (30 RPM exclusivos para etiquetado)
 * - Bucket 4 (Chatbot Tutor #1):     Groq `qwen/qwen3.8-27b` (30 RPM exclusivos para preguntas de alumnos)
 * - Bucket 5 (Chatbot Tutor #2):     Groq `openai/gpt-oss-120b` (30 RPM exclusivos de respaldo para alumnos)
 * - Bucket 6 (Respaldo Externo):     Google `gemini-3.5-flash-lite` (Respaldo rápido en Google AI Studio)
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
  'música', 'música.', '(música)', '[música]', 'musica',
  'aplausos', 'aplausos.', '(aplausos)', '[aplausos]',
  'silencio', 'silencio.',
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
  const cleanPunct = low.replace(/[.,¡!¿?…()[\]]/g, '').trim();
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

    // Usar PRIMERO whisper-large-v3 (modelo completo de 32 capas, máxima precisión en español técnico)
    // y como segundo bucket whisper-large-v3-turbo (20 RPM adicionales)
    const whisperModels = ['whisper-large-v3', 'whisper-large-v3-turbo'];

    for (const modelName of whisperModels) {
      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: mimeType }), `live_chunk.${ext}`);
        formData.append('model', modelName);
        formData.append('language', 'es');
        formData.append('response_format', 'json');
        formData.append('temperature', '0');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData,
          signal: AbortSignal.timeout(15000)
        });

        if (res.status === 429) {
          console.warn(`[transcribeLiveAudio] Cuota alcanzada en ${modelName}, rotando al siguiente modelo...`);
          continue;
        }

        if (res.ok) {
          const data = await res.json();
          return cleanWhisperOutput(data.text);
        }
      } catch (err) {
        console.warn(`[transcribeLiveAudio] Error en ${modelName}:`, err.message);
      }
    }
  }

  // Fallback externo a Gemini 3.5 Flash Lite
  if (GEMINI_API_KEY) {
    try {
      const base64Audio = audioBuffer.toString('base64');
      const prompt = 'Transcribe exactamente lo que dice el profesor en este fragmento de clase en español. Si solo hay silencio, música, respiración o ruido de fondo, responde únicamente la palabra: SILENCIO.';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
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
        }),
        signal: AbortSignal.timeout(15000)
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
Términos frecuentes del curso y afines (úsalos SOLO para corregir ortografía si el profesor los pronuncia fonéticamente, ej. "KPM" -> "CAPM", "ISLM" -> "IS-LM", NUNCA los inventes si no los dijo): ${courseGlossary || 'CAPM, IS-LM, beta, riesgo sistemático, riesgo idiosincrático, portafolio, varianza, Bayes'}.
Devuelve ÚNICAMENTE un objeto JSON válido con este formato exacto:
{
  "speakerRole": "profesor" | "interrupcion",
  "category": "concepto_clave" | "formula" | "importancia" | "digresion",
  "cleanedText": "Texto completo del profesor con ortografía técnica corregida (ej. CAPM, IS-LM, FRAs, Bayes) sin resumir ni omitir palabras",
  "chapterTitle": "Título corto de 2 a 4 palabras del tema académico, o null si es solo continuación",
  "keyTerms": ["termino1"]
}

REGLAS CRÍTICAS DE CLASIFICACIÓN:
1. "concepto_clave": Cualquier explicación académica, presentación del tema, introducción de modelos (incluso de otros ramos como IS-LM, finanzas, probabilidades o cálculo), definiciones o desarrollo de la clase. Si el profesor usa una metáfora o ejemplo cotidiano (ej. fútbol, canasta de huevos, casino, cocina) PARA EXPLICAR un concepto del curso, clasifícalo SIEMPRE como "concepto_clave", NUNCA como "digresion". ¡Por defecto usa "concepto_clave"!
2. "formula": Cuando mencione ecuaciones, variables matemáticas, derivadas, probabilidades o cálculos.
3. "importancia": Avisos docentes relevantes, énfasis ("ojo con esto", "importante", "entra en la prueba") o presentación inicial del profesor ("Soy el profesor...").
4. "digresion": ÚSALO ÚNICAMENTE cuando sea charla 100% desconectada de la materia (ej. avisos logísticos de sala, paraguas perdido, chiste aislado sin propósito pedagógico). NUNCA etiquetes un concepto ni una analogía docente como digresión.`;

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
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (res.status === 429) {
      console.warn('[labelAndCleanSegment] 429 en openai/gpt-oss-20b, usando heurística reforzada');
      return fallback;
    }

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
          cleanedText: normalizeSpokenTerms(parsed.cleanedText || fallback.cleanedText),
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
    .replace(/\bel BAC\b/g, 'el WACC')
    .replace(/\bel bac representa\b/gi, 'el WACC representa')
    .replace(/\bwacc\b/gi, 'WACC')
    .replace(/\buna tira alta\b/gi, 'una TIR alta')
    .replace(/\buna tir alta\b/gi, 'una TIR alta')
    .replace(/\bel ban\b/gi, 'el VAN')
    .replace(/\bevaluamos el van\b/gi, 'evaluamos el VAN')
    .replace(/\bsiempre el ban\b/gi, 'siempre el VAN');
}

function detectHeuristicCategory(text) {
  const low = text.toLowerCase();
  const hasAcademicTerm = /\b(diversific|riesgo|varianza|correlaci[oó]n|portafolio|capm|beta|wacc|van|tir|is-lm|curva is|curva lm|tasa de inter[eé]s|tipo de inter[eé]s|pib|inversi[oó]n|ahorro|banco central|pol[ií]tica fiscal|pol[ií]tica monetaria|bayes|probabilidad|ecuaci[oó]n|modelo|hip[oó]tesis|demanda|oferta|inflaci[oó]n|multiplicador|equilibrio|crowding out|derivada|integral|l[ií]mite|flujo de caja)\b/i.test(text);

  if (low.includes('=') || low.includes('suma') || low.includes('dividido') || low.includes('integral') || low.includes('derivada') || low.includes('al cuadrado') || low.includes('probabilidad de')) {
    return 'formula';
  }
  if (low.includes('ojo') || low.includes('importante') || low.includes('prueba') || low.includes('examen') || low.includes('soy el profesor') || low.includes('bienvenidos')) {
    return 'importancia';
  }
  if (!hasAcademicTerm && /(paraguas|porter[ií]a|pasillo|botado|entrada del edificio|estacionamiento|f[uú]tbol|mundial|almorzar|almuerzo|chiste|pel[ií]cula|netflix|clima|lluvia)/i.test(text)) {
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

// --------------------------------------------------------------------------
// CLUSTERING SEMÁNTICO DE TÓPICOS PARA RADAR DOCENTE / AUXILIAR
// --------------------------------------------------------------------------

const TOPIC_RULES = [
  {
    key: 'van_tir',
    label: 'Criterios VAN vs. TIR',
    keywords: ['van', 'tir', 'crear valor', 'crea valor', 'proyectos mutuamente'],
    suggestion: 'Aclarar en pizarra la diferencia entre tasa porcentual (TIR) y creación neta de riqueza en pesos (VAN).'
  },
  {
    key: 'wacc',
    label: 'Costo de Capital (WACC)',
    keywords: ['wacc', 'costo promedio', 'descontar flujos', 'financiamiento', 'deuda y patrimonio'],
    suggestion: 'Reforzar por qué el WACC debe ser consistente con el riesgo de los flujos de caja libres de la firma.'
  },
  {
    key: 'capm_beta',
    label: 'Modelo CAPM, Beta y Retorno',
    keywords: ['capm', 'beta', 'riesgo sistemático', 'sistematico', 'retorno exigido', 'retorno esperado', 'prima por riesgo', 'libre de riesgo'],
    suggestion: 'Enfatizar la distinción entre retorno esperado vs. exigido y que Beta solo mide riesgo sistemático.'
  },
  {
    key: 'portafolios',
    label: 'Portafolios y Diversificación',
    keywords: ['portafolio', 'diversific', 'idiosincrático', 'idiosincratico', 'correlación', 'correlacion', 'varianza'],
    suggestion: 'Mostrar con el ejemplo de 2 activos con ρ < 1 cómo cae la varianza sin sacrificar retorno esperado.'
  },
  {
    key: 'curva_is',
    label: 'Curva IS y Mercado de Bienes',
    keywords: ['curva is', 'mercado de bienes', 'gasto público', 'multiplicador', 'crowding out', 'inversión'],
    suggestion: 'Repasar cómo el aumento del gasto público eleva Y e i, generando desplazamiento parcial de la inversión.'
  },
  {
    key: 'curva_lm',
    label: 'Curva LM y Mercado Monetario',
    keywords: ['curva lm', 'mercado monetario', 'banco central', 'oferta monetaria', 'demanda de dinero', 'saldos reales'],
    suggestion: 'Explicar en 2 min por qué al subir el PIB crece la demanda de dinero y presiona al alza la tasa r.'
  },
  {
    key: 'equilibrio_islm',
    label: 'Equilibrio Simultáneo IS-LM',
    keywords: ['is-lm', 'islm', 'equilibrio simultáneo', 'un solo gráfico'],
    suggestion: 'Mostrar en la pizarra el cruce (r*, Y*) y el efecto combinado de políticas fiscales y monetarias.'
  },
  {
    key: 'bayes',
    label: 'Teorema de Bayes y Probabilidad Total',
    keywords: ['bayes', 'probabilidad total', 'partición', 'sensibilidad', 'especificidad', 'prevalencia', 'posteriori', 'priori'],
    suggestion: 'Dibujar el árbol de particiones B_i antes de aplicar la fórmula de Bayes para fijar la intuición.'
  },
  {
    key: 'independencia',
    label: 'Independencia vs. Eventos Disjuntos',
    keywords: ['independ', 'disjunt', 'condicional'],
    suggestion: 'Aclarar el error clásico: dos eventos disjuntos con P>0 nunca son independientes.'
  }
];

/**
 * Clasifica una pregunta o evento "Me perdí" en un tópico unificado del Radar Profe/Auxiliar.
 */
export function detectTopicCluster({ text = '', course, liveEntries = [], slideRef = null }) {
  const low = (text || '').toLowerCase();

  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some(kw => low.includes(kw))) {
      return {
        key: rule.key,
        label: rule.label,
        suggestion: rule.suggestion
      };
    }
  }

  // Intentar por slide asociada a la consulta o al último fragmento hablado
  if (slideRef && slideRef.title) {
    return {
      key: `slide_${slideRef.id}`,
      label: `Lámina ${slideRef.number}: ${slideRef.title}`,
      suggestion: `Reforzar la explicación verbal asociada a la Lámina ${slideRef.number} ("${slideRef.title}").`
    };
  }

  // Si es una señal de "Me perdí" sin texto o consulta general, asociar al último segmento con tema
  const lastEntry = liveEntries[liveEntries.length - 1];
  if (lastEntry) {
    const entryLow = (lastEntry.text || '').toLowerCase();
    for (const rule of TOPIC_RULES) {
      if (rule.keywords.some(kw => entryLow.includes(kw))) {
        return {
          key: rule.key,
          label: rule.label,
          suggestion: rule.suggestion
        };
      }
    }
    if (lastEntry.slideRef?.title) {
      return {
        key: `slide_${lastEntry.slideRef.id}`,
        label: `Lámina ${lastEntry.slideRef.number}: ${lastEntry.slideRef.title}`,
        suggestion: `Pausa breve recomendada en [${lastEntry.timestamp}]: revisar el último punto de "${lastEntry.slideRef.title}".`
      };
    }
    if (lastEntry.chapterTitle) {
      return {
        key: `ch_${lastEntry.chapterTitle.toLowerCase().replace(/\W+/g, '_')}`,
        label: lastEntry.chapterTitle,
        suggestion: `Repetir el concepto recién introducido en el minuto [${lastEntry.timestamp}].`
      };
    }
  }

  return {
    key: `general_${course?.id || 'curso'}`,
    label: `Duda General de ${course?.code || 'la Clase'}`,
    suggestion: 'Revisar el último bloque expuesto y confirmar si el paso clave quedó claro antes de avanzar.'
  };
}

// --------------------------------------------------------------------------
// TOKENOMICS SIN SESGO EPISTÉMICO (CACHÉ CON GUARDIA DE NEGACIÓN E INVALIDADOR TEMPORAL)
// --------------------------------------------------------------------------

const SAFE_SEMANTIC_CACHE = new Map();
const IN_FLIGHT_QUERIES = new Map();

export function clearSemanticCache() {
  SAFE_SEMANTIC_CACHE.clear();
  IN_FLIGHT_QUERIES.clear();
}

function extractLogicalSignature(text = '') {
  const low = text.toLowerCase();
  const negations = (low.match(/\b(no|nunca|jamás|jamas|sin|ni|tampoco|ningún|ninguna|falso|incorrecto|contrario|diferencia|distinto)\b/g) || []).sort().join(',');
  const operators = (low.match(/(<=|>=|!=|==|<|>|=|\+|\-|\d+(\.\d+)?)/g) || []).sort().join(',');
  return `${negations}|${operators}`;
}

function tokenizeSemanticCore(text = '') {
  const stopwords = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'en', 'y', 'o', 'a', 'que', 'es', 'un', 'una', 'por', 'para', 'con', 'se', 'como', 'cual', 'cuál', 'qué', 'me', 'puedes', 'explicar', 'profesor', 'profe', 'dijo']);
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

function computeJaccard(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let inter = 0;
  for (const item of setA) {
    if (setB.has(item)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function checkSafeSemanticCache({ question, courseId, chatMode, transcriptCount }) {
  const signature = extractLogicalSignature(question);
  const tokens = tokenizeSemanticCore(question);
  const normalizedExact = question.toLowerCase().replace(/[¿?¡!.,\s]+/g, ' ').trim();

  for (const [, cached] of SAFE_SEMANTIC_CACHE.entries()) {
    // 1. Mismo ramo y mismo modo (Seguimiento vs Full IA)
    if (cached.courseId !== courseId || cached.chatMode !== chatMode) continue;
    // 2. Invalidador Temporal (Temporal Drift): si la clase avanzó en transcripción, el contexto cambió -> NO usar caché viejo
    if (cached.transcriptCount !== transcriptCount) continue;
    // 3. Guardia de Negación y Matiz Numérico (Negation Blindness): si difieren en "no", números u operadores -> PROHIBIDO HIT
    if (cached.logicalSignature !== signature) continue;

    // 4. Coincidencia exacta o alta similitud estructural (>= 0.85 Jaccard)
    if (cached.normalizedExact === normalizedExact || computeJaccard(tokens, cached.tokens) >= 0.85) {
      return cached.payload;
    }
  }
  return null;
}

function recordSafeSemanticCache({ question, courseId, chatMode, transcriptCount, payload }) {
  if (!payload || payload.questionType === 'off_topic' || payload.status === 'paused') return;
  const key = `${courseId}:${chatMode}:${transcriptCount}:${question.toLowerCase().trim()}`;
  SAFE_SEMANTIC_CACHE.set(key, {
    courseId,
    chatMode,
    transcriptCount,
    normalizedExact: question.toLowerCase().replace(/[¿?¡!.,\s]+/g, ' ').trim(),
    logicalSignature: extractLogicalSignature(question),
    tokens: tokenizeSemanticCore(question),
    payload
  });
}

function estimateTokenMetrics({ fullContextText, question, answerText, fromCache }) {
  const approxPrefixTokens = Math.max(120, Math.round((fullContextText.length + 1400) / 4));
  const approxDeltaTokens = Math.max(15, Math.round(question.length / 4));
  const approxOutputTokens = Math.max(20, Math.round((answerText || '').length / 4));

  // Con Prefix Caching (vLLM on-premise o Prompt Caching), la sala comparte ~92% del prefijo de transcripción/RAG
  const savedByPrefixOrCache = fromCache
    ? approxPrefixTokens + approxDeltaTokens + approxOutputTokens
    : Math.round(approxPrefixTokens * 0.92);

  // Costo API Cloud promedio (~$0.60 / 1M input + $1.80 / 1M output para modelos medianos sin APC completo)
  const cloudCostNoOptUsd = ((approxPrefixTokens + approxDeltaTokens) * 0.60 + approxOutputTokens * 1.80) / 1000000;
  // Costo marginal GPU Universidad (RTX 4090 / L40S corriendo vLLM en electricidad ~0.000008 USD por query con APC)
  const onPremGpuMarginalUsd = fromCache ? 0 : 0.000008;

  return {
    fromCache,
    prefixTokens: approxPrefixTokens,
    deltaTokens: approxDeltaTokens,
    outputTokens: approxOutputTokens,
    savedTokens: savedByPrefixOrCache,
    cloudCostNoOptUsd: Number(cloudCostNoOptUsd.toFixed(6)),
    onPremGpuMarginalUsd
  };
}

function normalizeSearchText(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Guardia determinista anti-falso off-topic:
 * Detecta si la pregunta contiene términos académicos reales del curso o de TOPIC_RULES
 * (evita que premisas falsas como "curva IS pendiente positiva" sean rechazadas como off-topic).
 */
function hasCourseAcademicKeyword(question = '', course = null) {
  const normQ = normalizeSearchText(question);
  if (!normQ) return false;

  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some(kw => normQ.includes(normalizeSearchText(kw)))) {
      return true;
    }
  }

  const shortAcronyms = ['pib', 'van', 'tir', 'capm', 'wacc', 'is-lm', 'islm', 'curva is', 'curva lm'];
  for (const acr of shortAcronyms) {
    const escaped = acr.replace('-', '\\-');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(normQ)) {
      return true;
    }
  }

  const glossaryTerms = (course?.glossary || '')
    .split(',')
    .map(t => normalizeSearchText(t.trim()))
    .filter(t => t.length >= 4);

  if (glossaryTerms.some(term => normQ.includes(term))) {
    return true;
  }

  const slides = course?.ucursosSync?.slides || [];
  for (const sl of slides) {
    const slideKws = (sl.keywords || []).map(k => normalizeSearchText(k)).filter(k => k.length >= 4);
    if (slideKws.some(kw => normQ.includes(kw))) {
      return true;
    }
  }

  return false;
}

/**
 * Helper compartido para invocar Bucket 6 (gemini-3.5-flash-lite).
 */
async function callGeminiFlashLite({ promptText, temperature = 0.2, maxOutputTokens = 900, jsonMode = false }) {
  if (!GEMINI_API_KEY) return null;
  const generationConfig = { temperature, maxOutputTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

/**
 * 4. Tutor Pedagógico Modular en 3 Modos (Buckets 4, 5 y 6 Exclusivos: qwen/qwen3.8-27b -> openai/gpt-oss-120b -> gemini-3.5-flash-lite)
 * - chatState === 'paused'  -> Modo Pizarra (pausa respuestas, registra duda en Radar)
 * - chatState === 'active'  -> Modo Seguimiento y Participación (Default: 2-3 líneas + cómo preguntar en voz alta / Radar)
 * - chatState === 'full_ia' -> Modo Tutor Full IA (Desbloqueado por el Profe o en Post-Clase)
 */
export async function answerStudentQuestion({
  question,
  course,
  liveEntries = [],
  teacherSettings = { chatState: 'active', allowComplement: true, hideDigressions: false },
  currentTimeFormatted = '00:00',
  bypassCache = false
}) {
  const chatMode = teacherSettings.chatState || 'active';

  // 1. Control Docente: Modo Pizarra (Pausa)
  if (chatMode === 'paused') {
    return {
      status: 'paused',
      chatMode: 'paused',
      questionType: 'paused',
      canForwardToTeacher: false,
      voicePrompt: null,
      tokenMetrics: {
        fromCache: false,
        prefixTokens: 0,
        deltaTokens: 0,
        outputTokens: 0,
        savedTokens: 0,
        cloudCostNoOptUsd: 0,
        onPremGpuMarginalUsd: 0
      },
      answer: `⏸️ **Modo Pizarra Activo**\n\nEl profesor pausó temporalmente el chatbot para centrar la atención en la explicación presencial. Tu duda quedó registrada anónimamente en el **Radar del Profesor y Auxiliar**.`,
      sources: []
    };
  }

  // 2. Construir Contexto Estructurado (Láminas U-Cursos si existen + En Vivo [VIVO-X] + Historial + Materiales)
  let contextBlocks = [];

  // A. Transcripción en Vivo de la Clase de Hoy (Prioridad #1 + Compactación inteligente en clases extendidas >18 bloques)
  if (liveEntries.length > 0) {
    let selectedEntries = liveEntries;
    if (liveEntries.length > 18) {
      const recentStartIdx = liveEntries.length - 12;
      const qTokens = tokenizeSemanticCore(question);
      const earlierMatched = [];
      for (let idx = 0; idx < recentStartIdx; idx++) {
        const entry = liveEntries[idx];
        const low = (entry.text || '').toLowerCase();
        if (
          entry.category === 'importancia' ||
          entry.category === 'formula' ||
          qTokens.some(tk => low.includes(tk))
        ) {
          earlierMatched.push(entry);
        }
      }
      selectedEntries = [
        ...earlierMatched.slice(-8),
        ...liveEntries.slice(recentStartIdx)
      ];
    }
    selectedEntries.forEach((entry) => {
      const segId = entry.id;
      const slideTag = entry.slideRef ? ` | ${entry.slideRef.id}` : '';
      contextBlocks.push(`[${segId} | ${entry.timestamp}${slideTag}]: "${entry.text}"`);
    });
  }

  // B. Láminas Auto-Sincronizadas de U-Cursos (Si existen, sino degradación limpia a contexto plano)
  if (course.ucursosSync?.slides && course.ucursosSync.slides.length > 0) {
    course.ucursosSync.slides.forEach(sl => {
      contextBlocks.push(`[${sl.id}] (PPT U-Cursos — Lámina ${sl.number}: ${sl.title}):\n- ${(sl.bulletPoints || []).join('\n- ')}`);
    });
  }

  // C. Historial de Clases Previas del Curso
  if (course.historicalClasses && course.historicalClasses.length > 0) {
    course.historicalClasses.forEach(hc => {
      let fText = (hc.keyFormulas || []).map(f => `  - $${f}$`).join('\n');
      contextBlocks.push(`[${hc.id}] (Historial del Curso — ${hc.title}):\n${hc.summary}\nFórmulas clave:\n${fText}`);
    });
  }

  // D. Materiales y Guías
  if (course.materials && course.materials.length > 0) {
    course.materials.forEach(mat => {
      contextBlocks.push(`[${mat.id}] (Material del Curso — ${mat.title}, ${mat.pages}):\n${mat.content}`);
    });
  }

  const fullContextText = contextBlocks.join('\n\n---\n\n');

  // 3. Revisar Caché Semántico Seguro + Single-Flight Coalescing (Solo si no pidió enfoque alternativo y no cambió ni negación ni minuto/entradas)
  const normalizedFlightQ = question.toLowerCase().replace(/[¿?¡!.,\s]+/g, ' ').trim();
  const flightKey = `${course.id}:${chatMode}:${liveEntries.length}:${extractLogicalSignature(question)}:${normalizedFlightQ}`;

  if (!bypassCache) {
    const cachedHit = checkSafeSemanticCache({
      question,
      courseId: course.id,
      chatMode,
      transcriptCount: liveEntries.length
    });
    if (cachedHit) {
      return {
        ...cachedHit,
        fromCache: true,
        tokenMetrics: estimateTokenMetrics({
          fullContextText,
          question,
          answerText: cachedHit.answer + (cachedHit.complement || ''),
          fromCache: true
        })
      };
    }

    if (IN_FLIGHT_QUERIES.has(flightKey)) {
      const sharedPayload = await IN_FLIGHT_QUERIES.get(flightKey);
      return {
        ...sharedPayload,
        fromCache: true,
        tokenMetrics: estimateTokenMetrics({
          fullContextText,
          question,
          answerText: sharedPayload.answer + (sharedPayload.complement || ''),
          fromCache: true
        })
      };
    }
  }

  // 4. Instrucción Adaptativa Modular según Modo ('active' = Seguimiento corto vs 'full_ia' = Estudio profundo)
  const modeRules = chatMode === 'full_ia'
    ? `MODO ACTUAL: TUTOR FULL IA (POST-CLASE / DESBLOQUEADO POR EL PROFESOR)
- El profesor habilitó el modo de estudio profundo.
- Explica paso a paso con rigor universitario completo.
- Adaptación Modular Automática (sin importar el ramo, desde Electromagnetismo a Finanzas o Macro):
  * Si la duda es matemática/formal: incluye derivación clara en $LaTeX$ ($...$ o $$...$$) paso a paso y chequea supuestos.
  * Si la duda es conceptual/causal: explica intuición, mecanismo causa-efecto y contraste.
  * Si combina ambos (como Física, Electromagnetismo o Finanzas): une intuición física/económica + fórmula en $LaTeX$.
- Conecta explícitamente lo dicho hoy en vivo ([VIVO-X]) con las láminas ([SLIDE-X]) y clases previas ([HIST-X]).
- Cierra con 1 pregunta corta de chequeo conceptual para verificar que el estudiante entendió.`
    : `MODO ACTUAL: AULA EN VIVO — SEGUIMIENTO RÁPIDO Y PARTICIPACIÓN (MUY IMPORTANTE)
- EL PROFESOR SIGUE HABLANDO EN VIVO. NO escribas un ensayo largo que distraiga al estudiante de la clase.
- TU OBJETIVO ES QUE EL ALUMNO SE REENGANCHE EN 10 SEGUNDOS O LEVANTE LA MANO PARA PREGUNTAR AL PROFESOR.
- Reglas de longitud y formato para CASO C y CASO B:
  * Responde en MÁXIMO 2 a 3 líneas concisas y directas.
  * Adaptación Modular Automática según la pregunta: si requiere una fórmula puntual, incluye el término clave en $LaTeX$; si es conceptual, resume la relación causal en 1 frase clara; si mezcla ambos, únelos en máximo 3 líneas.
  * Cita siempre las fuentes exactas "[VIVO-X]", "[SLIDE-X]", "[HIST-X]" o "[MAT-X]".
  * ORDEN OBLIGATORIO DE SALIDA: Primero escribe SIEMPRE los 2 a 3 renglones de respuesta/corrección citando [VIVO-X] o [SLIDE-X]; NUNCA empieces con @@VOZ_ALTA@@. Coloca @@VOZ_ALTA@@ ÚNICAMENTE en la última línea después de tu respuesta.
  * OBLIGATORIO en dudas académicas (CASO C o CASO B): En esa última línea tras tu explicación, escribe "@@VOZ_ALTA@@" seguido de 1 sola pregunta corta, natural y respetuosa formulada en primera persona para que el estudiante se atreva a levantar la mano y preguntársela en voz alta al profesor (ej: "@@VOZ_ALTA@@ Profesor, respecto al CAPM, ¿eso significa que el riesgo idiosincrático no recibe premio en el retorno exigido?").`;

  const altAngleNote = bypassCache
    ? `\nNOTA EXTRA: El alumno pidió "Explicar desde otro ángulo". Usa una analogía distinta, otro ejemplo o enfoque diferente al habitual.`
    : '';

  const systemInstruction = `Eres "Cátedra Viva", el co-piloto pedagógico de aula para la clase de ${course.instructor} ("${course.code} — ${course.name}").

${modeRules}${altAngleNote}

ORDEN ESTRICTO DE PRIORIDAD AL RESPONDER:
1. PRIORIDAD 1 — DUDA ACADÉMICA DEL CURSO (EN FUENTES O CON PREMISA FALSA):
   Si la pregunta menciona cualquier concepto del ramo (incluso si contiene un error conceptual o premisa falsa, como atribuir una pendiente equivocada o invertir una definición), RESPONDE SIEMPRE como CASO C citando "[VIVO-X]", "[SLIDE-X]", "[HIST-X]" o "[MAT-X]".
   - ANTI-PREMISA FALSA: Si la premisa del estudiante contradice lo dicho por el profesor o las láminas, NO le sigas la corriente; corrige respetuosa y explícitamente la premisa citando "[VIVO-X]" o "[SLIDE-X]" antes de responder el resto.
   - DEIXIS TEMPORAL: Si el alumno pregunta por "lo último", "recién" o "esta parte" sin nombrar un concepto específico, enfócate directamente en los últimos 2 fragmentos "[VIVO-X]" más recientes de la transcripción en vivo.
   ${chatMode === 'full_ia' ? '- En Modo Full IA entrega aquí la explicación completa (intuición + fórmulas en $LaTeX$ + conexión histórica + pregunta de chequeo).' : ''}
   ${chatMode === 'full_ia' && teacherSettings.allowComplement ? '- Si agregas analogías o derivaciones que van más allá de lo escrito textualmente en las fuentes, colócalas después de "@@COMPLEMENTO@@".' : ''}

2. PRIORIDAD 2 — DUDA ACADÉMICA UNIVERSITARIA NO VISTA AÚN EN FUENTES:
   Solo si es un tema universitario válido cuyo concepto principal NO aparece ni en [VIVO-X], ni en [SLIDE-X], ni en [HIST-X], ni en [MAT-X], empieza con "@@SIN_FUENTE_CLASE@@" seguido de:
   "Eso aún no se ha mencionado en lo que va de clase ni en el material cargado."
   ${teacherSettings.allowComplement
     ? `Luego agrega "@@COMPLEMENTO@@" seguido de ${chatMode === 'active' ? '2 líneas de orientación breve.' : 'una explicación académica rigurosa.'}`
     : `Invita brevemente a enviarla al Radar del Profesor/Auxiliar.`}
   ${chatMode === 'active' ? 'Incluye además al final "@@VOZ_ALTA@@" con 1 frase sugerida para preguntarle si lo veremos hoy.' : ''}

3. ÚLTIMO RECURSO — ESTRICTAMENTE OFF-TOPIC:
   ÚNICAMENTE para temas 100% ajenos a la universidad (fútbol, farándula, chistes, videojuegos, capitales de países), responde exclusivamente:
   "@@OFF_TOPIC@@ 🚫 Esa pregunta no está relacionada con la clase ni con materias académicas del curso."
   (Sin @@VOZ_ALTA@@ ni @@COMPLEMENTO@@).`;

  const userPrompt = `[MINUTO ACTUAL]: ${currentTimeFormatted}

[FUENTES VERIFICABLES]:
${fullContextText || '(La clase recién comienza)'}

[PREGUNTA DEL ESTUDIANTE]:
"${question}"

Respuesta:`;

  // 5. Pool Exclusivo del Chatbot (Bucket 4: qwen/qwen3.8-27b -> Bucket 5: openai/gpt-oss-120b -> Bucket 6: gemini-3.5-flash-lite)
  const executeChatbotPipeline = async () => {
    let rawAnswer = '';
    let modelUsed = '';
    const maxTokens = chatMode === 'full_ia' ? 1800 : 900;
    const groqTemp = bypassCache ? 0.45 : 0.2;

    const callGroqChat = async (modelId) => {
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
            temperature: groqTemp,
            max_tokens: maxTokens
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (res.status === 429) {
          console.warn(`[Chatbot Pool] Rate limit en ${modelId}, rotando...`);
          return '';
        }

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content?.trim() || '';
          if (content) {
            modelUsed = modelId;
            return content;
          }
        }
      } catch (err) {
        console.warn(`[Chatbot Pool] Fallo con ${modelId}:`, err.message);
      }
      return '';
    };

    if (GROQ_API_KEY) {
      for (const modelId of ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']) {
        rawAnswer = await callGroqChat(modelId);
        if (rawAnswer) break;
      }
    }

    // Failover inmediato a Gemini 3.5 Flash Lite (sin esperar cooldown) si Groq se saturó por TPM
    if (!rawAnswer && GEMINI_API_KEY) {
      try {
        const gemText = await callGeminiFlashLite({
          promptText: `${systemInstruction}\n\n${userPrompt}`,
          temperature: groqTemp,
          maxOutputTokens: maxTokens
        });
        if (gemText) {
          rawAnswer = gemText;
          modelUsed = 'gemini-3.5-flash-lite';
        }
      } catch (e) {
        console.warn('[Chatbot Pool] Fallo en fallback Gemini:', e.message);
      }
    }

    // Último reintento con cooldown de 2000ms solo si fallaron los 3 motores anteriores
    if (!rawAnswer && GROQ_API_KEY) {
      await new Promise(r => setTimeout(r, 2000));
      rawAnswer = await callGroqChat('openai/gpt-oss-120b');
    }

    if (!rawAnswer) {
      throw new Error('No se pudo obtener respuesta de ningún motor de IA.');
    }

    // Guardia determinista: si el modelo marcó falsamente @@OFF_TOPIC@@ pese a palabras académicas del ramo
    let looksOffTopic = rawAnswer.includes('@@OFF_TOPIC@@') || rawAnswer.trim().startsWith('🚫');
    if (looksOffTopic && hasCourseAcademicKeyword(question, course) && GEMINI_API_KEY) {
      try {
        console.warn('[Chatbot Guard] Posible falso @@OFF_TOPIC@@ detectado en pregunta académica; corrigiendo vía gemini-3.5-flash-lite...');
        const correctivePrompt = `${systemInstruction}\n\nNOTA CRÍTICA DEL SISTEMA: Esta pregunta SÍ pertenece al curso "${course.name}" (contiene conceptos académicos reales del ramo, posiblemente con una premisa falsa). NO respondas como off-topic ni uses @@OFF_TOPIC@@ ni 🚫. Corrige cualquier premisa falsa citando [VIVO-X] o [SLIDE-X].\n\n${userPrompt}`;
        const retryText = await callGeminiFlashLite({
          promptText: correctivePrompt,
          temperature: 0.2,
          maxOutputTokens: maxTokens
        });
        if (retryText && !retryText.includes('@@OFF_TOPIC@@') && !retryText.trim().startsWith('🚫')) {
          rawAnswer = retryText;
          modelUsed = 'gemini-3.5-flash-lite';
          looksOffTopic = false;
        }
      } catch (guardErr) {
        console.warn('[Chatbot Guard] Fallo al reintentar falso off-topic:', guardErr.message);
      }
    }

    const parseMarkers = (raw) => {
      const isOffTopicFlag = raw.includes('@@OFF_TOPIC@@') || raw.trim().startsWith('🚫');
      const isUnseenFlag = raw.includes('@@SIN_FUENTE_CLASE@@');

      let cleaned = raw
        .replace(/@@OFF_TOPIC@@/g, '')
        .replace(/@@SIN_FUENTE_CLASE@@/g, '')
        .trim();

      let vp = null;
      if (cleaned.includes('@@VOZ_ALTA@@')) {
        const vParts = cleaned.split('@@VOZ_ALTA@@');
        cleaned = vParts[0].trim();
        vp = vParts.slice(1).join(' ').replace(/^["'«“]|["'»”]$/g, '').trim();
      }

      let main = cleaned;
      let comp = null;
      if (cleaned.includes('@@COMPLEMENTO@@')) {
        const parts = cleaned.split('@@COMPLEMENTO@@');
        main = parts[0].trim();
        comp = parts[1].trim();
      }

      if (!teacherSettings.allowComplement || isOffTopicFlag) comp = null;
      if (isOffTopicFlag) vp = null;

      return {
        isOffTopic: isOffTopicFlag,
        isUnseenAcademic: isUnseenFlag,
        mainAnswer: main,
        complementText: comp,
        voicePrompt: vp
      };
    };

    let parsed = parseMarkers(rawAnswer);

    // Guardia anti-respuesta-vacía (ej. si el modelo empezó directamente con @@VOZ_ALTA@@ sin cuerpo explicativo)
    if (!parsed.isOffTopic && parsed.mainAnswer.length < 15 && GEMINI_API_KEY) {
      try {
        console.warn('[Chatbot Guard] Respuesta sin cuerpo explicativo antes de @@VOZ_ALTA@@; corrigiendo vía gemini-3.5-flash-lite...');
        const bodyRetryPrompt = `${systemInstruction}\n\nNOTA CRÍTICA: Tu respuesta anterior omitió el cuerpo explicativo antes de @@VOZ_ALTA@@. Escribe PRIMERO 2 a 3 líneas explicando y corrigiendo cualquier premisa falsa con citas [VIVO-X]/[SLIDE-X], y recién al final agrega @@VOZ_ALTA@@.\n\n${userPrompt}`;
        const retryBodyText = await callGeminiFlashLite({
          promptText: bodyRetryPrompt,
          temperature: 0.2,
          maxOutputTokens: maxTokens
        });
        if (retryBodyText) {
          const retriedParsed = parseMarkers(retryBodyText);
          if (retriedParsed.mainAnswer.length >= 15) {
            parsed = retriedParsed;
            modelUsed = 'gemini-3.5-flash-lite';
          }
        }
      } catch (bodyGuardErr) {
        console.warn('[Chatbot Guard] Fallo al reintentar cuerpo vacío:', bodyGuardErr.message);
      }
    }

    const { isOffTopic, isUnseenAcademic, mainAnswer, complementText, voicePrompt } = parsed;
    const questionType = isOffTopic ? 'off_topic' : isUnseenAcademic ? 'unseen_academic' : 'grounded';

    const resultPayload = {
      status: 'ok',
      chatMode,
      questionType,
      canForwardToTeacher: !isOffTopic,
      modelUsed,
      fromCache: false,
      answer: mainAnswer,
      complement: complementText,
      voicePrompt,
      tokenMetrics: estimateTokenMetrics({
        fullContextText,
        question,
        answerText: mainAnswer + (complementText || ''),
        fromCache: false
      }),
      timestamp: new Date().toISOString()
    };

    if (!bypassCache && !isOffTopic) {
      recordSafeSemanticCache({
        question,
        courseId: course.id,
        chatMode,
        transcriptCount: liveEntries.length,
        payload: resultPayload
      });
    }

    return resultPayload;
  };

  if (!bypassCache) {
    const flightPromise = executeChatbotPipeline();
    IN_FLIGHT_QUERIES.set(flightKey, flightPromise);
    try {
      return await flightPromise;
    } finally {
      IN_FLIGHT_QUERIES.delete(flightKey);
    }
  }

  return await executeChatbotPipeline();
}

/**
 * 5. Generador de "Apunte Vivo Fusionado" (Lámina U-Cursos + Explicación Oral + Énfasis + Radar Auxiliar)
 * Funciona tanto si el curso tiene láminas cargadas como si fue 100% pizarra libre (contexto plano).
 */
export function generateFusedPostClassCapsule(course, liveEntries = [], topicClusters = [], questionsLog = []) {
  const slides = course?.ucursosSync?.slides || [];
  const slideBlocks = slides.map(sl => {
    const matchedEntries = liveEntries.filter(e => e.slideRef && e.slideRef.id === sl.id);
    return {
      slideId: sl.id,
      slideNumber: sl.number,
      title: sl.title,
      bulletPoints: sl.bulletPoints || [],
      spokenEntries: matchedEntries
    };
  });

  // Intervenciones que no mapearon a una slide (ej. pizarra libre o clases sin PPT)
  const unmappedEntries = liveEntries.filter(e => !e.slideRef);

  // Énfasis docentes ("ojo con esto", "control", "importante")
  const teacherEmphasis = liveEntries.filter(e =>
    e.category === 'importancia' ||
    /\b(ojo|importante|control|prueba|examen|no confundan)\b/i.test(e.text || '')
  );

  // Registro completo de Preguntas y Respuestas (En Vivo vs Post-Clase Full IA usando phase explícita)
  const validQa = (questionsLog || []).filter(q => q.questionType !== 'off_topic');
  const postClassQuestions = validQa.filter(q => (q.phase ? q.phase === 'post_class' : q.chatMode === 'full_ia'));
  const inClassQuestions = validQa.filter(q => !(q.phase ? q.phase === 'post_class' : q.chatMode === 'full_ia'));

  // Puntos de refuerzo agrupados para el Auxiliar (Ayudantía)
  const taFocusPoints = (topicClusters || [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .map(c => ({
      topic: c.label,
      totalSignals: c.count,
      lostCount: c.lostCount || 0,
      status: c.status || 'open',
      resolvedAt: c.resolvedAt || null,
      suggestion: c.suggestion,
      sampleQuestions: (c.questions || []).slice(0, 3)
    }));

  // Construir Markdown exportable de Apunte Vivo
  const mdLines = [
    `# Apunte Vivo Fusionado — ${course.code}: ${course.name}`,
    `**Profesor:** ${course.instructor} | **Fuente PPT:** ${course.ucursosSync?.deckTitle || 'Pizarra Libre (Sin PPT)'}`,
    ''
  ];

  if (teacherEmphasis.length > 0) {
    mdLines.push(`## 📌 Avisos y Énfasis del Profesor ("Ojo para el Control")`);
    teacherEmphasis.forEach(em => mdLines.push(`- **[${em.timestamp}]** ${em.text}`));
    mdLines.push('');
  }

  slideBlocks.forEach(sb => {
    if (sb.spokenEntries.length === 0 && liveEntries.length > 0) return;
    mdLines.push(`## 📑 Lámina ${sb.slideNumber}: ${sb.title}`);
    sb.bulletPoints.forEach(bp => mdLines.push(`> *Diapositiva:* ${bp}`));
    if (sb.spokenEntries.length > 0) {
      mdLines.push(`\n**Lo que explicó el profesor en sala:**`);
      sb.spokenEntries.forEach(se => mdLines.push(`- **[${se.timestamp}]** ${se.text}`));
    }
    mdLines.push('');
  });

  if (unmappedEntries.length > 0) {
    mdLines.push(`## 📝 Explicaciones Adicionales de Pizarra / Contexto Libre`);
    unmappedEntries.forEach(ue => mdLines.push(`- **[${ue.timestamp}]** ${ue.text}`));
    mdLines.push('');
  }

  // Pauta separada para el Auxiliar
  const taMdLines = [
    `# Pauta de Refuerzo para Auxiliar — ${course.code}: ${course.name}`,
    `Generado automáticamente desde el Radar Anónimo de Comprensión (Capa 2).`,
    ''
  ];

  if (taFocusPoints.length === 0) {
    taMdLines.push(`- No se registraron cuellos de botella críticos durante la sesión.`);
  } else {
    taFocusPoints.forEach((tp, i) => {
      taMdLines.push(`## ${i + 1}. ${tp.topic} (${tp.totalSignals} señales / ${tp.lostCount} "Me perdí")`);
      taMdLines.push(`- **Estado en clase:** ${tp.status === 'resolved' ? 'Aclarado en pizarra' : tp.status === 'auto_resolved' ? `Retomado oralmente por el profesor [${tp.resolvedAt || ''}]` : tp.status === 'for_ta' ? 'Marcado para Ayudantía' : 'Pendiente (revisar en ayudantía)'}`);
      taMdLines.push(`- **Foco sugerido:** ${tp.suggestion}`);
      if (tp.sampleQuestions.length > 0) {
        taMdLines.push(`- **Dudas reales anónimas de los estudiantes:**`);
        tp.sampleQuestions.forEach(sq => taMdLines.push(`  - *"${sq}"*`));
      }
      taMdLines.push('');
    });
  }

  if (postClassQuestions.length > 0) {
    taMdLines.push(`## 🟣 Dudas de Estudio Post-Clase (Modo Full IA)`);
    postClassQuestions.forEach(pq => {
      taMdLines.push(`- **Pregunta:** *"${pq.question}"* (${pq.topicLabel || 'General'})`);
      if (pq.answerSummary) taMdLines.push(`  - **Orientación entregada:** ${pq.answerSummary}`);
    });
    taMdLines.push('');
  }

  return {
    courseCode: course.code,
    courseName: course.name,
    deckTitle: course.ucursosSync?.deckTitle || null,
    totalEntries: liveEntries.length,
    teacherEmphasis,
    slideBlocks,
    unmappedEntries,
    taFocusPoints,
    qaLog: {
      totalValid: validQa.length,
      inClassQuestions,
      postClassQuestions
    },
    longitudinalInsights: course?.longitudinalInsights || null,
    markdownExport: mdLines.join('\n'),
    taGuideMarkdown: taMdLines.join('\n')
  };
}

/**
 * 6. Generar Resumen Post-Clase para guardar en RAG Histórico
 */
export async function generateClassSummary(course, liveEntries = []) {
  // Compactar si excede 20 entradas para no agotar la cuota TPM de openai/gpt-oss-120b al cerrar clase
  let compactEntries = liveEntries;
  if (liveEntries.length > 20) {
    const picked = [
      ...liveEntries.slice(0, 5),
      ...liveEntries.filter((e, i) => i >= 5 && i < liveEntries.length - 10 && (e.category === 'importancia' || e.category === 'formula')).slice(0, 5),
      ...liveEntries.slice(-10)
    ];
    const seen = new Set();
    compactEntries = picked.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  let fullTranscript = compactEntries.map(e => `[${e.timestamp}] ${e.text}`).join('\n');
  if (fullTranscript.length > 2500) {
    fullTranscript = fullTranscript.slice(0, 2500);
  }

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
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        return JSON.parse(data.choices?.[0]?.message?.content);
      }
      console.warn(`[generateClassSummary] Groq status ${res.status}, usando fallback gemini-3.5-flash-lite...`);
    }
  } catch (err) {
    console.warn('[generateClassSummary] Error Groq:', err.message);
  }

  try {
    const gemSummary = await callGeminiFlashLite({
      promptText: `${systemInstruction}\n\nTranscripción:\n${fullTranscript || 'Sin transcripción'}`,
      temperature: 0.2,
      maxOutputTokens: 700,
      jsonMode: true
    });
    if (gemSummary) {
      return JSON.parse(gemSummary);
    }
  } catch (gemErr) {
    console.warn('[generateClassSummary] Error fallback Gemini:', gemErr.message);
  }

  return {
    title: `Sesión de ${course.name}`,
    summary: 'Resumen generado automáticamente a partir de las intervenciones del aula.',
    keyFormulas: []
  };
}
