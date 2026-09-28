/**
 * Servidor Backend en Node/Express para Cátedra Viva
 * 
 * - Las API keys (GEMINI_API_KEY / OPENAI_API_KEY) quedan 100% protegidas en este servidor y NUNCA expuestas al cliente.
 * - Sirve la aplicación web estática (HTML/CSS/JS).
 * - Expone endpoints REST para chat en vivo acotado, resumen post-clase y analíticas anónimas.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { COURSE_CONFIG } from './config/courseConfig.js';
import { TRANSCRIPT_ENTRIES, FULL_TRANSCRIPT_TEXT } from './data/transcriptData.js';
import { 
  answerLiveChat, 
  generatePostClassSummary, 
  answerPostClassQuery,
  transcribeAudioChunk
} from './services/llmService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * 3. Chat en Vivo (Lógica pedagógica acotada)
 * Recibe: { question, revealedTranscript, currentTimeFormatted }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { question, revealedTranscript, currentTimeFormatted } = req.body;
    
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta no puede estar vacía' });
    }

    const answer = await answerLiveChat({
      question: question.trim(),
      revealedTranscript: revealedTranscript || '',
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
 * 7. Datos del Dashboard del Profesor (Estadísticas agregadas y anónimas)
 */
app.get('/api/stats', (req, res) => {
  res.json({
    activeStudents: 48,
    totalQuestionsAsked: 42,
    anonymousLevel: "Capa 2: 100% anonimizada y agregada (identidad protegida)",
    alert: {
      active: true,
      severity: "info",
      text: "42% de las preguntas de los últimos 10 minutos se concentraron en la definición y pendiente de la Curva LM."
    },
    topicDistribution: [
      { topic: "Curva LM y mercado de dinero", percentage: 42, count: 18, color: "#3B82F6" },
      { topic: "Curva IS y mercado de bienes", percentage: 26, count: 11, color: "#10B981" },
      { topic: "Políticas Fiscales vs. Monetarias", percentage: 19, count: 8, color: "#F59E0B" },
      { topic: "Dudas fuera de clase (ej. Modelo de Solow)", percentage: 8, count: 3, color: "#8B5CF6" },
      { topic: "Consultas rechazadas (fuera de curso)", percentage: 5, count: 2, color: "#EF4444" }
    ],
    timelineDensity: [
      { interval: "00:00 - 00:01", count: 3, label: "Apertura y noción de equilibrio" },
      { interval: "00:01 - 00:02", count: 7, label: "Definición IS y ahorro/inversión" },
      { interval: "00:02 - 00:03", count: 19, label: "Pico: Curva LM y tasa de interés" },
      { interval: "00:03 - 00:04", count: 9, label: "Políticas fiscales y monetarias" },
      { interval: "00:04 - 00:05", count: 4, label: "Síntesis final del docente" }
    ],
    didacticRecommendations: [
      "Dedicar 3-4 minutos a reforzar por qué un aumento del PIB eleva la demanda de dinero y consecuentemente la tasa de interés en la curva LM.",
      "Aclarar la diferencia entre las herramientas del Banco Central (política monetaria) y las del Ministerio de Hacienda/Gobierno (política fiscal)."
    ]
  });
});

// Fallback para servir la SPA en cualquier ruta no reconocida de la API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Cátedra Viva - Aula Aumentada con IA`);
  console.log(`📡 Servidor escuchando en: http://0.0.0.0:${PORT}`);
  console.log(`🔑 LLM Provider: ${process.env.GEMINI_API_KEY ? 'Google Gemini (Pool Activo)' : (process.env.OPENAI_API_KEY ? 'OpenAI GPT-4o-mini' : 'Ninguno')} (Protegido en servidor)`);
  console.log(`📚 Curso: ${COURSE_CONFIG.courseCode} - ${COURSE_CONFIG.courseName}`);
  console.log(`=======================================================`);
});
