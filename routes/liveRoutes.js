/**
 * Rutas en vivo: estado, SSE, ingesta efímera de audio, simulador, controles docentes, pulsos, cápsula y QR.
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import QRCode from 'qrcode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegPath from 'ffmpeg-static';

import {
  getCourse,
  recordClosedClass,
  matchSlideForSegment
} from '../data/coursesDb.js';
import {
  transcribeLiveAudio,
  mergeOverlappingTranscript
} from '../services/stt.js';
import { labelAndCleanSegment, calculatePaceMetrics } from '../services/labeler.js';
import {
  detectTopicCluster,
  autoResolveClustersFromVoice,
  maybeUpdateSmartChapters
} from '../services/radar.js';
import { generateFusedPostClassCapsule, generateClassSummary } from '../services/capsule.js';
import {
  liveSession,
  getActiveCourseId,
  addSseClient,
  bumpStateVersion,
  resetLiveSessionData,
  upsertTopicCluster,
  buildPublicLiveState
} from '../state/sessionStore.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const uploadDir = path.join(PROJECT_ROOT, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const audioMacroPath = path.join(PROJECT_ROOT, 'Modelo IS-LM - Explicado para principiantes!.mp3');
const audioCalculusPath = path.join(PROJECT_ROOT, 'Clase_Calculo_Derivadas.mp3');
const audioFinanzasPath = path.join(PROJECT_ROOT, 'Clase_Finanzas_CAPM.mp3');

const router = Router();

router.get('/audio/clase.mp3', (req, res) => {
  if (fs.existsSync(audioMacroPath)) res.sendFile(audioMacroPath);
  else res.status(404).json({ error: 'Audio macro no encontrado' });
});

router.get('/audio/calculo.mp3', (req, res) => {
  if (fs.existsSync(audioCalculusPath)) res.sendFile(audioCalculusPath);
  else res.status(404).json({ error: 'Audio cálculo no encontrado' });
});

router.get('/audio/finanzas.mp3', (req, res) => {
  if (fs.existsSync(audioFinanzasPath)) res.sendFile(audioFinanzasPath);
  else res.status(404).json({ error: 'Audio finanzas no encontrado' });
});

router.get('/api/qr', async (req, res) => {
  try {
    const targetUrl = req.query.url || `${req.protocol}://${req.get('host')}/estudiante`;
    const svg = await QRCode.toString(String(targetUrl), {
      type: 'svg',
      width: 190,
      margin: 1,
      color: { dark: '#07090E', light: '#FFFFFF' }
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (_) {
    res.status(500).send('Error generando QR');
  }
});

router.get('/api/live/state', (req, res) => {
  res.json(buildPublicLiveState());
});

router.get('/api/live/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  addSseClient(res);
});

async function ingestTranscriptSegment({ rawText, secNum, currentCourse, isPrimarySpeaker = true }) {
  const prevChrono = liveSession.entries
    .slice()
    .sort((a, b) => a.seconds - b.seconds)
    .pop();

  const dedupedText = mergeOverlappingTranscript(prevChrono?.text || '', rawText);
  if (!dedupedText || !dedupedText.trim()) {
    return null;
  }

  const m = Math.floor(secNum / 60);
  const s = Math.floor(secNum % 60);
  const timestamp = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const labeled = await labelAndCleanSegment({
    text: dedupedText,
    previousSegments: liveSession.entries,
    courseName: currentCourse.name,
    courseGlossary: currentCourse.glossary
  });

  const isTeacher = isPrimarySpeaker && labeled.speakerRole === 'profesor';
  const finalEntryText = labeled.cleanedText || dedupedText;
  const slideRef = matchSlideForSegment(getActiveCourseId(), finalEntryText);

  const newEntry = {
    id: `VIVO-${liveSession.entries.length + 1}`,
    timestamp,
    seconds: secNum,
    speaker: isTeacher ? currentCourse.instructor : 'Intervención en el Aula',
    speakerRole: isTeacher ? 'profesor' : 'interrupcion',
    text: finalEntryText,
    category: labeled.category,
    chapterTitle: labeled.chapterTitle,
    slideRef,
    keyTerms: labeled.keyTerms || [],
    receivedAt: new Date().toISOString()
  };

  liveSession.entries.push(newEntry);
  liveSession.entries.sort((a, b) => a.seconds - b.seconds);
  liveSession.entries.forEach((entry, idx) => {
    entry.id = `VIVO-${idx + 1}`;
  });

  autoResolveClustersFromVoice(currentCourse, newEntry, liveSession.topicClusters);
  maybeUpdateSmartChapters(liveSession.chapters, newEntry, labeled, secNum, timestamp);

  return newEntry;
}

router.post('/api/live/audio-chunk', upload.single('audio'), async (req, res) => {
  let tempConverted = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo de audio' });
    }

    const { elapsedSeconds = 0, isPrimarySpeaker = 'true' } = req.body;
    const currentCourse = getCourse(getActiveCourseId());

    tempConverted = path.join(uploadDir, `chunk_${Date.now()}_clean.mp3`);
    await execFileAsync(ffmpegPath, [
      '-i', req.file.path,
      '-ac', '1',
      '-ar', '16000',
      '-acodec', 'libmp3lame',
      '-y',
      tempConverted
    ]);

    const audioBuffer = fs.readFileSync(tempConverted);
    const transcribedText = await transcribeLiveAudio(audioBuffer, 'audio/mp3');

    try { fs.unlinkSync(req.file.path); } catch (_) {}
    try { fs.unlinkSync(tempConverted); tempConverted = null; } catch (_) {}
    liveSession.tokenomics.ephemeralChunksDeleted += 1;

    const secNum = parseInt(elapsedSeconds, 10) || liveSession.elapsedSeconds || 0;
    liveSession.elapsedSeconds = Math.max(liveSession.elapsedSeconds, secNum + 4);
    liveSession.isActive = true;
    liveSession.classClosed = false;

    const m = Math.floor(secNum / 60);
    const s = Math.floor(secNum % 60);
    const timestamp = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (!transcribedText || !transcribedText.trim()) {
      bumpStateVersion();
      return res.json({
        success: true,
        entry: null,
        timestamp,
        text: '',
        message: 'Silencio o alucinación filtrada'
      });
    }

    const newEntry = await ingestTranscriptSegment({
      rawText: transcribedText,
      secNum,
      currentCourse,
      isPrimarySpeaker: isPrimarySpeaker === 'true'
    });

    bumpStateVersion();
    const pace = calculatePaceMetrics(liveSession.entries);

    if (newEntry) {
      console.log(`[Audio Ingest] [${timestamp}] (${newEntry.category}): "${newEntry.text.substring(0, 60)}..."`);
    }

    res.json({
      success: true,
      entry: newEntry,
      totalEntries: liveSession.entries.length,
      pace,
      chapters: liveSession.chapters
    });
  } catch (error) {
    console.error('Error en /api/live/audio-chunk:', error);
    if (tempConverted && fs.existsSync(tempConverted)) {
      try { fs.unlinkSync(tempConverted); } catch (_) {}
    }
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/simulator/step-chunk', async (req, res) => {
  let tempOut = null;
  try {
    const { startSecond = 0, durationSeconds = 7, customAudioPath = null } = req.body;
    const courseId = getActiveCourseId();
    const currentCourse = getCourse(courseId);

    let targetFile = audioMacroPath;
    if (customAudioPath && fs.existsSync(customAudioPath)) {
      targetFile = customAudioPath;
    } else if (courseId === 'finanzas' && fs.existsSync(audioFinanzasPath)) {
      targetFile = audioFinanzasPath;
    } else if (courseId === 'probabilidades' && fs.existsSync(audioCalculusPath)) {
      targetFile = audioCalculusPath;
    }

    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Archivo de audio base no encontrado' });
    }

    tempOut = path.join(uploadDir, `sim_${Date.now()}.mp3`);
    await execFileAsync(ffmpegPath, [
      '-ss', String(startSecond),
      '-t', String(durationSeconds),
      '-i', targetFile,
      '-acodec', 'libmp3lame',
      '-y',
      tempOut
    ]);

    const audioBuffer = fs.readFileSync(tempOut);
    try { fs.unlinkSync(tempOut); tempOut = null; } catch (_) {}
    liveSession.tokenomics.ephemeralChunksDeleted += 1;

    const text = await transcribeLiveAudio(audioBuffer, 'audio/mp3');

    const m = Math.floor(startSecond / 60);
    const s = Math.floor(startSecond % 60);
    const timestamp = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    liveSession.isActive = true;
    liveSession.classClosed = false;
    liveSession.elapsedSeconds = Math.max(liveSession.elapsedSeconds, startSecond + durationSeconds);

    let newEntry = null;
    if (text && text.trim().length > 0) {
      newEntry = await ingestTranscriptSegment({
        rawText: text,
        secNum: startSecond,
        currentCourse,
        isPrimarySpeaker: true
      });
    }

    bumpStateVersion();
    const pace = calculatePaceMetrics(liveSession.entries);

    res.json({
      success: true,
      timestamp,
      entry: newEntry,
      nextSeconds: startSecond + durationSeconds,
      pace,
      chapters: liveSession.chapters
    });
  } catch (error) {
    console.error('Error en /api/simulator/step-chunk:', error);
    if (tempOut && fs.existsSync(tempOut)) {
      try { fs.unlinkSync(tempOut); } catch (_) {}
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/teacher/settings', (req, res) => {
  const { chatState, allowComplement } = req.body;

  if (chatState !== undefined && ['paused', 'active', 'full_ia'].includes(chatState)) {
    liveSession.teacherSettings.chatState = chatState;
  }
  if (allowComplement !== undefined) {
    liveSession.teacherSettings.allowComplement = !!allowComplement;
  }

  bumpStateVersion();
  console.log('[Teacher Controls] Configuración actualizada:', liveSession.teacherSettings);
  res.json({ success: true, teacherSettings: liveSession.teacherSettings });
});

router.post('/api/teacher/cluster-action', (req, res) => {
  const { clusterId, status } = req.body;
  const cluster = liveSession.topicClusters.find(c => c.id === clusterId);
  if (!cluster) return res.status(404).json({ error: 'Cluster no encontrado' });

  if (['open', 'resolved', 'auto_resolved', 'for_ta'].includes(status)) {
    cluster.status = status;
  }
  bumpStateVersion();
  res.json({ success: true, cluster });
});

router.post('/api/live/lost', (req, res) => {
  const { timestamp = '00:00' } = req.body;
  const existing = liveSession.lostAlerts.find(a => a.timestamp === timestamp);

  if (existing) existing.count = (existing.count || 1) + 1;
  else liveSession.lostAlerts.push({ timestamp, count: 1 });

  const currentCourse = getCourse(getActiveCourseId());
  const lastEntry = liveSession.entries[liveSession.entries.length - 1];
  const cluster = upsertTopicCluster({
    course: currentCourse,
    text: '',
    isLostAlert: true,
    timestamp,
    slideRef: lastEntry?.slideRef || null
  });

  bumpStateVersion();
  const total = liveSession.lostAlerts.reduce((sum, a) => sum + a.count, 0);
  res.json({ success: true, totalLost: total, timestamp, cluster });
});

router.post('/api/live/pulse', (req, res) => {
  const { type = 'lost', timestamp = '00:00' } = req.body;
  const currentCourse = getCourse(getActiveCourseId());
  const lastEntry = liveSession.entries[liveSession.entries.length - 1];

  if (type === 'lost') {
    const existing = liveSession.lostAlerts.find(a => a.timestamp === timestamp);
    if (existing) existing.count = (existing.count || 1) + 1;
    else liveSession.lostAlerts.push({ timestamp, count: 1 });
  }

  const pulseLabel = type === 'fast'
    ? '🐢 Piden bajar un poco el ritmo'
    : type === 'example'
    ? '💡 Piden un ejemplo aplicado en pizarra'
    : '';

  const cluster = upsertTopicCluster({
    course: currentCourse,
    text: pulseLabel,
    isLostAlert: type === 'lost',
    timestamp,
    slideRef: lastEntry?.slideRef || null
  });

  if (type === 'fast') cluster.fastCount = (cluster.fastCount || 0) + 1;
  if (type === 'example') cluster.exampleCount = (cluster.exampleCount || 0) + 1;

  bumpStateVersion();
  const totalLost = liveSession.lostAlerts.reduce((sum, a) => sum + a.count, 0);
  res.json({ success: true, totalLost, cluster });
});

router.get('/api/live/capsule', (req, res) => {
  const course = getCourse(getActiveCourseId());
  const capsule = generateFusedPostClassCapsule(
    course,
    liveSession.entries,
    liveSession.topicClusters,
    liveSession.questions
  );
  res.json({ success: true, capsule });
});

router.post('/api/teacher/close-class', async (req, res) => {
  try {
    const courseId = getActiveCourseId();
    const course = getCourse(courseId);
    console.log(`[Cátedra Viva] Cerrando sesión y activando Post-Clase Full IA para ${course.code}...`);

    const capsule = generateFusedPostClassCapsule(
      course,
      liveSession.entries,
      liveSession.topicClusters,
      liveSession.questions
    );
    liveSession.lastCapsule = capsule;

    const summary = await generateClassSummary(course, liveSession.entries);
    const savedHistorical = recordClosedClass(courseId, {
      title: summary.title,
      summary: summary.summary,
      keyFormulas: summary.keyFormulas
    });

    liveSession.teacherSettings.chatState = 'full_ia';
    liveSession.isActive = false;
    liveSession.classClosed = true;
    bumpStateVersion();

    res.json({
      success: true,
      message: 'Clase cerrada, archivada en memoria histórica y Modo Post-Clase Full IA activado.',
      newHistoricalEntry: savedHistorical,
      capsule,
      teacherSettings: liveSession.teacherSettings,
      updatedCourse: getCourse(courseId)
    });
  } catch (error) {
    console.error('Error cerrando clase:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/live/reset', (req, res) => {
  liveSession.lastCapsule = null;
  resetLiveSessionData(false);
  console.log('[Cátedra Viva] Sesión en vivo reiniciada');
  res.json({ success: true, message: 'Sesión reiniciada con éxito' });
});

router.post('/api/live/forward-question', (req, res) => {
  const { question, timestamp = '00:00', questionId = null } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Pregunta vacía' });
  }

  const cleanQ = question.trim();
  const forwarded = {
    id: `FWD-${liveSession.forwardedQuestions.length + 1}`,
    question: cleanQ,
    questionId,
    timestamp,
    createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  liveSession.forwardedQuestions.push(forwarded);

  const courseId = getActiveCourseId();
  const currentCourse = getCourse(courseId);
  const slideMatch = matchSlideForSegment(courseId, cleanQ);
  const cluster = upsertTopicCluster({
    course: currentCourse,
    text: cleanQ,
    questionId,
    escalated: true,
    timestamp,
    slideRef: slideMatch
  });

  bumpStateVersion();
  console.log(`[Radar Escalado] "${cleanQ}" -> Cluster "${cluster.label}"`);
  res.json({ success: true, forwarded, cluster });
});

export default router;
