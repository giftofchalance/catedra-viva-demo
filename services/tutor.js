/**
 * Tutor Pedagógico en 3 Modos con Memoria Acotada, Quote-Reply y Soft-Landing Scope.
 * Buckets 4, 5 y 6: openai/gpt-oss-120b -> qwen/qwen3.8-27b -> gemini-3.5-flash-lite
 */

import { callGroqChat, callGeminiFlashLite, hasApiKeys } from './llmClients.js';
import { normalizeSearchText, extractMeaningfulTokens } from './textUtils.js';
import {
  extractLogicalSignature,
  tokenizeSemanticCore,
  isFollowUpQuestion,
  checkSafeSemanticCache,
  recordSafeSemanticCache,
  getInFlightQuery,
  setInFlightQuery,
  deleteInFlightQuery,
  estimateTokenMetrics
} from './semanticCache.js';

const UNIVERSAL_ACADEMIC_PATTERNS = [
  /\b(formula|ecuacion|grafico|pendiente|tasa|ejemplo|despejar|calcular|definicion|modelo|control|prueba|examen|ayudantia|demostracion|propiedad|teorema|variable|funcion|derivada|integral|varianza|correlacion|flujo|ley|principio|efecto|curva|equilibrio|serie|algebra|epsilon|epsilon|epsilon|epsilon|matriz|vector|limite|probabilidad|hipotesis|mercado|inversion|ahorro|dinero|interes|inflacion|banco central|impuesto|gasto)\b/,
  /\b(como funciona|que significa|por que sube|por que baja|por que cae|por que aumenta|por que disminuye|de donde sale)\b/,
  /[=<>\/\$]/
];

/**
 * Guardia agnóstica de alcance: determina si una pregunta tiene carácter académico o pertenece
 * dinámicamente al curso / transcripción viva, sin depender de ramos hardcodeados.
 */
export function isLikelyAcademicQuestion(question = '', course = null, liveEntries = []) {
  const normQ = normalizeSearchText(question);
  if (!normQ) return false;

  if (UNIVERSAL_ACADEMIC_PATTERNS.some(rx => rx.test(normQ))) {
    return true;
  }

  const qTokens = new Set(extractMeaningfulTokens(question, 3));
  if (qTokens.size === 0) return false;

  const courseTexts = [
    course?.name || '',
    course?.description || '',
    course?.glossary || '',
    ...(course?.ucursosSync?.slides || []).flatMap(s => [s.title || '', ...(s.bulletPoints || []), ...(s.keywords || [])]),
    ...(course?.materials || []).map(m => `${m.title || ''} ${m.content || ''}`),
    ...(course?.historicalClasses || []).map(h => `${h.title || ''} ${h.summary || ''}`),
    ...liveEntries.slice(-20).map(e => e.text || '')
  ].join(' ');

  const courseTokens = new Set(extractMeaningfulTokens(courseTexts, 4));
  const shortAcronyms = ['pib', 'van', 'tir', 'tpm', 'ipc', 'capm', 'wacc', 'is-lm', 'fem', 'ohm'];

  for (const acr of shortAcronyms) {
    if (normQ.includes(acr) && normalizeSearchText(courseTexts).includes(acr)) {
      return true;
    }
  }

  for (const qt of qTokens) {
    if (qt.length >= 4 && courseTokens.has(qt)) {
      return true;
    }
  }

  return false;
}

function buildCompactHistoryAndQuote({ chatHistory = [], quotedContext = null }) {
  const blocks = [];

  if (Array.isArray(chatHistory) && chatHistory.length > 0) {
    const recentTurns = chatHistory.slice(-4);
    const formatted = recentTurns
      .filter(m => m && m.text)
      .map(m => {
        const roleTag = m.role === 'user' ? 'Estudiante' : 'Co-Piloto';
        const cleanTxt = String(m.text).replace(/\s+/g, ' ').trim();
        const clipped = cleanTxt.length > 240 ? `${cleanTxt.slice(0, 237)}...` : cleanTxt;
        return `- ${roleTag}: "${clipped}"`;
      });
    if (formatted.length > 0) {
      blocks.push(`[HILO RECIENTE DE CONVERSACIÓN]:\n${formatted.join('\n')}`);
    }
  }

  if (quotedContext && quotedContext.text) {
    const qClean = String(quotedContext.text).replace(/\s+/g, ' ').trim();
    const qClipped = qClean.length > 350 ? `${qClean.slice(0, 347)}...` : qClean;
    const originLabel = quotedContext.type === 'transcript'
      ? `Frase citada de la clase (${quotedContext.refId || 'sala'})`
      : 'Respuesta previa citada del Co-Piloto';
    blocks.push(`[TEXTO CITADO POR EL ESTUDIANTE — ${originLabel}]:\n"${qClipped}"`);
  }

  return blocks.join('\n\n');
}

