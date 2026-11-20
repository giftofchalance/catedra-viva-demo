/**
 * Estado centralizado en memoria de la sesión en vivo y hub SSE.
 */

import { getCourse } from '../data/coursesDb.js';
import { calculatePaceMetrics } from '../services/labeler.js';
import { detectTopicCluster } from '../services/radar.js';
import { clearSemanticCache } from '../services/semanticCache.js';

let activeCourseId = 'macro';
const sseClients = new Set();

export const liveSession = {
  isActive: false,
  classClosed: false,
  stateVersion: 1,
  courseId: activeCourseId,
  classTitle: 'Clase en Vivo',
  startTime: null,
  elapsedSeconds: 0,
  entries: [],
  chapters: [
    { minute: '00:00', seconds: 0, title: 'Apertura y Objetivos' }
  ],
  lostAlerts: [],
  questions: [],
  forwardedQuestions: [],
  topicClusters: [],
  tokenomics: {
    totalQueries: 0,
    cacheHits: 0,
    prefixTokensSaved: 0,
    cloudCostUsd: 0,
    onPremCostUsd: 0,
    ephemeralChunksDeleted: 0
  },
  lastCapsule: null,
  teacherSettings: {
    chatState: 'active', // 'paused' | 'active' | 'full_ia'
    allowComplement: true
  }
};

export function getActiveCourseId() {
  return activeCourseId;
}

export function setActiveCourseId(courseId) {
  activeCourseId = courseId;
  liveSession.courseId = courseId;
  liveSession.lastCapsule = null;
  resetLiveSessionData(false);
}

export function addSseClient(res) {
  sseClients.add(res);
  res.write(`event: state\ndata: ${JSON.stringify({ stateVersion: liveSession.stateVersion })}\n\n`);
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

export function broadcastVersion() {
  const payload = `event: state\ndata: ${JSON.stringify({ stateVersion: liveSession.stateVersion })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

export function bumpStateVersion() {
  liveSession.stateVersion += 1;
  broadcastVersion();
  return liveSession.stateVersion;
}

export function resetLiveSessionData(keepChatMode = false) {
  liveSession.entries = [];
  liveSession.lostAlerts = [];
  liveSession.questions = [];
  liveSession.forwardedQuestions = [];
  liveSession.topicClusters = [];
  liveSession.chapters = [{ minute: '00:00', seconds: 0, title: 'Apertura y Objetivos' }];
  liveSession.elapsedSeconds = 0;
  liveSession.isActive = false;
  liveSession.classClosed = false;
  liveSession.tokenomics = {
    totalQueries: 0,
    cacheHits: 0,
    prefixTokensSaved: 0,
    cloudCostUsd: 0,
    onPremCostUsd: 0,
    ephemeralChunksDeleted: 0
  };
  if (!keepChatMode) {
    liveSession.teacherSettings.chatState = 'active';
  }
  clearSemanticCache();
  bumpStateVersion();
}

export function upsertTopicCluster({
  course,
  text = '',
  isLostAlert = false,
  questionId = null,
  escalated = false,
  timestamp = '00:00',
  slideRef = null
}) {
  const detected = detectTopicCluster({
    text,
    course,
    liveEntries: liveSession.entries,
    existingClusters: liveSession.topicClusters,
    slideRef
  });

  let cluster = liveSession.topicClusters.find(c => c.key === detected.key);
  if (!cluster) {
    cluster = {
      id: `CL-${liveSession.topicClusters.length + 1}`,
      key: detected.key,
      label: detected.label,
      suggestion: detected.suggestion,
      count: 0,
      lostCount: 0,
      fastCount: 0,
      exampleCount: 0,
      escalatedCount: 0,
      status: 'open',
      resolvedAt: null,
      lastTimestamp: timestamp,
      questions: [],
      questionIds: []
    };
    liveSession.topicClusters.push(cluster);
  }

  const alreadyCountedChat = questionId && cluster.questionIds.includes(questionId);
  if (!alreadyCountedChat) {
    cluster.count += 1;
    if (questionId) cluster.questionIds.push(questionId);
    if (isLostAlert) cluster.lostCount += 1;
    if (text && !cluster.questions.includes(text)) {
      cluster.questions.push(text);
    }
    if (cluster.status === 'resolved' || cluster.status === 'auto_resolved') {
      cluster.status = 'open';
      cluster.resolvedAt = null;
    }
  }

  if (escalated) {
    cluster.escalatedCount += 1;
    if (text && !cluster.questions.includes(text)) {
      cluster.questions.push(text);
    }
    if (cluster.status === 'resolved' || cluster.status === 'auto_resolved') {
      cluster.status = 'open';
      cluster.resolvedAt = null;
    }
  }

  cluster.lastTimestamp = timestamp;
  return cluster;
}

export function buildPublicLiveState() {
  const course = getCourse(activeCourseId);
  const pace = calculatePaceMetrics(liveSession.entries);
  const sortedClusters = liveSession.topicClusters
    .slice()
    .sort((a, b) => {
      const aDone = a.status === 'resolved' || a.status === 'auto_resolved';
      const bDone = b.status === 'resolved' || b.status === 'auto_resolved';
      if (aDone && !bDone) return 1;
      if (bDone && !aDone) return -1;
      return (b.count + b.escalatedCount * 2) - (a.count + a.escalatedCount * 2);
    });

  return {
    stateVersion: liveSession.stateVersion,
    classClosed: liveSession.classClosed,
    course,
    teacherSettings: liveSession.teacherSettings,
    isActive: liveSession.isActive,
    elapsedSeconds: liveSession.elapsedSeconds,
    entries: liveSession.entries,
    chapters: liveSession.chapters,
    lostCountTotal: liveSession.lostAlerts.reduce((acc, curr) => acc + (curr.count || 1), 0),
    lostAlertsRecent: liveSession.lostAlerts.slice(-5),
    questions: liveSession.questions.slice(-20),
    forwardedQuestions: liveSession.forwardedQuestions.slice(-10),
    topicClusters: sortedClusters,
    tokenomics: liveSession.tokenomics,
    lastCapsule: liveSession.lastCapsule,
    pace
  };
}
