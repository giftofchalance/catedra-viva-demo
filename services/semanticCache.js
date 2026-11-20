/**
 * Tokenomics sin Sesgo Epistémico:
 * - Guardia de Negación y Operadores Numéricos
 * - Invalidador Temporal por avance de transcripción
 * - Single-Flight Coalescing para ráfagas simultáneas
 * - Exclusión automática de follow-ups conversacionales y citas directas
 */

import { normalizeSearchText, extractMeaningfulTokens, computeJaccard } from './textUtils.js';

const SAFE_SEMANTIC_CACHE = new Map();
const IN_FLIGHT_QUERIES = new Map();

export function clearSemanticCache() {
  SAFE_SEMANTIC_CACHE.clear();
  IN_FLIGHT_QUERIES.clear();
}

export function extractLogicalSignature(text = '') {
  const low = text.toLowerCase();
  const negations = (low.match(/\b(no|nunca|jamás|jamas|sin|ni|tampoco|ningún|ninguna|falso|incorrecto|contrario|diferencia|distinto)\b/g) || []).sort().join(',');
  const operators = (low.match(/(<=|>=|!=|==|<|>|=|\+|\-|\d+(\.\d+)?)/g) || []).sort().join(',');
  return `${negations}|${operators}`;
}

export function tokenizeSemanticCore(text = '') {
  return extractMeaningfulTokens(text, 3);
}

/**
 * Detecta preguntas de seguimiento o anafóricas que dependen del turno anterior
 * y NO deben responderse desde el caché global estático.
 */
export function isFollowUpQuestion(question = '') {
  const norm = normalizeSearchText(question).trim();
  if (!norm) return false;

  const explicitFollowUp = /(no entendi eso|eso mismo|lo anterior|el segundo paso|primer paso|tercer paso|otro ejemplo|dame un ejemplo|explicalo distinto|de otra forma|puedes repetir|no me quedo claro|^y por que|^y si |^pero y |^entonces )/i;
  if (explicitFollowUp.test(norm)) return true;

  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length <= 5 && /\b(eso|esto|esa|ese|anterior|mismo|ambos|ese paso|esa parte)\b/.test(norm)) {
    return true;
  }

  return false;
}

export function checkSafeSemanticCache({ question, courseId, chatMode, transcriptCount }) {
  const signature = extractLogicalSignature(question);
  const tokens = tokenizeSemanticCore(question);
  const normalizedExact = question.toLowerCase().replace(/[¿?¡!.,\s]+/g, ' ').trim();

  for (const [, cached] of SAFE_SEMANTIC_CACHE.entries()) {
    if (cached.courseId !== courseId || cached.chatMode !== chatMode) continue;
    if (cached.transcriptCount !== transcriptCount) continue;
    if (cached.logicalSignature !== signature) continue;

    if (cached.normalizedExact === normalizedExact || computeJaccard(tokens, cached.tokens) >= 0.85) {
      return cached.payload;
    }
  }
  return null;
}

export function recordSafeSemanticCache({ question, courseId, chatMode, transcriptCount, payload }) {
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

export function getInFlightQuery(flightKey) {
  return IN_FLIGHT_QUERIES.get(flightKey) || null;
}

export function setInFlightQuery(flightKey, promise) {
  IN_FLIGHT_QUERIES.set(flightKey, promise);
}

export function deleteInFlightQuery(flightKey) {
  IN_FLIGHT_QUERIES.delete(flightKey);
}

export function estimateTokenMetrics({ fullContextText, question, answerText, fromCache }) {
  const approxPrefixTokens = Math.max(120, Math.round((fullContextText.length + 1400) / 4));
  const approxDeltaTokens = Math.max(15, Math.round(question.length / 4));
  const approxOutputTokens = Math.max(20, Math.round((answerText || '').length / 4));

  const savedByPrefixOrCache = fromCache
    ? approxPrefixTokens + approxDeltaTokens + approxOutputTokens
    : Math.round(approxPrefixTokens * 0.92);

  const cloudCostNoOptUsd = ((approxPrefixTokens + approxDeltaTokens) * 0.60 + approxOutputTokens * 1.80) / 1000000;
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
