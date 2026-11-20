/**
 * Servidor Backend en Node/Express para Cátedra Viva (V2 Clean-Slate)
 * 
 * - Las claves de API (GROQ_API_KEY / GEMINI_API_KEY) permanecen en el servidor.
 * - Sirve la nueva interfaz limpia en /public (index.html, teacher.html, student.html).
 * - Orquesta:
 *   1. Streaming de audio desde el teléfono docente con Whisper Large v3 Turbo + Glosario.
 *   2. Micro-labeling semántico y Smart Chapters (Read.ai style).
 *   3. Controles docentes en vivo: Modo Pizarra (pausa de chat), switch de Complemento IA, filtro de digresiones.
 *   4. RAG Histórico multiclase y cierre de clases hacia la memoria permanente del curso.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import QRCode from 'qrcode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

import { 
  getCoursesList, 
  getCourse, 
  recordClosedClass, 
  addCourseMaterial,
  matchSlideForSegment
} from './data/coursesDb.js';

import {
  transcribeLiveAudio,
  labelAndCleanSegment,
  calculatePaceMetrics,
  answerStudentQuestion,
  generateClassSummary,
  detectTopicCluster,
  generateFusedPostClassCapsule,
  clearSemanticCache
} from './services/aiEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio temporal para uploads
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Estado en memoria de la sesión activa
let activeCourseId = 'macro'; // 'macro' | 'probabilidades' | 'finanzas'

let liveSession = {
  isActive: false,
  classClosed: false,
  courseId: activeCourseId,
  classTitle: 'Clase en Vivo',
  startTime: null,
  elapsedSeconds: 0,
  entries: [],
  chapters: [
    { minute: '00:00', seconds: 0, title: 'Apertura y Objetivos' }
  ],
  lostAlerts: [], // Array de { timestamp, count }
  questions: [], // Historial de preguntas de estudiantes en vivo
  forwardedQuestions: [], // Dudas académicas enviadas al profesor
  topicClusters: [], // Clusters agrupados para Radar Profe/Auxiliar
  tokenomics: {
    totalQueries: 0,
    cacheHits: 0,
    prefixTokensSaved: 0,
    cloudCostUsd: 0,
    onPremCostUsd: 0,
    ephemeralChunksDeleted: 0
  },
  lastCapsule: null, // Último Apunte Vivo Fusionado guardado al cerrar
  teacherSettings: {
    chatState: 'active', // 'paused' (Modo Pizarra) | 'active' (Modo Seguimiento) | 'full_ia' (Modo Post-Clase / Full IA)
    allowComplement: true, // Recuadro violeta de conocimiento IA
    hideDigressions: false, // Por defecto mostrar todo para no ocultar introducciones
    noiseGateThreshold: -35 // dBFS en frontend
  }
};

function resetLiveSessionData(keepChatMode = false) {
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
}

function upsertTopicCluster({
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
      status: 'open', // 'open' | 'resolved' | 'auto_resolved' | 'for_ta'
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

/**
 * Auto-Resolución Hands-Free por Voz:
 * Si había un cluster abierto y el profesor acaba de explicar ese mismo tópico en un segmento nuevo,
 * marca automáticamente el cluster como 'auto_resolved' sin obligar al docente a tocar la pantalla.
 */
function autoResolveClustersFromVoice(course, newEntry) {
  if (!newEntry || newEntry.category === 'digresion') return [];
  const spokenTopic = detectTopicCluster({
    text: newEntry.text,
    course,
    liveEntries: [newEntry],
    slideRef: newEntry.slideRef
  });

  const resolvedNow = [];
  liveSession.topicClusters.forEach(c => {
    if (c.status === 'open' && c.key === spokenTopic.key) {
      c.status = 'auto_resolved';
      c.resolvedAt = newEntry.timestamp;
      resolvedNow.push(c);
    }
  });
  return resolvedNow;
}

/**
 * Actualiza capítulos inteligentes con Debounce compartido entre Audio Real y Simulador:
 * mínimo 5 palabras, no digresión y >=20s desde el último capítulo (o primer capítulo tras apertura).
 */
