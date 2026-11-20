/**
 * Generador de Cápsula Post-Clase ("Apunte Vivo Fusionado", Pauta Auxiliar y Data/Insights)
 * + Resumen histórico compacto para el cierre de clase.
 */

import { callGroqChat, callGeminiFlashLite, hasApiKeys } from './llmClients.js';

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

  const unmappedEntries = liveEntries.filter(e => !e.slideRef);

  const teacherEmphasis = liveEntries.filter(e =>
    e.category === 'importancia' ||
    /\b(ojo|importante|control|prueba|examen|no confundan)\b/i.test(e.text || '')
  );

  const validQa = (questionsLog || []).filter(q => q.questionType !== 'off_topic');
  const postClassQuestions = validQa.filter(q => (q.phase ? q.phase === 'post_class' : q.chatMode === 'full_ia'));
  const inClassQuestions = validQa.filter(q => !(q.phase ? q.phase === 'post_class' : q.chatMode === 'full_ia'));

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

  const mdLines = [
    `# Apunte Vivo Fusionado — ${course.code}: ${course.name}`,
    `**Profesor:** ${course.instructor} | **Fuente PPT:** ${course.ucursosSync?.deckTitle || 'Pizarra Libre (Sin PPT)'}`,
    ''
  ];

  if (teacherEmphasis.length > 0) {
    mdLines.push(`## Avisos y Énfasis del Profesor ("Ojo para el Control")`);
    teacherEmphasis.forEach(em => mdLines.push(`- **[${em.timestamp}]** ${em.text}`));
    mdLines.push('');
  }

  slideBlocks.forEach(sb => {
    if (sb.spokenEntries.length === 0 && liveEntries.length > 0) return;
    mdLines.push(`## Lámina ${sb.slideNumber}: ${sb.title}`);
    sb.bulletPoints.forEach(bp => mdLines.push(`> *Diapositiva:* ${bp}`));
    if (sb.spokenEntries.length > 0) {
      mdLines.push(`\n**Lo que explicó el profesor en sala:**`);
      sb.spokenEntries.forEach(se => mdLines.push(`- **[${se.timestamp}]** ${se.text}`));
    }
    mdLines.push('');
  });

  if (unmappedEntries.length > 0) {
    mdLines.push(`## Explicaciones de Pizarra / Contexto Libre`);
    unmappedEntries.forEach(ue => mdLines.push(`- **[${ue.timestamp}]** ${ue.text}`));
    mdLines.push('');
  }

  const taMdLines = [
    `# Pauta de Refuerzo para Auxiliar — ${course.code}: ${course.name}`,
    `Generado automáticamente desde el Radar Anónimo de Comprensión (Capa 2).`,
    ''
  ];

  if (taFocusPoints.length === 0) {
    taMdLines.push(`- No se registraron cuellos de botella críticos durante la sesión.`);
  } else {
    taFocusPoints.forEach((tp, i) => {
      const statusText = tp.status === 'resolved'
        ? 'Aclarado en pizarra'
        : tp.status === 'auto_resolved'
        ? `Retomado oralmente por el profesor [${tp.resolvedAt || ''}]`
        : tp.status === 'for_ta'
        ? 'Marcado para Ayudantía'
        : 'Pendiente (revisar en ayudantía)';

      taMdLines.push(`## ${i + 1}. ${tp.topic} (${tp.totalSignals} señales / ${tp.lostCount} "Me perdí")`);
      taMdLines.push(`- **Estado en clase:** ${statusText}`);
      taMdLines.push(`- **Foco sugerido:** ${tp.suggestion}`);
      if (tp.sampleQuestions.length > 0) {
        taMdLines.push(`- **Dudas anónimas representativas:**`);
        tp.sampleQuestions.forEach(sq => taMdLines.push(`  - *"${sq}"*`));
      }
      taMdLines.push('');
    });
  }

  if (postClassQuestions.length > 0) {
    taMdLines.push(`## Dudas de Estudio Post-Clase (Full IA)`);
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

export async function generateClassSummary(course, liveEntries = []) {
  let compactEntries = liveEntries;
  if (liveEntries.length > 20) {
    const picked = [
      ...liveEntries.slice(0, 5),
      ...liveEntries.filter((e, i) => i >= 5 && i < liveEntries.length - 10 && (e.category === 'importancia' || e.category === 'formula' || e.category === 'ejemplo')).slice(0, 5),
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

  const { hasGroq, hasGemini } = hasApiKeys();

  if (hasGroq) {
    const groqRes = await callGroqChat({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: fullTranscript || 'Sin transcripción' }
      ],
      temperature: 0.2,
      maxTokens: 700,
      jsonMode: true
    });
    if (groqRes.ok) {
      try {
        return JSON.parse(groqRes.text);
      } catch (_) {}
    }
  }

  if (hasGemini) {
    const gemRes = await callGeminiFlashLite({
      promptText: `${systemInstruction}\n\nTranscripción:\n${fullTranscript || 'Sin transcripción'}`,
      temperature: 0.2,
      maxOutputTokens: 700,
      jsonMode: true
    });
    if (gemRes.ok) {
      try {
        return JSON.parse(gemRes.text);
      } catch (_) {}
    }
  }

  return {
    title: `Sesión de ${course.name}`,
    summary: 'Resumen generado automáticamente a partir de las intervenciones del aula.',
    keyFormulas: []
  };
}
