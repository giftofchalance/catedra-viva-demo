/**
 * Barrel de compatibilidad V4 para el motor de IA modular.
 */

export { transcribeLiveAudio, mergeOverlappingTranscript, cleanWhisperOutput, normalizeSpokenTerms } from './stt.js';
export { labelAndCleanSegment, calculatePaceMetrics, detectHeuristicCategory } from './labeler.js';
export { detectTopicCluster, autoResolveClustersFromVoice, maybeUpdateSmartChapters, extractMeaningfulTokens } from './radar.js';
export { clearSemanticCache, isFollowUpQuestion } from './semanticCache.js';
export { answerStudentQuestion, isLikelyAcademicQuestion } from './tutor.js';
export { generateFusedPostClassCapsule, generateClassSummary } from './capsule.js';
