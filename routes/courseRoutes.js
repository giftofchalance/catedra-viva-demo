/**
 * Rutas de gestión de asignaturas, creación dinámica y materiales.
 */

import { Router } from 'express';
import {
  getCoursesList,
  getCourse,
  createCustomCourse,
  addCourseMaterial
} from '../data/coursesDb.js';
import {
  getActiveCourseId,
  setActiveCourseId,
  bumpStateVersion
} from '../state/sessionStore.js';

const router = Router();

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

router.post('/api/materials/add', (req, res) => {
  const { title, pages, content } = req.body;
  if (!content) return res.status(400).json({ error: 'El contenido del material es obligatorio' });

  const newMat = addCourseMaterial(getActiveCourseId(), { title, pages, content });
  bumpStateVersion();
  res.json({ success: true, material: newMat });
});

export default router;
