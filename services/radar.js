/**
 * Radar Inteligente de Comprensión, Auto-Resolución por Voz y Smart Chapters con Histéresis.
 * 100% agnóstico al ramo (sin reglas hardcodeadas para cursos específicos).
 */

import { normalizeSearchText, extractMeaningfulTokens, computeJaccard } from './textUtils.js';

export { extractMeaningfulTokens };

const META_QUERY_WORDS = new Set([
  'calculo', 'calcular', 'despejar', 'valor', 'relacion', 'efecto', 'sube',
  'baja', 'aumenta', 'disminuye', 'pasa', 'diferencia', 'formula', 'ejemplo'
]);

function buildTopicSlug(tokens = []) {
  return 'topic_' + tokens.slice(0, 3).join('_').replace(/[^a-z0-9_]/g, '');
}

function formatTopicLabel(tokens = []) {
  const acronyms = new Set(['is-lm', 'capm', 'wacc', 'van', 'tir', 'pib', 'tpm', 'ipc', 'fem']);
  return tokens
    .slice(0, 3)
    .map(t => (acronyms.has(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)))
    .join(' ');
}

function isPulseHelperText(text = '') {
  const low = (text || '').trim();
  return !low || low.startsWith('🐢') || low.startsWith('💡') || low.length < 6;
}

