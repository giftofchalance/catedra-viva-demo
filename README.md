# Cátedra Viva — V4 (Clean-Core)

Asistente pedagógico en tiempo real para salas de clase presenciales e híbridas. Captura la voz del profesor sin fricción, la sincroniza con el material de apoyo, detecta dónde se pierden los estudiantes (*Radar de Dudas*) y responde preguntas en contexto mediante un tutor IA con **Quote-Reply**, memoria conversacional acotada y modos pedagógicos explícitos.

---

## Principios y Modos de Operación (V4)

1. **Separación real entre clase en vivo y post-clase**
   - **En Vivo · Seguimiento:** Respuestas breves, directas y ancladas al minuto exacto de clase para no competir con la explicación del profesor ni frenar la participación oral.
   - **En Vivo · Full IA:** El docente puede habilitar respuestas completas en vivo sin cerrar la clase (`classClosed === false`) y manteniendo activo el Radar de Dudas.
   - **Post-Clase · Full IA:** Al presionar **Terminar Clase** (`classClosed === true`), se habilita el tutor completo para estudio posterior y se desglosa el historial en dos fases (`inClass` vs `postClass`).

2. **Cero exclusión del discurso docente**
   - Se eliminó por completo la categoría `digresion`. El micro-etiquetado clasifica únicamente en `concepto_clave`, `formula`, `importancia` y `ejemplo`, preservando historias personales, ejemplos cotidianos y analogías que suelen sostener la intuición de la clase.

3. **Agnosticismo curricular y cero carga extra**
   - El agrupamiento de temas, el matching de láminas (`matchSlideForSegment`) y la creación dinámica de ramos/materiales (`POST /api/courses/custom`) funcionan sobre cualquier asignatura sin reglas hardcoded.
   - Vista docente reducida a 2 zonas con 3 tarjetas principales, botón protagonista (`Iniciar Clase` / `Pausar` / `Terminar Clase`), captura acústica escalonada con solapamiento de `1.0s` y sin telemetría técnica de GPU en pantalla principal (accesible en el modal de Privacidad & GPU).
   - Vista estudiante diseñada mobile-first (`48px` topbar en una fila, navegación inferior de 1 pulgar `En Vivo | Tutor | Me perdí`, botón **Citar** en transcripción y respuestas del tutor, persistencia en `sessionStorage` y citas clicables `[HIST-X]` / `[MAT-X]`).

---

## Arquitectura Modular V4

### Backend (`server.js`, `state/`, `routes/`, `data/`, `services/`)

- `server.js`: Servidor HTTP/Express en `http://localhost:3000`. Sirve `/`, `/profesor`, `/estudiante`, `/simulador` y monta las rutas modulares.
- `state/sessionStore.js`: Estado centralizado de sesión en vivo (`liveSession`, `stateVersion`, `classClosed`), hub SSE (`addSseClient`, `bumpStateVersion`), gestión de clusters (`upsertTopicCluster`) y serialización pública (`buildPublicLiveState`).
- `data/coursesDb.js`: Base de cursos de demostración (`COURSES_DB`), creación de cursos/materiales personalizados (`createCustomCourse`) y matching agnóstico por tokens (`matchSlideForSegment`).
- `routes/courseRoutes.js`: Consulta de ramos y creación de cursos propios (`POST /api/courses/custom`).
- `routes/liveRoutes.js`: Ingesta de audio con deduplicación por solapamiento, estado en vivo, stream SSE (`/api/live/stream`) y reinicio limpio (`/api/live/reset`).
- `routes/chatRoutes.js`: Tutor contextual, Quote-Reply, historial por fase y generación de cápsula.
- `services/llmClients.js`: Clientes centralizados para Groq Whisper, Groq Chat y Gemini `gemini-3.5-flash-lite` con `AbortSignal.timeout(15000)`.
- `services/textUtils.js`: Normalización sin tildes, `extractMeaningfulTokens` y `computeJaccard`.
- `services/stt.js`: `transcribeLiveAudio` (fallback `whisper-large-v3` -> `whisper-large-v3-turbo` -> `gemini-3.5-flash-lite`), filtros anti-alucinación y `mergeOverlappingTranscript` para el solapamiento de `1.0s`.
- `services/labeler.js`: Micro-etiquetador (`openai/gpt-oss-20b` + heurística) restringido a `concepto_clave`, `formula`, `importancia` y `ejemplo`.
- `services/radar.js`: `detectTopicCluster`, `autoResolveClustersFromVoice` (guardia mínima de 8 palabras) y `maybeUpdateSmartChapters` (histéresis `>= 50s`, `>= 8` palabras y sin repetición en los últimos 2 capítulos).
- `services/semanticCache.js`: Caché semántica segura (`IN_FLIGHT_QUERIES`, firma de negaciones/operadores, invalidación temporal y bypass automático `isFollowUpQuestion` ante `quotedContext`, `chatHistory` o preguntas anafóricas).
- `services/tutor.js`: Pool priorizado (`openai/gpt-oss-120b` -> `qwen/qwen3.8-27b` -> `gemini-3.5-flash-lite`), filtro agnóstico `isLikelyAcademicQuestion`, soft-landing de alcance, soporte de `quotedContext` + últimos 2 turnos de `chatHistory` tras el prefijo estático (Prefix KV-Caching) y guardia anti-respuesta vacía.
- `services/capsule.js` y `services/aiEngine.js`: Generación de cápsula post-clase con desglose por fase y re-exportación unificada de servicios.

