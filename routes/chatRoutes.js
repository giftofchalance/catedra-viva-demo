/**
 * Rutas del Chatbot Tutor Pedagógico (Quote-Reply, Memoria Multi-Turno y Radar en Vivo).
 */

import { Router } from 'express';
import { getCourse, matchSlideForSegment } from '../data/coursesDb.js';
import { answerStudentQuestion } from '../services/tutor.js';
import { detectTopicCluster } from '../services/radar.js';
import {
  liveSession,
  getActiveCourseId,
  upsertTopicCluster,
  bumpStateVersion
} from '../state/sessionStore.js';

const router = Router();

router.post('/api/chat', async (req, res) => {
  try {
    const {
      question,
      currentTimeFormatted = '00:00',
      bypassCache = false,
      quotedContext = null,
      chatHistory = []
    } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía.' });
    }

    const cleanQ = question.trim();
    const courseId = getActiveCourseId();
    const currentCourse = getCourse(courseId);

    const response = await answerStudentQuestion({
      question: cleanQ,
      course: currentCourse,
      liveEntries: liveSession.entries,
      teacherSettings: liveSession.teacherSettings,
      currentTimeFormatted,
      bypassCache: !!bypassCache,
      quotedContext,
      chatHistory
    });

    const slideMatch = matchSlideForSegment(courseId, cleanQ);
    const detectedTopic = detectTopicCluster({
      text: cleanQ,
      course: currentCourse,
      liveEntries: liveSession.entries,
      existingClusters: liveSession.topicClusters,
      slideRef: slideMatch
    });

    const questionId = `Q-${liveSession.questions.length + 1}`;
    const rawAns = (response.answer || '').replace(/\s+/g, ' ').trim();
    const answerSummary = rawAns.length > 260 ? rawAns.slice(0, 257) + '...' : rawAns;

    liveSession.questions.push({
      id: questionId,
      question: cleanQ,
      answerSummary,
      chatMode: response.chatMode || liveSession.teacherSettings.chatState || 'active',
      phase: liveSession.classClosed ? 'post_class' : 'in_class',
      questionType: response.questionType || 'grounded',
      topicKey: detectedTopic?.key || 'general',
      topicLabel: detectedTopic?.label || 'General',
      fromCache: !!response.fromCache,
      hasQuote: Boolean(quotedContext && quotedContext.text),
      timestamp: currentTimeFormatted,
      createdAt: new Date().toISOString()
    });

    liveSession.tokenomics.totalQueries += 1;
    if (response.fromCache) liveSession.tokenomics.cacheHits += 1;
    if (response.tokenMetrics) {
      liveSession.tokenomics.prefixTokensSaved += response.tokenMetrics.savedTokens || 0;
      liveSession.tokenomics.cloudCostUsd = Number((liveSession.tokenomics.cloudCostUsd + (response.tokenMetrics.cloudCostNoOptUsd || 0)).toFixed(6));
      liveSession.tokenomics.onPremCostUsd = Number((liveSession.tokenomics.onPremCostUsd + (response.tokenMetrics.onPremGpuMarginalUsd || 0)).toFixed(6));
    }

    // Alimentar Radar siempre mientras la clase NO esté cerrada (incluso si el profe abrió Full IA en vivo)
    let clusterInfo = null;
    if (response.questionType !== 'off_topic' && !liveSession.classClosed) {
      const cluster = upsertTopicCluster({
        course: currentCourse,
        text: cleanQ,
        questionId,
        timestamp: currentTimeFormatted,
        slideRef: slideMatch
      });
      clusterInfo = {
        clusterId: cluster.id,
        clusterLabel: cluster.label,
        clusterCount: cluster.count
      };
    }

    bumpStateVersion();
    console.log(`[Student Chat] [${currentTimeFormatted}] (${response.chatMode}/${response.questionType}): "${cleanQ}"`);

    res.json({
      ...response,
      questionId,
      ...(clusterInfo || {})
    });
  } catch (error) {
    console.error('Error en /api/chat:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