function matchSlideAgnostic(tokens = [], normText = '', slides = []) {
  if (!slides || slides.length === 0 || tokens.length === 0) return null;

  let bestSlide = null;
  let bestScore = 0;

  for (const slide of slides) {
    let score = 0;
    const titleTokens = extractMeaningfulTokens(slide.title || '');
    const bulletTokens = extractMeaningfulTokens((slide.bulletPoints || []).join(' '));
    const kwList = (slide.keywords || []).map(k => normalizeSearchText(k)).filter(Boolean);

    for (const kw of kwList) {
      if (normText.includes(kw)) score += 3;
    }

    const tokenSet = new Set(tokens);
    for (const tt of titleTokens) {
      if (tokenSet.has(tt)) score += 2;
    }
    for (const bt of bulletTokens) {
      if (tokenSet.has(bt)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlide = slide;
    }
  }

  return bestScore >= 2 ? bestSlide : null;
}

/**
 * Clasifica una pregunta o señal de pulso en un tópico unificado del Radar Profe/Auxiliar,
 * de forma completamente agnóstica al ramo activo.
 */
export function detectTopicCluster({
  text = '',
  course = null,
  liveEntries = [],
  existingClusters = [],
  slideRef = null
}) {
  if (slideRef && slideRef.title) {
    return {
      key: `slide_${slideRef.id}`,
      label: `Lámina ${slideRef.number}: ${slideRef.title}`,
      suggestion: `Reforzar la explicación de "${slideRef.title}" (Lámina ${slideRef.number}) con un ejemplo breve.`
    };
  }

  const lastEntry = liveEntries[liveEntries.length - 1] || null;
  const pulseOnly = isPulseHelperText(text);

  if (pulseOnly && lastEntry?.slideRef?.title) {
    return {
      key: `slide_${lastEntry.slideRef.id}`,
      label: `Lámina ${lastEntry.slideRef.number}: ${lastEntry.slideRef.title}`,
      suggestion: `Pausa breve recomendada en [${lastEntry.timestamp}]: revisar "${lastEntry.slideRef.title}".`
    };
  }

  const anchorText = pulseOnly ? (lastEntry?.text || '') : text;
  const normAnchor = normalizeSearchText(anchorText);
  const rawTokens = extractMeaningfulTokens(anchorText);
  const queryTokens = rawTokens.filter(t => !META_QUERY_WORDS.has(t));
  const effectiveTokens = queryTokens.length > 0 ? queryTokens : rawTokens;

  // 1. Reutilizar cluster existente en la sesión si comparte tópico real
  if (existingClusters && existingClusters.length > 0 && effectiveTokens.length > 0) {
    let bestCluster = null;
    let bestOverlap = 0;

    for (const cluster of existingClusters) {
      if (cluster.key?.startsWith('general_')) continue;
      const clusterSource = `${cluster.label || ''} ${(cluster.questions || []).slice(-3).join(' ')}`;
      const clusterTokens = extractMeaningfulTokens(clusterSource);
      const jaccard = computeJaccard(effectiveTokens, clusterTokens);
      const sharedCount = effectiveTokens.filter(t => clusterTokens.includes(t)).length;

      const score = sharedCount * 0.4 + jaccard;
      if ((sharedCount >= 2 || jaccard >= 0.3) && score > bestOverlap) {
        bestOverlap = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      return {
        key: bestCluster.key,
        label: bestCluster.label,
        suggestion: bestCluster.suggestion
      };
    }
  }

  // 2. Intentar emparejar automáticamente contra slides del curso
  const matchedSlide = matchSlideAgnostic(effectiveTokens, normAnchor, course?.ucursosSync?.slides);
  if (matchedSlide) {
    return {
      key: `slide_${matchedSlide.id}`,
      label: `Lámina ${matchedSlide.number}: ${matchedSlide.title}`,
      suggestion: `Reforzar la explicación de "${matchedSlide.title}" (Lámina ${matchedSlide.number}).`
    };
  }

  // 3. Si es pulso o referencia al último segmento con capítulo temático
  if (lastEntry?.chapterTitle && (pulseOnly || effectiveTokens.length <= 1)) {
    const cleanTitle = lastEntry.chapterTitle.trim();
    return {
      key: `ch_${normalizeSearchText(cleanTitle).replace(/[^a-z0-9]+/g, '_')}`,
      label: cleanTitle,
      suggestion: `Retomar el concepto de "${cleanTitle}" expuesto en [${lastEntry.timestamp}].`
    };
  }

  // 4. Construir cluster dinámico limpio desde tokens significativos
  const informative = effectiveTokens.filter(t => t.length >= 4 || ['pib', 'van', 'tir', 'tpm', 'fem', 'ohm'].includes(t));
  if (informative.length > 0) {
    const picked = [...new Set(informative)].slice(0, 3);
    const label = formatTopicLabel(picked);
    return {
      key: buildTopicSlug(picked),
      label,
      suggestion: `Aclarar en pizarra el concepto de "${label}" y confirmar con el curso si quedó claro.`
    };
  }

  return {
    key: `general_${course?.id || 'curso'}`,
    label: `Duda General de ${course?.code || 'la Clase'}`,
    suggestion: 'Revisar el último bloque expuesto y confirmar si el paso clave quedó claro antes de avanzar.'
  };
}

/**
 * Auto-Resolución Hands-Free por Voz:
 * Requiere al menos 8 palabras para evitar falsos positivos por mención casual.
 */
export function autoResolveClustersFromVoice(course, newEntry, topicClusters = []) {
  if (!newEntry || !newEntry.text) return [];
  const words = newEntry.text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 8) return [];

  const entryTokens = extractMeaningfulTokens(newEntry.text);
  const spokenTopic = detectTopicCluster({
    text: newEntry.text,
    course,
    liveEntries: [newEntry],
    existingClusters: topicClusters,
    slideRef: newEntry.slideRef
  });

  const resolvedNow = [];
  for (const c of topicClusters) {
    if (c.status !== 'open') continue;

    let matches = c.key === spokenTopic.key;
    if (!matches) {
      const clusterTokens = new Set(extractMeaningfulTokens(`${c.label || ''} ${(c.questions || []).join(' ')}`));
      const shared = entryTokens.filter(t => clusterTokens.has(t));
      matches = shared.length >= 2;
    }

    if (matches) {
      c.status = 'auto_resolved';
      c.resolvedAt = newEntry.timestamp;
      resolvedNow.push(c);
    }
  }

  return resolvedNow;
}

/**
 * Capítulos Inteligentes con Histéresis anti ping-pong:
 * - Mínimo 8 palabras en el segmento
 * - Ventana mínima >= 50s respecto al capítulo anterior (tras Apertura)
 * - No repetir ninguno de los últimos 2 títulos de capítulo
 */
export function maybeUpdateSmartChapters(chapters = [], newEntry, labeled, secNum, timestamp) {
  if (!newEntry || !newEntry.text) return false;
  const wordCount = newEntry.text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 8) return false;

  const candidateTitle = (labeled?.chapterTitle && labeled.chapterTitle.length > 3)
    ? labeled.chapterTitle.trim()
    : (newEntry.slideRef?.title || null);

  if (!candidateTitle || candidateTitle.length <= 3) return false;

  const lastChapter = chapters[chapters.length - 1];
  const lastChapterSec = lastChapter?.seconds || 0;
  const enoughTimeElapsed = (secNum - lastChapterSec) >= 50 || chapters.length === 1;
  if (!enoughTimeElapsed) return false;

  const normCandidate = normalizeSearchText(candidateTitle);
  const candTokens = extractMeaningfulTokens(candidateTitle);

  const recentChapters = chapters.slice(-2);
  const repeatsRecent = recentChapters.some(ch => {
    const normPrev = normalizeSearchText(ch.title || '');
    if (normPrev === normCandidate) return true;
    const prevTokens = extractMeaningfulTokens(ch.title || '');
    return computeJaccard(candTokens, prevTokens) >= 0.75;
  });

  if (repeatsRecent) return false;

  chapters.push({
    minute: timestamp,
    seconds: secNum,
    title: candidateTitle
  });
  return true;
}
