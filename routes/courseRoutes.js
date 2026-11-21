/**
 * Rutas de gestión de asignaturas, creación dinámica y materiales.
 */

import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import {
  getCoursesList,
  getCourse,
  createCustomCourse,
  addCourseMaterial,
  attachCourseSlides
} from '../data/coursesDb.js';
import {
  getActiveCourseId,
  setActiveCourseId,
  bumpStateVersion
} from '../state/sessionStore.js';
import { parseUploadedDocument } from '../services/documentParser.js';

const router = Router();
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function handleSingleDocUpload(req, res, next) {
  docUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo supera el tamaño máximo permitido (15 MB).' });
    }
    return res.status(400).json({ error: err.message || 'No se pudo recibir el archivo subido.' });
  });
}

function inferCourseNameFromFilename(fileName = '') {
  const base = path.basename(String(fileName || ''), path.extname(String(fileName || '')));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

router.get('/api/courses', (req, res) => {
  res.json({
    activeCourseId: getActiveCourseId(),
    courses: getCoursesList()
  });
});

router.post('/api/courses/select', (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId es requerido' });

  setActiveCourseId(courseId);
  console.log(`[Cátedra Viva] Ramo activo cambiado a: ${courseId}`);
  res.json({ success: true, activeCourse: getCourse(getActiveCourseId()) });
});

router.post('/api/courses/custom', (req, res) => {
  const { code, name, instructor, slidesText = '', glossary = '' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la asignatura es obligatorio' });
  }

  const created = createCustomCourse({ code, name, instructor, slidesText, glossary });
  setActiveCourseId(created.id);
  console.log(`[Cátedra Viva] Nuevo curso creado y activado: ${created.code} (${created.id})`);
  res.json({ success: true, course: created, courses: getCoursesList() });
});

router.post('/api/courses/upload', handleSingleDocUpload, async (req, res) => {
  try {
    const { code = '', name = '', instructor = '', slidesText = '', glossary = '' } = req.body || {};
    let parsed = null;

    if (req.file) {
      parsed = await parseUploadedDocument(req.file);
    }

    const finalName = (name && name.trim()) || (parsed ? inferCourseNameFromFilename(parsed.fileName) : '');
    if (!finalName) {
      return res.status(400).json({ error: 'Ingresa el nombre de la asignatura o adjunta un archivo .pdf/.pptx.' });
    }

    const created = createCustomCourse({
      code,
      name: finalName,
      instructor,
      slidesText,
      glossary,
      parsedSlides: parsed?.slides || null,
      deckTitle: parsed ? parsed.fileName : null
    });
    setActiveCourseId(created.id);
    console.log(`[Cátedra Viva] Curso creado desde archivo: ${created.code} (${created.ucursosSync?.slides?.length || 0} láminas)`);

    res.json({
      success: true,
      course: created,
      courses: getCoursesList(),
      parsedMeta: parsed
        ? { format: parsed.format, fileName: parsed.fileName, slidesCount: parsed.slides.length, totalPages: parsed.totalPages }
        : null
    });
  } catch (err) {
    console.warn('[Courses Upload] Error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/api/materials/add', (req, res) => {
  const { title, pages, content } = req.body;
  if (!content) return res.status(400).json({ error: 'El contenido del material es obligatorio' });

  const newMat = addCourseMaterial(getActiveCourseId(), { title, pages, content });
  bumpStateVersion();
  res.json({ success: true, material: newMat });
});

router.post('/api/materials/upload', handleSingleDocUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Adjunta un archivo .pdf, .pptx, .txt o .md.' });
    }

    const mode = req.body?.mode === 'material' ? 'material' : 'slides';
    const customTitle = (req.body?.title || '').trim();
    const parsed = await parseUploadedDocument(req.file);
    const activeCourseId = getActiveCourseId();

    if (mode === 'slides') {
      const updatedCourse = attachCourseSlides(activeCourseId, {
        deckTitle: customTitle || parsed.fileName,
        slides: parsed.slides
      });
      bumpStateVersion();
      console.log(`[Materials Upload] Láminas sincronizadas en ${updatedCourse.code}: ${updatedCourse.ucursosSync.slides.length} láminas (${parsed.fileName})`);
      return res.json({
        success: true,
        mode: 'slides',
        course: updatedCourse,
        slidesCount: updatedCourse.ucursosSync.slides.length,
        parsedMeta: { format: parsed.format, fileName: parsed.fileName, totalPages: parsed.totalPages }
      });
    }

    const newMat = addCourseMaterial(activeCourseId, {
      title: customTitle || parsed.fileName,
      pages: parsed.pagesLabel,
      content: parsed.fullText
    });
    bumpStateVersion();
    console.log(`[Materials Upload] Material agregado en ${activeCourseId}: "${newMat.title}" (${newMat.pages})`);
    return res.json({
      success: true,
      mode: 'material',
      material: newMat,
      parsedMeta: { format: parsed.format, fileName: parsed.fileName, totalPages: parsed.totalPages }
    });
  } catch (err) {
    console.warn('[Materials Upload] Error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
