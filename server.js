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
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

import { 
  getCoursesList, 
  getCourse, 
  recordClosedClass, 
  addCourseMaterial 
} from './data/coursesDb.js';

import {
  transcribeLiveAudio,
  labelAndCleanSegment,
  calculatePaceMetrics,
  answerStudentQuestion,
  generateClassSummary
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
  teacherSettings: {
    chatState: 'active', // 'active' | 'paused' (Modo Pizarra)
    allowComplement: true, // Recuadro violeta de conocimiento IA
    hideDigressions: false, // Por defecto mostrar todo para no ocultar introducciones
    noiseGateThreshold: -35 // dBFS en frontend
  }
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Archivos de audio pregrabados para simulaciones
const audioMacroPath = path.join(__dirname, 'Modelo IS-LM - Explicado para principiantes!.mp3');
const audioCalculusPath = path.join(__dirname, 'Clase_Calculo_Derivadas.mp3');

app.get('/audio/clase.mp3', (req, res) => {
  if (fs.existsSync(audioMacroPath)) res.sendFile(audioMacroPath);
  else res.status(404).json({ error: 'Audio macro no encontrado' });
});

app.get('/audio/calculo.mp3', (req, res) => {
  if (fs.existsSync(audioCalculusPath)) res.sendFile(audioCalculusPath);
  else res.status(404).json({ error: 'Audio cálculo no encontrado' });
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
  liveSession.entries = [];
  liveSession.lostAlerts = [];
  liveSession.questions = [];
  liveSession.forwardedQuestions = [];
  liveSession.chapters = [{ minute: '00:00', seconds: 0, title: 'Apertura y Objetivos' }];
  liveSession.elapsedSeconds = 0;
  liveSession.isActive = false;

  console.log(`[Cátedra Viva] Ramo activo cambiado a: ${courseId}`);
  res.json({ success: true, activeCourse: getCourse(activeCourseId) });
});

app.get('/api/live/state', (req, res) => {
  const course = getCourse(activeCourseId);
  const pace = calculatePaceMetrics(liveSession.entries);

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

    // Limpiar temporales
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    try { fs.unlinkSync(tempConverted); tempConverted = null; } catch (_) {}

    const secNum = parseInt(elapsedSeconds, 10) || liveSession.elapsedSeconds || 0;
    liveSession.elapsedSeconds = Math.max(liveSession.elapsedSeconds, secNum + 4);
    liveSession.isActive = true;

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

    const newEntry = {
      id: `VIVO-${liveSession.entries.length + 1}`,
      timestamp,
      seconds: secNum,
      speaker: isTeacher ? currentCourse.instructor : 'Intervención en el Aula',
      speakerRole: isTeacher ? 'profesor' : 'interrupcion',
      text: labeled.cleanedText || transcribedText,
      category: labeled.category, // 'concepto_clave' | 'formula' | 'importancia' | 'digresion'
      chapterTitle: labeled.chapterTitle,
      keyTerms: labeled.keyTerms || [],
      receivedAt: new Date().toISOString()
    };

    liveSession.entries.push(newEntry);

    // Ordenar entradas por segundo si hubo inversión de red y mantener IDs estables
    liveSession.entries.sort((a, b) => a.seconds - b.seconds);
    liveSession.entries.forEach((entry, idx) => {
      entry.id = `VIVO-${idx + 1}`;
    });

    // Actualizar capítulos inteligentes con Debounce (mínimo 5 palabras, no digresión y >=15s desde el último capítulo)
    const wordCount = newEntry.text.split(/\s+/).filter(Boolean).length;
    if (
      labeled.chapterTitle &&
      labeled.chapterTitle.length > 3 &&
      labeled.category !== 'digresion' &&
      wordCount >= 5
    ) {
      const lastChapter = liveSession.chapters[liveSession.chapters.length - 1];
      const lastChapterSec = lastChapter?.seconds || 0;
      const isDifferentTitle = !lastChapter || lastChapter.title.toLowerCase() !== labeled.chapterTitle.toLowerCase();
      const enoughTimeElapsed = (secNum - lastChapterSec) >= 15 || liveSession.chapters.length === 1;

      if (isDifferentTitle && enoughTimeElapsed) {
        liveSession.chapters.push({
          minute: timestamp,
          seconds: secNum,
          title: labeled.chapterTitle
        });
      }
    }

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
    const { startSecond = 0, durationSeconds = 5 } = req.body;
    const currentCourse = getCourse(activeCourseId);

    // Seleccionar archivo según el ramo activo
    let targetFile = audioMacroPath;
    if (activeCourseId === 'probabilidades' || activeCourseId === 'finanzas') {
      targetFile = audioCalculusPath; // fallback con audio matemático claro
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

    const text = await transcribeLiveAudio(audioBuffer, 'audio/mp3', currentCourse.glossary);

    const m = Math.floor(startSecond / 60);
    const s = Math.floor(startSecond % 60);
    const timestamp = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    let newEntry = null;
    if (text && text.trim().length > 0) {
      const labeled = await labelAndCleanSegment({
        text,
        previousSegments: liveSession.entries,
        courseName: currentCourse.name
      });

      newEntry = {
        id: `VIVO-${liveSession.entries.length + 1}`,
        timestamp,
        seconds: startSecond,
        speaker: currentCourse.instructor,
        speakerRole: 'profesor',
        text: labeled.cleanedText || text,
        category: labeled.category,
        chapterTitle: labeled.chapterTitle,
        keyTerms: labeled.keyTerms || [],
        receivedAt: new Date().toISOString()
      };

      liveSession.entries.push(newEntry);
      liveSession.isActive = true;
      liveSession.elapsedSeconds = startSecond + durationSeconds;
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

  if (chatState !== undefined) liveSession.teacherSettings.chatState = chatState;
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

  const total = liveSession.lostAlerts.reduce((sum, a) => sum + a.count, 0);
  console.log(`[Alert] Estudiante marcó "Me perdí" en [${timestamp}] (Total: ${total})`);

  res.json({ success: true, totalLost: total, timestamp });
});

app.post('/api/teacher/close-class', async (req, res) => {
  try {
    const course = getCourse(activeCourseId);
    console.log(`[Cátedra Viva] Cerrando sesión y generando resumen histórico para ${course.code}...`);

    const summary = await generateClassSummary(course, liveSession.entries);
    const savedHistorical = recordClosedClass(activeCourseId, {
      title: summary.title,
      summary: summary.summary,
      keyFormulas: summary.keyFormulas
    });

    // Reiniciar sesión en vivo para la próxima
    liveSession.entries = [];
    liveSession.lostAlerts = [];
    liveSession.questions = [];
    liveSession.forwardedQuestions = [];
    liveSession.chapters = [{ minute: '00:00', seconds: 0, title: 'Apertura y Objetivos' }];
    liveSession.isActive = false;
    liveSession.elapsedSeconds = 0;

    res.json({
      success: true,
      message: 'Clase cerrada exitosamente y archivada en el RAG Histórico.',
      newHistoricalEntry: savedHistorical,
      updatedCourse: getCourse(activeCourseId)
    });
  } catch (error) {
    console.error('Error cerrando clase:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/live/reset', (req, res) => {
  liveSession.entries = [];
  liveSession.lostAlerts = [];
  liveSession.questions = [];
  liveSession.forwardedQuestions = [];
  liveSession.chapters = [{ minute: '00:00', seconds: 0, title: 'Apertura y Objetivos' }];
  liveSession.isActive = false;
  liveSession.elapsedSeconds = 0;
  console.log('[Cátedra Viva] Transcripción en vivo reiniciada');
  res.json({ success: true, message: 'Sesión reiniciada con éxito' });
});

// --------------------------------------------------------------------------
// API 5: CHATBOT TUTOR PEDAGÓGICO PARA ESTUDIANTES Y ENVÍO DE DUDAS AL PROFE
// --------------------------------------------------------------------------

app.post('/api/chat', async (req, res) => {
  try {
    const { question, currentTimeFormatted = '00:00' } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía.' });
    }

    const currentCourse = getCourse(activeCourseId);

    const response = await answerStudentQuestion({
      question: question.trim(),
      course: currentCourse,
      liveEntries: liveSession.entries,
      teacherSettings: liveSession.teacherSettings,
      currentTimeFormatted
    });

    // Registrar pregunta en el log en vivo de la sesión
    liveSession.questions.push({
      id: `Q-${liveSession.questions.length + 1}`,
      question: question.trim(),
      questionType: response.questionType || 'grounded',
      timestamp: currentTimeFormatted,
      createdAt: new Date().toISOString()
    });

    console.log(`[Student Chat] [${currentTimeFormatted}] (${response.questionType}): "${question.trim()}"`);

    res.json(response);

  } catch (error) {
    console.error('Error en /api/chat:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/live/forward-question', (req, res) => {
  const { question, timestamp = '00:00' } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Pregunta vacía' });
  }

  const forwarded = {
    id: `FWD-${liveSession.forwardedQuestions.length + 1}`,
    question: question.trim(),
    timestamp,
    createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  liveSession.forwardedQuestions.push(forwarded);
  console.log(`[Forwarded Question] Duda académica enviada al profesor en [${timestamp}]: "${question.trim()}"`);

  res.json({ success: true, forwarded });
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
