/**
 * Servidor Backend en Node/Express para Cátedra Viva
 * 
 * - Las API keys (GEMINI_API_KEY / OPENAI_API_KEY) quedan 100% protegidas en este servidor y NUNCA expuestas al cliente.
 * - Sirve la aplicación web estática (HTML/CSS/JS).
 * - Expone endpoints REST para chat en vivo acotado, resumen post-clase y analíticas anónimas.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';

import { COURSE_CONFIG } from './config/courseConfig.js';
import { TRANSCRIPT_ENTRIES, FULL_TRANSCRIPT_TEXT } from './data/transcriptData.js';
import { 
  answerLiveChat, 
  generatePostClassSummary, 
  answerPostClassQuery,
  transcribeAudioChunk,
  transcribeLiveAudioBuffer
} from './services/llmService.js';
import { analyticsService } from './services/analyticsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de almacenamiento temporal para uploads de audio
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Estado en memoria para el streaming en vivo desde el micrófono del ayudante
let liveLectureState = {
  isActive: false,
  entries: [],
  totalChunks: 0
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Servir archivo de audio de la clase
const audioPath = path.join(__dirname, 'Modelo IS-LM - Explicado para principiantes!.mp3');
app.get('/audio/clase.mp3', (req, res) => {
  if (fs.existsSync(audioPath)) {
    res.sendFile(audioPath);
  } else {
    res.status(404).json({ error: 'Archivo de audio no encontrado' });
  }
});

/**
 * 1. Configuración del Curso (Alcance temático)
 */
app.get('/api/config', (req, res) => {
  res.json({
    courseCode: COURSE_CONFIG.courseCode,
    courseName: COURSE_CONFIG.courseName,
    institution: COURSE_CONFIG.institution,
    description: COURSE_CONFIG.description,
    units: COURSE_CONFIG.units,
    activeUnitNumbers: COURSE_CONFIG.activeUnitNumbers,
    scopePromptText: COURSE_CONFIG.getScopePromptText()
  });
});

/**
 * Endpoint para modificar dinámicamente las unidades activas (para demostraciones en vivo de cómo cambia el alcance)
 */
app.post('/api/config/active-units', (req, res) => {
  const { activeUnitNumbers } = req.body;
  if (Array.isArray(activeUnitNumbers) && activeUnitNumbers.length > 0) {
    COURSE_CONFIG.activeUnitNumbers = activeUnitNumbers.map(Number);
    return res.json({ 
      success: true, 
      activeUnitNumbers: COURSE_CONFIG.activeUnitNumbers,
      scopePromptText: COURSE_CONFIG.getScopePromptText()
    });
  }
  res.status(400).json({ error: 'Debe especificar un arreglo válido de números de unidad' });
});

/**
 * 2. Transcripción completa y estructurada
 */
app.get('/api/transcript', (req, res) => {
  res.json({
    totalEntries: TRANSCRIPT_ENTRIES.length,
    entries: TRANSCRIPT_ENTRIES,
    fullText: FULL_TRANSCRIPT_TEXT
  });
});

/**
 * 2.1 Transcripción real en tiempo real de fragmentos de audio MP3 con Gemini
 */