function maybeUpdateSmartChapters(newEntry, labeled, secNum, timestamp) {
  if (!newEntry || newEntry.category === 'digresion') return;
  const wordCount = (newEntry.text || '').split(/\s+/).filter(Boolean).length;
  if (wordCount < 5) return;

  const candidateTitle = (labeled?.chapterTitle && labeled.chapterTitle.length > 3)
    ? labeled.chapterTitle
    : (newEntry.slideRef?.title || null);
  if (!candidateTitle || candidateTitle.length <= 3) return;

  const lastChapter = liveSession.chapters[liveSession.chapters.length - 1];
  const lastChapterSec = lastChapter?.seconds || 0;
  const isDifferentTitle = !lastChapter || lastChapter.title.toLowerCase() !== candidateTitle.toLowerCase();
  const enoughTimeElapsed = (secNum - lastChapterSec) >= 20 || liveSession.chapters.length === 1;

  if (isDifferentTitle && enoughTimeElapsed) {
    liveSession.chapters.push({
      minute: timestamp,
      seconds: secNum,
      title: candidateTitle
    });
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Evitar caché de JS/HTML en celulares y laptops durante pruebas y presentación
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html') || req.path === '/profesor' || req.path === '/estudiante') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

// Archivos de audio pregrabados para simulaciones
const audioMacroPath = path.join(__dirname, 'Modelo IS-LM - Explicado para principiantes!.mp3');
const audioCalculusPath = path.join(__dirname, 'Clase_Calculo_Derivadas.mp3');
const audioFinanzasPath = path.join(__dirname, 'Clase_Finanzas_CAPM.mp3');

app.get('/audio/clase.mp3', (req, res) => {
  if (fs.existsSync(audioMacroPath)) res.sendFile(audioMacroPath);
  else res.status(404).json({ error: 'Audio macro no encontrado' });
});

app.get('/audio/calculo.mp3', (req, res) => {
  if (fs.existsSync(audioCalculusPath)) res.sendFile(audioCalculusPath);
  else res.status(404).json({ error: 'Audio cálculo no encontrado' });
});

app.get('/audio/finanzas.mp3', (req, res) => {
  if (fs.existsSync(audioFinanzasPath)) res.sendFile(audioFinanzasPath);
  else res.status(404).json({ error: 'Audio finanzas no encontrado' });
});

// Rutas de Vistas Principales
app.get('/profesor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/estudiante', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/simulador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

app.get('/api/qr', async (req, res) => {
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
  } catch (err) {
    res.status(500).send('Error generando QR');
  }
});

// --------------------------------------------------------------------------
// API 1: CURSOS Y ESTADO GLOBAL DE LA SALA
// --------------------------------------------------------------------------

app.get('/api/courses', (req, res) => {
  res.json({
    activeCourseId,
    courses: getCoursesList()
  });
});

app.post('/api/courses/select', (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId es requerido' });

  activeCourseId = courseId;
  liveSession.courseId = courseId;
  liveSession.lastCapsule = null;
  resetLiveSessionData(false);

  console.log(`[Cátedra Viva] Ramo activo cambiado a: ${courseId}`);
  res.json({ success: true, activeCourse: getCourse(activeCourseId) });
});

app.get('/api/live/state', (req, res) => {
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

  res.json({
    course,
    teacherSettings: liveSession.teacherSettings,
    isActive: liveSession.isActive,
    elapsedSeconds: liveSession.elapsedSeconds,
    entries: liveSession.entries,
    chapters: liveSession.chapters,
    lostCountTotal: liveSession.lostAlerts.reduce((acc, curr) => acc + (curr.count || 1), 0),
    lostAlertsRecent: liveSession.lostAlerts.slice(-5),
    questions: liveSession.questions.slice(-10),
    forwardedQuestions: liveSession.forwardedQuestions.slice(-10),
    topicClusters: sortedClusters,
    tokenomics: liveSession.tokenomics,
    lastCapsule: liveSession.lastCapsule,
    pace
  });
});

// --------------------------------------------------------------------------
// API 2: INGESTA DE AUDIO (DESDE CELULAR / MICRÓFONO DOCENTE)
// --------------------------------------------------------------------------

app.post('/api/live/audio-chunk', upload.single('audio'), async (req, res) => {
  let tempConverted = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo de audio' });
    }

    const { elapsedSeconds = 0, isPrimarySpeaker = 'true' } = req.body;
    const currentCourse = getCourse(activeCourseId);

    // Convertir con ffmpeg a MP3 limpio mono 16kHz
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

    // 1. Transcribir con Groq Whisper Large v3 Turbo (sin prompt inyectado para evitar eco de glosario)
    const transcribedText = await transcribeLiveAudio(
      audioBuffer, 
      'audio/mp3'
    );

    // Limpiar temporales de inmediato (Privacidad: Audio Efímero 0s guardado)
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
      return res.json({
        success: true,
        entry: null,
        timestamp,
        text: '',
        message: 'Silencio o alucinación de silencio filtrada'
      });
    }

    // 2. Micro-Labeler Semántico: clasifica categoría, LaTeX, orador y capítulo (en su propio bucket openai/gpt-oss-20b)
    const labeled = await labelAndCleanSegment({
      text: transcribedText,
      previousSegments: liveSession.entries,
      courseName: currentCourse.name,
      courseGlossary: currentCourse.glossary
    });

    const isTeacher = isPrimarySpeaker === 'true' && labeled.speakerRole === 'profesor';
    const finalEntryText = labeled.cleanedText || transcribedText;
    const slideRef = matchSlideForSegment(activeCourseId, finalEntryText);

    const newEntry = {
      id: `VIVO-${liveSession.entries.length + 1}`,
      timestamp,
      seconds: secNum,
      speaker: isTeacher ? currentCourse.instructor : 'Intervención en el Aula',
      speakerRole: isTeacher ? 'profesor' : 'interrupcion',
      text: finalEntryText,
      category: labeled.category, // 'concepto_clave' | 'formula' | 'importancia' | 'digresion'
      chapterTitle: labeled.chapterTitle,
      slideRef, // { id, number, title } si calza con U-Cursos Auto-Sync, o null (contexto plano)
      keyTerms: labeled.keyTerms || [],
      receivedAt: new Date().toISOString()
    };

    liveSession.entries.push(newEntry);

    // Ordenar entradas por segundo si hubo inversión de red y mantener IDs estables
    liveSession.entries.sort((a, b) => a.seconds - b.seconds);
    liveSession.entries.forEach((entry, idx) => {
      entry.id = `VIVO-${idx + 1}`;
    });

    // Auto-Resolución Hands-Free: si había dudas abiertas sobre este tópico y el profe acaba de retomarlo
    autoResolveClustersFromVoice(currentCourse, newEntry);

    // Actualizar capítulos inteligentes con Debounce compartido
    maybeUpdateSmartChapters(newEntry, labeled, secNum, timestamp);

    const pace = calculatePaceMetrics(liveSession.entries);

    console.log(`[Audio Ingest] [${timestamp}] (${labeled.category}): "${newEntry.text.substring(0, 60)}..."`);

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

// --------------------------------------------------------------------------
// API 3: SIMULACIÓN PASO A PASO (PARA DEMOS DESDE ARCHIVO LOCAL)
// --------------------------------------------------------------------------

app.post('/api/simulator/step-chunk', async (req, res) => {
  let tempOut = null;
  try {
    const { startSecond = 0, durationSeconds = 7 } = req.body;
    const currentCourse = getCourse(activeCourseId);

    // Seleccionar archivo según el ramo activo
    let targetFile = audioMacroPath;
    if (activeCourseId === 'finanzas' && fs.existsSync(audioFinanzasPath)) {
      targetFile = audioFinanzasPath;
    } else if (activeCourseId === 'probabilidades') {
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

    let newEntry = null;
    if (text && text.trim().length > 0) {
      const labeled = await labelAndCleanSegment({
        text,
        previousSegments: liveSession.entries,
        courseName: currentCourse.name,
        courseGlossary: currentCourse.glossary
      });

      const finalEntryText = labeled.cleanedText || text;
      const slideRef = matchSlideForSegment(activeCourseId, finalEntryText);

      newEntry = {
        id: `VIVO-${liveSession.entries.length + 1}`,
        timestamp,
        seconds: startSecond,
        speaker: currentCourse.instructor,
        speakerRole: 'profesor',
        text: finalEntryText,
        category: labeled.category,
        chapterTitle: labeled.chapterTitle,
        slideRef,
        keyTerms: labeled.keyTerms || [],
        receivedAt: new Date().toISOString()
      };

      liveSession.entries.push(newEntry);
      liveSession.isActive = true;
      liveSession.classClosed = false;
      liveSession.elapsedSeconds = startSecond + durationSeconds;

      // Auto-Resolución Hands-Free en simulador también
      autoResolveClustersFromVoice(currentCourse, newEntry);

      // Capítulos inteligentes en simulador también
      maybeUpdateSmartChapters(newEntry, labeled, startSecond, timestamp);
    }

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

// --------------------------------------------------------------------------
// API 4: CONTROLES DEL PROFESOR Y ALERTAS "ME PERDÍ"
// --------------------------------------------------------------------------

app.post('/api/teacher/settings', (req, res) => {
  const { chatState, allowComplement, hideDigressions } = req.body;

  if (chatState !== undefined && ['paused', 'active', 'full_ia'].includes(chatState)) {
    liveSession.teacherSettings.chatState = chatState;
  }
  if (allowComplement !== undefined) liveSession.teacherSettings.allowComplement = !!allowComplement;
  if (hideDigressions !== undefined) liveSession.teacherSettings.hideDigressions = !!hideDigressions;

  console.log('[Teacher Controls] Configuración actualizada:', liveSession.teacherSettings);
  res.json({ success: true, teacherSettings: liveSession.teacherSettings });
});

app.post('/api/live/lost', (req, res) => {
  const { timestamp = '00:00' } = req.body;
  const existing = liveSession.lostAlerts.find(a => a.timestamp === timestamp);

  if (existing) {
    existing.count = (existing.count || 1) + 1;
  } else {
    liveSession.lostAlerts.push({ timestamp, count: 1 });
  }

  const currentCourse = getCourse(activeCourseId);
  const lastEntry = liveSession.entries[liveSession.entries.length - 1];
  const cluster = upsertTopicCluster({
    course: currentCourse,
    text: '',
    isLostAlert: true,
    timestamp,
    slideRef: lastEntry?.slideRef || null
  });

  const total = liveSession.lostAlerts.reduce((sum, a) => sum + a.count, 0);
  console.log(`[Alert] Estudiante marcó "Me perdí" en [${timestamp}] -> Cluster "${cluster.label}" (Total: ${total})`);

  res.json({ success: true, totalLost: total, timestamp, cluster });
});

app.post('/api/teacher/cluster-action', (req, res) => {
  const { clusterId, status } = req.body;
  const cluster = liveSession.topicClusters.find(c => c.id === clusterId);
  if (!cluster) return res.status(404).json({ error: 'Cluster no encontrado' });

  if (['open', 'resolved', 'auto_resolved', 'for_ta'].includes(status)) {
    cluster.status = status;
  }
  res.json({ success: true, cluster });
});

app.post('/api/live/pulse', (req, res) => {
  const { type = 'lost', timestamp = '00:00' } = req.body;
  const currentCourse = getCourse(activeCourseId);
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

  const totalLost = liveSession.lostAlerts.reduce((sum, a) => sum + a.count, 0);
  console.log(`[Pulso Aula] (${type}) en [${timestamp}] -> "${cluster.label}"`);
  res.json({ success: true, totalLost, cluster });
});

app.get('/api/live/capsule', (req, res) => {
  const course = getCourse(activeCourseId);
  const capsule = generateFusedPostClassCapsule(course, liveSession.entries, liveSession.topicClusters, liveSession.questions);
  res.json({ success: true, capsule });
});

app.post('/api/teacher/close-class', async (req, res) => {
  try {
    const course = getCourse(activeCourseId);
    console.log(`[Cátedra Viva] Cerrando sesión y generando resumen + Apunte Vivo Fusionado para ${course.code}...`);

    const capsule = generateFusedPostClassCapsule(course, liveSession.entries, liveSession.topicClusters, liveSession.questions);
    liveSession.lastCapsule = capsule;

    const summary = await generateClassSummary(course, liveSession.entries);
    const savedHistorical = recordClosedClass(activeCourseId, {
      title: summary.title,
      summary: summary.summary,
      keyFormulas: summary.keyFormulas
    });

    // Habilitar automáticamente el Modo Post-Clase Full IA tras el cierre
    liveSession.teacherSettings.chatState = 'full_ia';
    liveSession.isActive = false;
    liveSession.classClosed = true;

    res.json({
      success: true,
      message: 'Clase cerrada, archivada en RAG Histórico y Modo Post-Clase Full IA activado.',
      newHistoricalEntry: savedHistorical,
      capsule,
      teacherSettings: liveSession.teacherSettings,
      updatedCourse: getCourse(activeCourseId)
    });
  } catch (error) {
    console.error('Error cerrando clase:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/live/reset', (req, res) => {
  liveSession.lastCapsule = null;
  resetLiveSessionData(false);
  console.log('[Cátedra Viva] Transcripción en vivo reiniciada');
  res.json({ success: true, message: 'Sesión reiniciada con éxito' });
});

// --------------------------------------------------------------------------
// API 5: CHATBOT TUTOR PEDAGÓGICO (3 MODOS + TOKENOMICS + RADAR DE DUDAS)
// --------------------------------------------------------------------------

app.post('/api/chat', async (req, res) => {
  try {
    const { question, currentTimeFormatted = '00:00', bypassCache = false } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía.' });
    }

    const cleanQ = question.trim();
    const currentCourse = getCourse(activeCourseId);

    const response = await answerStudentQuestion({
      question: cleanQ,
      course: currentCourse,
      liveEntries: liveSession.entries,
      teacherSettings: liveSession.teacherSettings,
      currentTimeFormatted,
      bypassCache: !!bypassCache
    });

    const slideMatch = matchSlideForSegment(activeCourseId, cleanQ);
    const detectedTopic = detectTopicCluster({
      text: cleanQ,
      course: currentCourse,
      liveEntries: liveSession.entries,
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
      timestamp: currentTimeFormatted,
      createdAt: new Date().toISOString()
    });

    // Actualizar métricas de Tokenomics de la sesión
    liveSession.tokenomics.totalQueries += 1;
    if (response.fromCache) liveSession.tokenomics.cacheHits += 1;
    if (response.tokenMetrics) {
      liveSession.tokenomics.prefixTokensSaved += response.tokenMetrics.savedTokens || 0;
      liveSession.tokenomics.cloudCostUsd = Number((liveSession.tokenomics.cloudCostUsd + (response.tokenMetrics.cloudCostNoOptUsd || 0)).toFixed(6));
      liveSession.tokenomics.onPremCostUsd = Number((liveSession.tokenomics.onPremCostUsd + (response.tokenMetrics.onPremGpuMarginalUsd || 0)).toFixed(6));
    }

    // Agrupar en Radar del Profe / Auxiliar solo durante la clase en vivo (no reabrir Radar en estudio Post-Clase Full IA)
    let clusterInfo = null;
    if (response.questionType !== 'off_topic' && liveSession.teacherSettings.chatState !== 'full_ia') {
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

app.post('/api/live/forward-question', (req, res) => {
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

  // Escalar en el cluster existente sin duplicar conteo de la misma duda
  const currentCourse = getCourse(activeCourseId);
  const slideMatch = matchSlideForSegment(activeCourseId, cleanQ);
  const cluster = upsertTopicCluster({
    course: currentCourse,
    text: cleanQ,
    questionId,
    escalated: true,
    timestamp,
    slideRef: slideMatch
  });

  console.log(`[Radar Escalado] Duda enviada al Profesor/Auxiliar en [${timestamp}] -> Cluster "${cluster.label}": "${cleanQ}"`);

  res.json({ success: true, forwarded, cluster });
});

// --------------------------------------------------------------------------
// API 6: AGREGAR MATERIAL DE ESTUDIO EN VIVO
// --------------------------------------------------------------------------

app.post('/api/materials/add', (req, res) => {
  const { title, pages, content } = req.body;
  if (!content) return res.status(400).json({ error: 'El contenido del material es obligatorio' });

  const newMat = addCourseMaterial(activeCourseId, { title, pages, content });
  res.json({ success: true, material: newMat });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🏛️ Cátedra Viva V2 (Clean-Slate) activa en http://localhost:${PORT}`);
  console.log(`📚 Ramo inicial: ${activeCourseId.toUpperCase()}`);
  console.log(`=======================================================`);
});