### Frontend (`public/`)

- `public/js/icons.js`: Iconos SVG estilo Lucide uniformes, sanitización (`escapeHtml`, `formatMarkdownSafe`), notificaciones (`showToast`) y sincronización SSE (`connectLiveStateSync`).
- `public/css/app.css`: Sistema visual Obsidian Graphite, escala tipográfica modular (`11–20px`), radios concéntricos, barra de navegación móvil inferior y compositor con **Quote-Reply**.
- `public/index.html`: Selector limpio de roles (Profesor, Estudiante, Simulador).
- `public/student.html` & `public/js/student.js`: Experiencia estudiante en vivo y post-clase, **Citar** mensajes/transcripción, referencias `[HIST-X]`/`[MAT-X]` y actualización incremental del DOM.
- `public/teacher.html` & `public/js/teacher.js`: Consola docente simplificada con 3 tarjetas principales, control único de inicio/cierre, captura continua solapada y gestión en línea de ramos/láminas.
- `public/simulator.html`: Simulador interactivo con flujo completo de roles, **Quote-Reply** y citas clicables.

### Archivo Histórico

- `_legacy_v1/archive/`: Contiene los 7 archivos heredados de la V1 retirados del árbol activo durante el refactor V4.

---

## Ejecución y Validación

### Requisitos y arranque local

```bash
npm install
node server.js
```

El servidor expone:
- Portal de acceso: `http://localhost:3000/`
- Consola Docente: `http://localhost:3000/profesor`
- Vista Estudiante: `http://localhost:3000/estudiante`
- Simulador E2E: `http://localhost:3000/simulador`

*(Requiere configurar las llaves de API de Groq/Gemini en `.env` para STT y generación).*

### Resultados Verificados V4

- **Audio real de clase presencial en pizarra (`TLh_6G7i4_w`, 3 min `03:00–06:00`, 35 chunks con solapamiento):**
  - `35` entradas transcritas (`497` palabras), `88%` de cobertura frente a subtítulos de referencia.
  - Latencia por chunk: `893 ms` promedio (`1736 ms` máximo).
  - Segmentación limpia en `2` capítulos (`[00:00] Apertura y Objetivos` y `[00:20] Límite y Continuidad`) y `0` fragmentos descartados como digresión.
- **Suite automatizada V4 (`eval_v4_report.json`):** `11/11` pruebas aprobadas (`ALL PASSED: true`), incluyendo creación agnóstica del curso `FI2002` (*Electromagnetismo* con matching a `Lámina 2: Ley de Lenz`), `En Vivo · Full IA` con radar activo, precisión conceptual (`TPM Chile` -> desplazamiento de `LM`), **Quote-Reply** con bypass de caché, filtro `off_topic` y cierre a `Post-Clase`.
- **Verificación visual en navegador (escritorio `1280×800` y móvil `390×844`):** `0` errores de consola, `/profesor` simplificado a 3 tarjetas sin telemetría USD invasiva, `/estudiante` móvil con barra superior de `48px` y **Quote-Reply** funcional.

### Rollback en Git

La versión estable previa quedó etiquetada de forma inmutable antes del refactor V4:

```bash
git checkout v3.1-stable
```
