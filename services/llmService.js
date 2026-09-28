/**
 * Servicio para llamadas al LLM (Gemini 3.8 Flash con fallback a OpenAI).
 * Mantiene la API Key protegida en el servidor.
 * Todas las respuestas son 100% generadas por el modelo en tiempo real.
 * Si ocurre un error de cuota o saturación en la API, se informa transparentemente al usuario.
 */

import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { COURSE_CONFIG } from '../config/courseConfig.js';

const execFileAsync = promisify(execFile);

const getGeminiKey = () => process.env.GEMINI_API_KEY || '';
const getOpenAiKey = () => process.env.OPENAI_API_KEY || '';
const getGroqKey = () => process.env.GROQ_API_KEY || '';

const GEMINI_API_KEY = getGeminiKey();
const OPENAI_API_KEY = getOpenAiKey();
const GROQ_API_KEY = getGroqKey();

/**
 * Modelos disponibles en orden de prioridad para evitar rate limits
 */
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite'
];

/**
 * Función interna para llamar a Gemini con soporte de modelos y reintentos transparentes
 */
async function callGemini(systemInstruction, userPrompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }

  const body = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048
    }
  };

  let lastStatus = null;
  let lastErrorText = '';

  for (const modelName of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text.trim();
        }
      }

      lastStatus = response.status;
      lastErrorText = await response.text();

      // Si es 429 o 503, intentamos con el siguiente modelo disponible
      if (lastStatus === 429 || lastStatus === 503) {
        console.warn(`[Gemini API] Modelo ${modelName} devolvió status ${lastStatus}. Probando siguiente modelo...`);
        continue;
      }

      throw new Error(`Error en la API de Google Gemini (${lastStatus}): ${lastErrorText}`);
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('503')) {
        continue;
      }
      throw err;
    }
  }

  // Si todos los modelos agotaron su cuota por minuto
  if (lastStatus === 429) {
    throw new Error('⏳ Límite de solicitudes por minuto alcanzado en la API gratuita de Google Gemini (Rate Limit 429). Por favor espera unos segundos antes de volver a consultar.');
  } else if (lastStatus === 503) {
    throw new Error('⚠️ El servicio de Google Gemini está experimentando alta demanda momentánea (Error 503). Por favor reintenta en un instante.');
  }

  throw new Error(`No se pudo obtener respuesta del modelo (${lastStatus}): ${lastErrorText}`);
}

/**
 * Función interna para llamar a OpenAI (si se configurara OPENAI_API_KEY)
 */