export async function answerStudentQuestion({
  question,
  course,
  liveEntries = [],
  teacherSettings = { chatState: 'active', allowComplement: true },
  currentTimeFormatted = '00:00',
  bypassCache = false,
  quotedContext = null,
  chatHistory = []
}) {
  const chatMode = teacherSettings.chatState || 'active';

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
      answer: `El profesor activó el **Modo Pizarra** para enfocar la atención presencial. Tu duda quedó guardada de forma anónima en su Radar para retomarla apenas avance.`,
      sources: []
    };
  }

  // 1. Construir prefijo estático/semi-estático (Prefix KV-Cache friendly)
  const contextBlocks = [];

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
          entry.category === 'ejemplo' ||
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
      const slideTag = entry.slideRef ? ` | ${entry.slideRef.id}` : '';
      contextBlocks.push(`[${entry.id} | ${entry.timestamp}${slideTag}]: "${entry.text}"`);
    });
  }

  if (course.ucursosSync?.slides?.length > 0) {
    course.ucursosSync.slides.forEach(sl => {
      contextBlocks.push(`[${sl.id}] (Lámina ${sl.number}: ${sl.title}):\n- ${(sl.bulletPoints || []).join('\n- ')}`);
    });
  }

  if (course.historicalClasses?.length > 0) {
    course.historicalClasses.forEach(hc => {
      const fText = (hc.keyFormulas || []).map(f => `  - $${f}$`).join('\n');
      contextBlocks.push(`[${hc.id}] (Clase previa — ${hc.title}):\n${hc.summary}${fText ? `\nFórmulas:\n${fText}` : ''}`);
    });
  }

  if (course.materials?.length > 0) {
    course.materials.forEach(mat => {
      contextBlocks.push(`[${mat.id}] (Material — ${mat.title}, ${mat.pages}):\n${mat.content}`);
    });
  }

  const fullContextText = contextBlocks.join('\n\n---\n\n');

  // 2. Caché seguro y Single-Flight SOLO en preguntas autocontenidas
  const hasQuote = Boolean(quotedContext && quotedContext.text);
  const hasHistory = Array.isArray(chatHistory) && chatHistory.length > 0;
  const followUp = isFollowUpQuestion(question);
  const allowCacheAndCoalesce = !bypassCache && !hasQuote && !followUp;

  const normalizedFlightQ = question.toLowerCase().replace(/[¿?¡!.,\s]+/g, ' ').trim();
  const flightKey = `${course.id}:${chatMode}:${liveEntries.length}:${extractLogicalSignature(question)}:${normalizedFlightQ}`;

  if (allowCacheAndCoalesce && !hasHistory) {
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
  }

  if (allowCacheAndCoalesce) {
    const inFlight = getInFlightQuery(flightKey);
    if (inFlight) {
      const sharedPayload = await inFlight;
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

  // 3. Reglas de Modo + Generous Soft-Landing Scope
  const modeRules = chatMode === 'full_ia'
    ? `MODO ACTUAL: FULL IA (EXPLICACIONES COMPLETAS SIN RESTRICCIONES DE LONGITUD)
- El profesor habilitó respuestas completas y profundas.
- Explica paso a paso con rigor universitario completo: intuición, mecanismo causa-efecto, derivaciones en $LaTeX$ ($...$ o $$...$$) si aplica y conexión entre lo dicho en vivo ([VIVO-X]), láminas ([SLIDE-X]) e historial ([HIST-X]).
- Si hay [TEXTO CITADO POR EL ESTUDIANTE] o [HILO RECIENTE], responde directamente sobre el paso o frase señalada sin repetir todo desde cero.
- Cierra con 1 pregunta corta de chequeo conceptual.`
    : `MODO ACTUAL: SEGUIMIENTO EN VIVO (BREVE + IMPULSO A PARTICIPAR)
- EL PROFESOR SIGUE HABLANDO EN VIVO. Sé claro y ultrabreve para no distraer al estudiante.
- Reglas estrictas de formato para dudas académicas:
  * Responde en MÁXIMO 2 a 3 líneas concisas y directas.
  * Cita siempre las fuentes exactas "[VIVO-X]", "[SLIDE-X]", "[HIST-X]" o "[MAT-X]" cuando aparezcan.
  * ORDEN OBLIGATORIO DE SALIDA: Escribe PRIMERO los 2 a 3 renglones explicando o corrigiendo; NUNCA empieces con @@VOZ_ALTA@@.
  * Al final (en la última línea), escribe "@@VOZ_ALTA@@" seguido de 1 sola pregunta corta, natural y en primera persona para ayudar al estudiante a levantar la mano o escribir en Zoom (ej: "@@VOZ_ALTA@@ Profesor, entonces si sube la TPM se desplaza LM y cae la inversión?").`;

  const altAngleNote = bypassCache
    ? `\nNOTA EXTRA: El alumno pidió otro enfoque. Usa una analogía o ángulo distinto al habitual.`
    : '';

  const systemInstruction = `Eres "Cátedra Viva", el co-piloto pedagógico de aula para "${course.code} — ${course.name}" (${course.instructor}).

${modeRules}${altAngleNote}

FILOSOFÍA DE ALCANCE GENEROSA (NUNCA DEJES FUERA UNA DUDA DE APRENDIZAJE):
1. PRIORIDAD 1 — CUALQUIER DUDA ACADÉMICA CONECTABLE AL CURSO O AL APRENDIZAJE:
   - Incluye dudas directas sobre [VIVO-X]/[SLIDE-X], **prerrequisitos matemáticos** (álgebra, despejes, series, derivadas), **ejemplos de actualidad** (ej. Banco Central, TPM, mercados reales), **conexiones interdisciplinarias**, **modismos coloquiales** ("wn no cacho...") y **premisas falsas**.
   - ANTI-PREMISA FALSA: Si el alumno asume algo erróneo (ej. afirmar que subir la TPM desplaza IS o que la curva IS tiene pendiente positiva), NO le sigas la corriente; corrige explícitamente con rigor económico/científico citando [VIVO-X] o [SLIDE-X] antes de responder.
   - DEIXIS TEMPORAL: Si pregunta por "lo último", "recién" o "esta parte", céntrate en los últimos 2 fragmentos [VIVO-X].
   - PRECISIÓN CONCEPTUAL: En IS-LM, la política monetaria (TPM/oferta monetaria $M$) desplaza la curva **LM** y provoca movimiento a lo largo de la IS; la política fiscal ($G, T$) desplaza la curva **IS**.

2. PRIORIDAD 2 — TEMA ACADÉMICO VÁLIDO AÚN NO CUBIERTO EN LA CLASE DE HOY:
   - Si pregunta por un concepto universitario o subtema avanzado que no aparece aún en las fuentes de hoy, empieza con la marca oculta "@@SIN_FUENTE_CLASE@@" y usa un tono cálido y directo (SIN bloqueos ni frialdad):
     ${teacherSettings.allowComplement
       ? `"El profesor aún no ha visto este punto en la clase de hoy, pero se conecta así: " seguido inmediatamente de ${chatMode === 'active' ? '2 líneas breves de orientación clara' : 'la explicación académica completa paso a paso'}.${chatMode === 'active' ? ' Y cierra al final con "@@VOZ_ALTA@@" sugiriendo preguntarle al profe si se verá hoy.' : ''}`
       : `"El profesor aún no ha abordado este punto en la clase de hoy. Puedes enviarlo al Radar para que lo considere si alcanza el tiempo."${chatMode === 'active' ? ' Y cierra con "@@VOZ_ALTA@@" sugiriendo consultarlo.' : ''}`}

3. ÚLTIMO RECURSO — ÚNICAMENTE CHARLA DE ENTRETENIMIENTO AJENA AL ESTUDIO:
   - SOLO si la consulta trata exclusivamente sobre deportes/resultados de fútbol, series/Netflix, farándula, videojuegos o chistes sin vínculo académico, responde únicamente:
     "@@OFF_TOPIC@@ Puedo ayudarte con cualquier duda del ramo, cálculo previo o ejemplo conectado con la clase; este tema queda fuera del espacio académico."
   - En caso de duda mínima sobre si aporta al estudio, **responde como Prioridad 1 o 2**.`;

  const tailContext = buildCompactHistoryAndQuote({ chatHistory, quotedContext });

  const userPrompt = `[MINUTO ACTUAL]: ${currentTimeFormatted}

[FUENTES VERIFICABLES]:
${fullContextText || '(La clase recién comienza)'}${tailContext ? `\n\n${tailContext}` : ''}

[PREGUNTA DEL ESTUDIANTE]:
"${question}"

Respuesta:`;

  const executeChatbotPipeline = async () => {
    const groqTemp = bypassCache ? 0.45 : 0.2;
    const maxTokens = chatMode === 'full_ia' ? 1800 : 900;
    let rawAnswer = '';
    let modelUsed = '';

    const { hasGroq, hasGemini } = hasApiKeys();

    if (hasGroq) {
      for (const modelId of ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']) {
        const res = await callGroqChat({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          temperature: groqTemp,
          maxTokens
        });

        if (res.status === 429) {
          console.warn(`[Chatbot Pool] Rate limit en ${modelId}, rotando...`);
          continue;
        }
        if (res.ok) {
          rawAnswer = res.text;
          modelUsed = modelId;
          break;
        }
      }
    }

    if (!rawAnswer && hasGemini) {
      const gem = await callGeminiFlashLite({
        promptText: `${systemInstruction}\n\n${userPrompt}`,
        temperature: groqTemp,
        maxOutputTokens: maxTokens
      });
      if (gem.ok) {
        rawAnswer = gem.text;
        modelUsed = 'gemini-3.5-flash-lite';
      }
    }

    if (!rawAnswer && hasGroq) {
      await new Promise(r => setTimeout(r, 2000));
      const retryGroq = await callGroqChat({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt }
        ],
        temperature: groqTemp,
        maxTokens
      });
      if (retryGroq.ok) {
        rawAnswer = retryGroq.text;
        modelUsed = 'openai/gpt-oss-120b';
      }
    }

    if (!rawAnswer) {
      throw new Error('No se pudo obtener respuesta de ningún motor de IA.');
    }

    const parseMarkers = (raw) => {
      const isOffTopicFlag = raw.includes('@@OFF_TOPIC@@') || raw.trim().startsWith('🚫');
      const isUnseenFlag = raw.includes('@@SIN_FUENTE_CLASE@@');

      let cleaned = raw
        .replace(/@@OFF_TOPIC@@/g, '')
        .replace(/@@SIN_FUENTE_CLASE@@/g, '')
        .replace(/^🚫\s*/, '')
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

    // Guardia determinista: evitar falso off-topic si tiene rasgos académicos o viene citando contexto
    if (parsed.isOffTopic && (hasQuote || isLikelyAcademicQuestion(question, course, liveEntries)) && hasGemini) {
      console.warn('[Chatbot Guard] Posible falso @@OFF_TOPIC@@ en pregunta académica/atípica; reintentando con gemini-3.5-flash-lite...');
      const correctivePrompt = `${systemInstruction}\n\nNOTA CRÍTICA: Esta consulta sí busca comprender un concepto académico, prerrequisito o ejemplo real conectado al ramo. NO respondas @@OFF_TOPIC@@. Responde útilmente citando [VIVO-X]/[SLIDE-X] o conectándolo.\n\n${userPrompt}`;
      const gemRetry = await callGeminiFlashLite({
        promptText: correctivePrompt,
        temperature: 0.2,
        maxOutputTokens: maxTokens
      });
      if (gemRetry.ok && !gemRetry.text.includes('@@OFF_TOPIC@@')) {
        parsed = parseMarkers(gemRetry.text);
        modelUsed = 'gemini-3.5-flash-lite';
      }
    }

    // Guardia anti-cuerpo vacío (si el LLM empezó directo con @@VOZ_ALTA@@)
    if (!parsed.isOffTopic && parsed.mainAnswer.length < 15 && hasGemini) {
      console.warn('[Chatbot Guard] Cuerpo vacío antes de @@VOZ_ALTA@@; corrigiendo con gemini-3.5-flash-lite...');
      const bodyPrompt = `${systemInstruction}\n\nNOTA CRÍTICA: Escribe PRIMERO la respuesta o corrección de 2 a 3 líneas citando [VIVO-X]/[SLIDE-X] y recién al final agrega @@VOZ_ALTA@@.\n\n${userPrompt}`;
      const bodyRetry = await callGeminiFlashLite({
        promptText: bodyPrompt,
        temperature: 0.2,
        maxOutputTokens: maxTokens
      });
      if (bodyRetry.ok) {
        const reparsed = parseMarkers(bodyRetry.text);
        if (reparsed.mainAnswer.length >= 15) {
          parsed = reparsed;
          modelUsed = 'gemini-3.5-flash-lite';
        }
      }
    }

    const questionType = parsed.isOffTopic
      ? 'off_topic'
      : parsed.isUnseenAcademic
      ? 'unseen_academic'
      : 'grounded';

    const resultPayload = {
      status: 'ok',
      chatMode,
      questionType,
      canForwardToTeacher: !parsed.isOffTopic,
      modelUsed,
      fromCache: false,
      answer: parsed.mainAnswer,
      complement: parsed.complementText,
      voicePrompt: parsed.voicePrompt,
      tokenMetrics: estimateTokenMetrics({
        fullContextText,
        question,
        answerText: parsed.mainAnswer + (parsed.complementText || ''),
        fromCache: false
      }),
      timestamp: new Date().toISOString()
    };

    if (allowCacheAndCoalesce && !hasHistory && !parsed.isOffTopic) {
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

  if (allowCacheAndCoalesce) {
    const flightPromise = executeChatbotPipeline();
    setInFlightQuery(flightKey, flightPromise);
    try {
      return await flightPromise;
    } finally {
      deleteInFlightQuery(flightKey);
    }
  }

  return await executeChatbotPipeline();
}
