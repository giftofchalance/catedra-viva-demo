/**
 * Servidor Backend Express para Cátedra Viva V4 (Arquitectura Modular Clean-Core)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import courseRoutes from './routes/courseRoutes.js';
import liveRoutes from './routes/liveRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { getActiveCourseId } from './state/sessionStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Evitar caché agresiva de HTML/JS/CSS en navegadores móviles y pruebas
app.use((req, res, next) => {
  if (
    req.path.endsWith('.js') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.html') ||
    req.path === '/' ||
    req.path === '/profesor' ||
    req.path === '/estudiante' ||
    req.path === '/simulador'
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

app.get('/profesor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/estudiante', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/simulador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

app.use(courseRoutes);
app.use(liveRoutes);
app.use(chatRoutes);

app.listen(PORT, () => {
  console.log('=======================================================');
  console.log(`🏛️ Cátedra Viva V4 (Clean-Core) activa en http://localhost:${PORT}`);
  console.log(`📚 Ramo inicial: ${getActiveCourseId().toUpperCase()}`);
  console.log('=======================================================');
});