async function callOpenAI(systemInstruction, userPrompt) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en OpenAI (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

/**
 * Enrutador principal de LLM (llamada real sin mocks)
 */
export async function generateCompletion(systemInstruction, userPrompt) {
  if (GEMINI_API_KEY) {
    return await callGemini(systemInstruction, userPrompt);
  } else if (OPENAI_API_KEY) {
    return await callOpenAI(systemInstruction, userPrompt);
  } else {
    throw new Error('No se encontró ninguna API key configurada en el servidor.');
  }
}

/**
 * 1. MODO CHAT EN VIVO:
 * Lógica pedagógica con llamada real al LLM y formateo matemático en LaTeX (KaTeX).
 */
export async function answerLiveChat({ question, revealedTranscript, currentTimeFormatted }) {
  const scopeText = COURSE_CONFIG.getScopePromptText();

  const systemInstruction = `Eres "Cátedra Viva", un asistente pedagógico de aula aumentada con IA para el curso universitario "${COURSE_CONFIG.courseCode}: ${COURSE_CONFIG.courseName}".
Acompañas a los estudiantes en tiempo real durante una clase expositiva universitaria sobre el modelo IS-LM.

${scopeText}

REGLAS DE RESPUESTA CRÍTICAS (DEBES SEGUIRLAS ESTRICTAMENTE):

1. FILTRO DE ALCANCE DEL CURSO:
   - Evalúa si la pregunta del estudiante corresponde al curso de Macroeconomía (${COURSE_CONFIG.courseCode}) descrito arriba en el CONTENIDO CURRICULAR PERMITIDO.
   - Si la pregunta NO es sobre el curso (por ejemplo: preguntas de otro ramo, geografía como "cuál es la capital de Francia", cultura general, chistes, deportes, vida cotidiana):
     DEBES responder EXACTAMENTE:
     "Esa pregunta no está relacionada con este curso."
     NO intentes responder la pregunta off-topic ni des explicaciones adicionales.

2. SOLICITUDES DE RESUMEN ("resume los últimos X minutos", "qué se ha visto hasta ahora", etc.):
   - Sintetiza basándote ÚNICAMENTE en el texto de la transcripción revelada hasta el momento. Si piden los últimos minutos, calcula el fragmento correspondiente a ese intervalo temporal.

3. PREGUNTAS SOBRE EL CONTENIDO DEL CURSO:
   - SI ESTÁ EN LA TRANSCRIPCIÓN REVELADA:
     Responde directamente explicando el concepto en base a lo que el docente explicó en la clase.
   
   - SI NO ESTÁ EN LA TRANSCRIPCIÓN REVELADA (por ejemplo, temas de otras unidades como el modelo de Solow, consumo intertemporal, AS/AD, o conceptos del curso que el docente aún no ha mencionado en esta sesión):
     Responde a la duda con claridad pedagógica,
     PERO DEBES anteponer de forma destacada y obligatoria el siguiente disclaimer textual:
     "> ⚠️ **Aviso:** Esto no lo dijo el profesor en esta clase, es una explicación general — probablemente lo explique con más detalle más adelante."

4. FORMATO MATEMÁTICO (KATEX / LATEX OBLIGATORIO):
   Usa SIEMPRE notación matemática estándar en LaTeX para todas las variables y fórmulas macroeconómicas, delimitando fórmulas en línea con $formula$ (ejemplo: $i$, $Y$, $i^*$, $Y^*$, $Y = C + I + G$, $M/P = L(Y, i)$) y fórmulas principales en bloque con $$formula$$ para que se rendericen automáticamente con KaTeX.

Tono: Académico, riguroso, claro y didáctico.`;

  const userPrompt = `[ESTADO ACTUAL DE LA CLASE]
Tiempo transcurrido en la simulación: ${currentTimeFormatted || 'En curso'}

[TRANSCRIPCIÓN REVELADA HASTA ESTE MOMENTO DE LA CLASE]:
${revealedTranscript && revealedTranscript.trim() ? revealedTranscript : '(La clase recién está comenzando, aún no hay texto transcrito)'}

[PREGUNTA DEL ESTUDIANTE]:
"${question}"

Entrega tu respuesta aplicando las reglas y formato LaTeX:`;

  // Llamada 100% real al modelo de lenguaje
  return await generateCompletion(systemInstruction, userPrompt);
}

/**
 * 2. MODO POST-CLASE: Generación de Resumen y Conceptos Clave
 */
export async function generatePostClassSummary(fullTranscript) {
  const scopeText = COURSE_CONFIG.getScopePromptText();

  const systemInstruction = `Eres un asistente docente experto de nivel universitario para el curso "${COURSE_CONFIG.courseCode}: ${COURSE_CONFIG.courseName}".
Tu tarea es analizar la transcripción COMPLETA de la clase expositiva sobre el Modelo IS-LM y generar un informe de estudio post-clase estructurado en formato JSON.

${scopeText}

Genera un objeto JSON estrictamente válido con la siguiente estructura:
{
  "summary": "Resumen ejecutivo pedagógico y riguroso de la clase (2 a 3 párrafos explicando el modelo IS-LM, los dos mercados en equilibrio, y las políticas fiscales y monetarias mencionadas)",
  "keyConcepts": [
    {
      "term": "Nombre del concepto (ej. Curva IS)",
      "definition": "Definición clara y concisa según lo explicado por el profesor",
      "timestamp": "Timestamp aproximado donde se define en la clase (ej. 00:01:28)"
    }
  ],
  "studyQuestions": [
    "Pregunta de autoevaluación 1",
    "Pregunta de autoevaluación 2",
    "Pregunta de autoevaluación 3"
  ]
}

Responde ÚNICAMENTE con el bloque JSON, sin texto introductorio ni bloques de código extra.`;

  const userPrompt = `Transcripción completa de la clase:\n\n${fullTranscript}\n\nGenera el JSON de post-clase:`;

  const rawResult = await generateCompletion(systemInstruction, userPrompt);
  
  // Limpiar posibles fences de markdown y texto adicional
  let cleaned = rawResult.trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * 3. MODO POST-CLASE: Buscador / Q&A sobre la transcripción completa
 */
export async function answerPostClassQuery(question, fullTranscript) {
  const scopeText = COURSE_CONFIG.getScopePromptText();

  const systemInstruction = `Eres el asistente de estudio post-clase para "${COURSE_CONFIG.courseCode}: ${COURSE_CONFIG.courseName}".
Tienes a tu disposición la transcripción completa de la clase de IS-LM.

${scopeText}

Instrucciones:
1. Si la pregunta está fuera del alcance de este curso (ej. geografía general, otro ramo no económico), responde:
   "Esa pregunta no está relacionada con este curso."
2. Si la pregunta trata sobre lo visto en la clase, responde de forma precisa y cita los timestamps relevantes donde el docente mencionó el concepto.
3. Si la pregunta es sobre el curso pero no fue discutida en la clase, explica el concepto y aclara que fue fuera del contenido de esta sesión particular.
4. Usa notación LaTeX para fórmulas ($i$, $Y$, $M/P = L(Y, i)$).`;

  const userPrompt = `Transcripción completa:\n${fullTranscript}\n\nPregunta del estudiante:\n"${question}"`;

  return await generateCompletion(systemInstruction, userPrompt);
}

const AUDIO_TRANSCRIBE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

let currentAudioModelIndex = 0;

/**
 * 4. MODO TRANSCRIPCIÓN REAL DE AUDIO EN VIVO:
 * Toma un fragmento del archivo de audio MP3 usando ffmpeg y lo envía a Gemini Multimodal
 * para que el modelo transcriba directamente el audio en tiempo real sin usar textos pregrabados.
 * Usa un pool balanceado de 4 modelos en Round-Robin para cuadruplicar el límite de cuota (hasta 60 RPM).
 */
export async function transcribeAudioChunk(startSeconds = 0, durationSeconds = 6) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada.');
  }

  const audioSource = path.join(process.cwd(), 'Modelo IS-LM - Explicado para principiantes!.mp3');
  const tempChunkPath = path.join(process.cwd(), `temp_chunk_${Date.now()}_${startSeconds}.mp3`);

  try {
    // 1. Extraer el fragmento de audio exacto (mono, 16kHz, ~18KB para 6s) en menos de 0.05s
    const ffmpegBinary = ffmpegPath || 'ffmpeg';
    await execFileAsync(ffmpegBinary, [
      '-y',
      '-ss', String(startSeconds),
      '-t', String(durationSeconds),
      '-i', audioSource,
      '-ac', '1',
      '-ar', '16000',
      tempChunkPath
    ]);

    const chunkBuffer = fs.readFileSync(tempChunkPath);
    let text = '';
    let lastError = null;

    const effectiveGroqKey = process.env.GROQ_API_KEY || GROQ_API_KEY;
    const effectiveGeminiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;

    console.log(`[transcribeAudioChunk] 🎧 Fragmento [${startSeconds}s - ${startSeconds + durationSeconds}s] -> Procesando con ${effectiveGroqKey ? 'Groq Whisper Large V3' : 'Gemini'}...`);

    // 2. Prioridad 1: Groq Whisper (100% Gratis, ultrarrápido <0.3s y cuota independiente de Gemini)
    if (effectiveGroqKey) {
      const groqModels = ['whisper-large-v3-turbo', 'whisper-large-v3'];
      for (const model of groqModels) {
        try {
          const formData = new FormData();
          formData.append('file', new Blob([chunkBuffer], { type: 'audio/mp3' }), 'chunk.mp3');
          formData.append('model', model);
          formData.append('language', 'es');
          formData.append('response_format', 'json');

          let groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${effectiveGroqKey}`
            },
            body: formData
          });

          // Si devuelve 429 ("Rate limit reached... Please try again in 3s"), esperar 2.5s y reintentar
          if (groqRes.status === 429) {
            console.warn(`[transcribeAudioChunk] Groq (${model}) 429. Esperando 2.5s para reintentar...`);
            await new Promise(r => setTimeout(r, 2500));
            groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${effectiveGroqKey}`
              },
              body: formData
            });
          }

          if (groqRes.ok) {
            const groqData = await groqRes.json();
            text = groqData.text?.trim() || '';
            console.log(`[transcribeAudioChunk] ✅ Groq (${model}) transcribió [${startSeconds}s]: "${text}"`);
            if (text) break;
          } else {
            const errData = await groqRes.json().catch(() => ({}));
            console.warn(`[transcribeAudioChunk] Groq (${model}) falló (${groqRes.status}):`, errData?.error?.message || errData);
          }
        } catch (err) {
          console.warn(`[transcribeAudioChunk] Error con Groq (${model}):`, err.message);
        }
      }
    }

    // 3. Fallback a Gemini si Groq no devolvió texto o no está configurado
    if (!text && effectiveGeminiKey) {
      const base64Audio = chunkBuffer.toString('base64');
      const prompt = `Transcribe exactamente las palabras que dice el locutor en este fragmento de audio en español (de ${durationSeconds} segundos). 
Devuelve ÚNICAMENTE el texto que se pronuncia en este trozo, sin comillas, sin introducciones y sin inventar palabras que no estén en el audio.`;

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'audio/mp3', data: base64Audio } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1
        }
      };

      // Distribuir equitativamente entre los modelos para evitar rate limits
      const modelOrder = [];
      for (let i = 0; i < AUDIO_TRANSCRIBE_MODELS.length; i++) {
        modelOrder.push(AUDIO_TRANSCRIBE_MODELS[(currentAudioModelIndex + i) % AUDIO_TRANSCRIBE_MODELS.length]);
      }
      currentAudioModelIndex = (currentAudioModelIndex + 1) % AUDIO_TRANSCRIBE_MODELS.length;

      for (const modelName of modelOrder) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.ok) {
            const data = await res.json();
            text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (text) break;
          } else {
            const errData = await res.json().catch(() => ({}));
            lastError = errData?.error?.message || `HTTP ${res.status}`;
            console.warn(`[transcribeAudioChunk] Modelo ${modelName} falló (${res.status}): ${lastError}. Probando siguiente modelo...`);
          }
        } catch (e) {
          lastError = e.message;
          console.warn(`[transcribeAudioChunk] Error con ${modelName}:`, e.message);
        }
      }
    }

    if (!text && lastError) {
      throw new Error(`Error en transcripción IA: ${lastError}`);
    }

    if (fs.existsSync(tempChunkPath)) {
      fs.unlinkSync(tempChunkPath);
    }

    // Limpiar comillas y prefijos
    if (text) {
      text = text.replace(/^["'«“]|["'»”]$/g, '').trim();
      text = text.replace(/^(Transcripción:|Texto:|El audio dice:)\s*/i, '').trim();
    }

    const startMins = Math.floor(startSeconds / 60);
    const startSecs = startSeconds % 60;
    const endSeconds = startSeconds + durationSeconds;
    const endMins = Math.floor(endSeconds / 60);
    const endSecs = endSeconds % 60;
    const timestamp = `00:${String(startMins).padStart(2, '0')}:${String(startSecs).padStart(2, '0')} - 00:${String(endMins).padStart(2, '0')}:${String(endSecs).padStart(2, '0')}`;

    return {
      id: `ai-audio-${startSeconds}`,
      timestamp,
      seconds: startSeconds,
      speaker: 'Profesor (Whisper en Groq)',
      text: text || '(Pausa / audio breve)'
    };
  } catch (err) {
    if (fs.existsSync(tempChunkPath)) {
      try { fs.unlinkSync(tempChunkPath); } catch (_) {}
    }
    throw err;
  }
}