app.post('/api/transcribe-chunk', async (req, res) => {
  try {
    const { startSeconds = 0, durationSeconds = 6 } = req.body;
    const chunk = await transcribeAudioChunk(Number(startSeconds), Number(durationSeconds));
    res.json(chunk);
  } catch (error) {
    console.error('Error en /api/transcribe-chunk:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 2.2 Streaming en Vivo desde Micrófono Móvil (PoC 2 Celulares)
 * Recibe fragmentos de audio de 3 a 5 segundos grabados desde el celular del ayudante.
 */
app.post('/api/live-stream/chunk', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo de audio' });
    }

    const elapsedSeconds = Number(req.body.elapsedSeconds) || (liveLectureState.entries.length * 5);
    const audioBuffer = fs.readFileSync(req.file.path);
    
    // Transcribir con Groq Whisper Large v3 Turbo en ~0.3s
    const text = await transcribeLiveAudioBuffer(
      audioBuffer, 
      req.file.mimetype || 'audio/webm',
      'Cátedra universitaria de matemáticas y cálculo: derivadas, integrales, límites, diferenciales dx, funciones, álgebra.'
    );

    // Limpiar archivo temporal de inmediato
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    liveLectureState.totalChunks++;
    liveLectureState.isActive = true;

    let newEntry = null;
    const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const secs = String(elapsedSeconds % 60).padStart(2, '0');
    const timestamp = `${mins}:${secs}`;

    if (text && text.trim()) {
      newEntry = {
        id: `live-${Date.now()}-${liveLectureState.entries.length}`,
        timestamp,
        seconds: elapsedSeconds,
        speaker: 'Profesor / Ayudante (En Vivo)',
        text: text.trim()
      };
      liveLectureState.entries.push(newEntry);
      console.log(`[Live Mic] 🎙️ [${timestamp}] "${text.trim()}"`);
    }

    res.json({
      success: true,
      text: text || '',
      timestamp,
      newEntry,
      totalEntries: liveLectureState.entries.length
    });
  } catch (error) {
    console.error('Error en /api/live-stream/chunk:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/live-stream/entries', (req, res) => {
  const fullText = liveLectureState.entries.map(e => `[${e.timestamp}] ${e.text}`).join('\n');
  res.json({
    isActive: liveLectureState.isActive,
    totalEntries: liveLectureState.entries.length,
    entries: liveLectureState.entries,
    fullText
  });
});

app.post('/api/live-stream/reset', (req, res) => {
  liveLectureState.entries = [];
  liveLectureState.totalChunks = 0;
  liveLectureState.isActive = false;
  console.log('[Live Mic] 🔄 Sesión de micrófono reiniciada');
  res.json({ success: true, message: 'Sesión en vivo reiniciada exitosamente' });
});

/**
 * 3. Chat en Vivo (Lógica pedagógica acotada)
 * Recibe: { question, revealedTranscript, currentTimeFormatted }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { question, revealedTranscript, currentTimeFormatted } = req.body;
    
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía' });
    }

    let effectiveTranscript = revealedTranscript || '';
    if (liveLectureState.entries.length > 0) {
      const liveText = liveLectureState.entries.map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n');
      if (effectiveTranscript.trim()) {
        effectiveTranscript = `[TRANSCRIPCIÓN EN VIVO DEL MICRÓFONO]:\n${liveText}\n\n[CONTEXTO ADICIONAL]:\n${effectiveTranscript}`;
      } else {
        effectiveTranscript = liveText;
      }
    }

    const answer = await answerLiveChat({
      question: question.trim(),
      revealedTranscript: effectiveTranscript,
      currentTimeFormatted: currentTimeFormatted || '00:00:00'
    });

    // Registrar en Analítica de Comprensión (Capa 2: agregada y anónima)
    analyticsService.recordQuestion({
      question: question.trim(),
      answer,
      currentTimeFormatted: currentTimeFormatted || '00:00:00'
    });

    res.json({ 
      answer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error en /api/chat:', error);
    res.status(500).json({ 
      error: 'Error procesando la consulta con el modelo de lenguaje.',
      details: error.message 
    });
  }
});

// Cache en memoria para el resumen post-clase
let cachedSummary = null;

/**
 * 4. Generación de Resumen Post-Clase y Conceptos Clave
 */
app.post('/api/summary', async (req, res) => {
  try {
    const forceRefresh = req.body.forceRefresh === true;
    if (cachedSummary && !forceRefresh) {
      return res.json(cachedSummary);
    }

    const summaryData = await generatePostClassSummary(FULL_TRANSCRIPT_TEXT);
    cachedSummary = summaryData;
    res.json(summaryData);
  } catch (error) {
    console.error('Error en /api/summary:', error);
    res.status(500).json({ 
      error: 'Error generando el resumen post-clase.',
      details: error.message 
    });
  }
});

/**
 * 5. Buscador / Q&A Post-Clase sobre transcripción completa
 */
app.post('/api/post-class-qa', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía' });
    }

    const answer = await answerPostClassQuery(question.trim(), FULL_TRANSCRIPT_TEXT);
    res.json({ answer });
  } catch (error) {
    console.error('Error en /api/post-class-qa:', error);
    res.status(500).json({ 
      error: 'Error procesando la búsqueda post-clase.',
      details: error.message 
    });
  }
});

/**
 * 6. Datos de Recurrencia Histórica (Ejemplo para demo)
 */
app.get('/api/recurrence', (req, res) => {
  res.json({
    course: "IN4123 - Macroeconomía",
    module: "Unidad 2: Equilibrio en Mercados Financieros y Reales",
    historicalClasses: [
      {
        id: "class-1",
        date: "20 de Septiembre de 2026",
        title: "Sesión 11: Mercados de Dinero y Tasa de Interés",
        professor: "Prof. Roberto Celis",
        status: "Finalizada",
        summary: "En esta sesión se introdujeron los fundamentos del mercado financiero y monetario: la distinción entre ahorro (S) e inversión (I), la demanda de dinero determinada por el ingreso, y la oferta de dinero fijada por el Banco Central. Se derivó analíticamente la curva LM como la condición de equilibrio monetario L = M, dejando planteada la incógnita de cómo interacciona con el mercado de bienes.",
        keyConcepts: ["Preferencia por la liquidez", "Oferta monetaria del Banco Central", "Tasa de interés de equilibrio"],
        studentDoubtAreas: "45% de consultas sobre la diferencia entre ahorro bancario e inversión real."
      },
      {
        id: "class-2",
        date: "27 de Septiembre de 2026 (Clase Actual)",
        title: "Sesión 12: Integración del Modelo IS-LM y Políticas Macroeconómicas",
        professor: "Prof. Roberto Celis",
        status: "En curso / Transcrita",
        summary: "Tomando como base lo discutido en la clase anterior del 20 de septiembre (donde se abordó de forma aislada el mercado de dinero y la preferencia por la liquidez), en esta sesión el profesor integró formalmente la curva IS con la curva LM en un solo gráfico. Se determinó el equilibrio simultáneo (i*, Y*) y se mostraron los canales de transmisión de las políticas fiscales del gobierno (gasto e impuestos) y las políticas monetarias del Banco Central (tasa, encaje y mercado abierto).",
        hasContinuityBadge: true,
        continuityNote: "Este resumen incorpora automáticamente la memoria semántica de la Sesión 11 para contextualizar la transición pedagógica.",
        keyConcepts: ["Curva IS (bienes)", "Curva LM (dinero)", "Equilibrio conjunto IS-LM", "Política fiscal vs. monetaria"]
      }
    ]
  });
});

/**
 * 7. Datos del Dashboard del Profesor (Estadísticas agregadas y anónimas en tiempo real)
 */
app.get('/api/stats', (req, res) => {
  res.json(analyticsService.getAggregatedStats());
});

app.post('/api/stats/reset', (req, res) => {
  analyticsService.reset();
  res.json({ success: true, message: 'Estadísticas de la sesión reiniciadas' });
});

// Fallback para servir la SPA en cualquier ruta no reconocida de la API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Cátedra Viva - Aula Aumentada con IA`);
  console.log(`📡 Servidor escuchando en: http://0.0.0.0:${PORT}`);
  const provider = process.env.GROQ_API_KEY ? 'Groq (Primario) con Fallback a Gemini' : (process.env.GEMINI_API_KEY ? 'Google Gemini' : 'Ninguno');
  console.log(`🔑 LLM Provider: ${provider} (Protegido en servidor)`);
  console.log(`📚 Curso: ${COURSE_CONFIG.courseCode} - ${COURSE_CONFIG.courseName}`);
  console.log(`=======================================================`);
});
