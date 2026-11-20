# Cátedra Viva V3.1 — Co-Piloto de Aula Aumentada con IA (Presencial y Virtual)

Prototipo funcional end-to-end para cátedras universitarias en tiempo real (clases presenciales y virtuales por Zoom/Meet). Diseñado bajo el principio **"Prender y Olvidarse" (Cero fricción para el docente y el alumno)**, fomentando la participación activa en sala, protegiendo la privacidad desde la arquitectura y reduciendo costos mediante GPU institucional + caché seguro sin sesgo epistémico.

---

## 🎯 Qué resuelve Cátedra Viva V3.1

1. **No mata la oportunidad de levantar la mano — la impulsa:**
   - Durante la clase (`🟢 Seguimiento`), el tutor responde en **máximo 2–3 líneas**, cita exactamente lo dicho en sala (`[VIVO-X]`) o en la diapositiva (`[SLIDE-X]`), y genera una caja verde lista con **la pregunta formulada en primera persona para levantar la mano o copiar directo al chat de Zoom/Meet**.
2. **Control total del profesor sin distracción (3 modos):**
   - `🟡 Pizarra`: pausa temporalmente respuestas del chat para centrar atención en sala; las dudas se siguen agrupando en el Radar.
   - `🟢 Seguimiento` *(default en vivo)*: respuestas ultracortas de reenganche + sugerencia de pregunta en voz alta.
   - `🟣 Full IA`: desbloqueable **en cualquier momento durante la clase** por el profesor y activado **automáticamente en 1 clic** al pulsar `🏁 Terminar Clase` para estudio profundo paso a paso con derivaciones en LaTeX.
3. **Radar Inteligente + Auto-Resolución Hands-Free:**
   - Agrupa dudas anónimas repetidas y señales de pulso (`⚡ Me perdí`, `🐢 Muy rápido`, `💡 Pedir ejemplo`) por tópico curricular (`TOPIC_RULES` + coincidencia de slides).
   - **Zero-touch Hands-Free:** Cuando el profesor vuelve a explicar el tópico oralmente en el micrófono, `autoResolveClustersFromVoice()` marca automáticamente el cluster como resuelto sin obligar al docente a mirar la pantalla.
4. **U-Cursos Auto-Sync + Degradación Limpia (Pizarra Libre):**
   - Mapea automáticamente cada segmento oral a las láminas escuetas del curso (`SLIDE-1`..`SLIDE-4`) y construye el **Apunte Vivo Fusionado** (Slide + Voz + Avisos *"Ojo para el Control"* + Pauta del Auxiliar). Si no calza con ninguna lámina, degrada limpiamente a contexto plano sin fricción.
5. **Soporte Nativo para Clases Virtuales (Zoom / Meet / Teams):**
   - Captura audio limpio directo de la pestaña/ventana (`getDisplayMedia` sin video, sin eco ambiente), comparte acceso vía enlace + QR local (`/api/qr`) sin cuentas y ofrece pulsos anónimos + botón `📋 Copiar para Zoom`.
6. **Privacidad Explícita y Tokenomics Anti-Sesgo:**
   - **Audio Efímero 0s:** Cada fragmento de audio se convierte/transcribe y se destruye del servidor en `<1s` (sin biometría vocal ni grabaciones persistidas).
   - **Privacidad en 2 Capas:** Estudiantes 100% anónimos (sin login ni correo); docentes y auxiliares solo ven clusters agregados en Capa 2.
   - **Caché Semántico Seguro:** Con Guardia de Negación y Operadores (`extractLogicalSignature`), Invalidador Temporal por avance de transcripción (`transcriptCount`), `Single-Flight Coalescing` (`IN_FLIGHT_QUERIES`), bypass manual (`🔄 Explicar desde otro ángulo`) y telemetría de **Prefix KV-Cache (92%)** comparando **API Cloud vs. GPUs Dedicadas de Facultad (`vLLM` en 2× RTX 4090 / 1× L40S)**.
7. **Data & Insights Opcional (Cero Obligación):**
   - Registra dudas anónimas separando **Durante la Clase (`in_class`)** vs. **Estudio Post-Clase (`post_class`)** más comparativas longitudinales inter-semestrales en la pestaña `📈 Data & Insights (Opcional)` del modal `📘 Apunte Vivo`.

---

## 🧭 Vistas del Sistema

| Ruta | Rol | Descripción |
|---|---|---|
| `/` | Portada | Selector de asignatura activa (`macro`, `probabilidades`, `finanzas`), enlace a roles y acceso a `/simulador`. |
| `/profesor` | Docente / Auxiliar | Micrófono sala o audio de pestaña Zoom/Meet, `🏁 Terminar Clase`, control de 3 modos (`🟡 Pizarra` / `🟢 Seguimiento` / `🟣 Full IA`), slides auto-sincronizadas, Read.ai (PPM/palabras/perdidos), Radar de dudas, QR SVG local, Privacidad/Tokenomics y Apunte Vivo (`📘` + `📋` + `📈`). |
| `/estudiante` | Estudiante | Transcripción en vivo con filtros (`Todo`, `📌 Ojo Control`, `🧮 Fórmulas`, `Sin digresiones`), citas clicables, pulsos anónimos (`⚡ Me perdí`, `🐢 Muy rápido`, `💡 Pedir ejemplo`), chat adaptativo 3 modos + caja "Levantar la mano / Copiar para Zoom" + Apunte Vivo. |
| `/simulador` | Laboratorio Tri-Rol | Vista unificada en 3 columnas (Profe • Radar Auxiliar • Estudiante) con avance de audio real chunk-a-chunk por ramo. |

---

## 🧠 Arquitectura de Modelos (Separación Estricta en 6 Buckets)

Para evitar que un componente sature la cuota de otro durante ráfagas de aula, `services/aiEngine.js` separa estrictamente cada pipeline:

| Bucket | Rol en el Pipeline | Modelo | Límite Referencial | Fallback |
|---|---|---|---|---|
| **1** | Audio STT Primario | `whisper-large-v3` (Groq) | 20 RPM | Rotación automática a Bucket 2 |
| **2** | Audio STT Respaldo | `whisper-large-v3-turbo` (Groq) | 20 RPM | Rotación a Bucket 6 (`gemini-3.5-flash-lite`) |
| **3** | Micro-Labeler Semántico | `openai/gpt-oss-20b` (Groq) | 30 RPM exclusivos | `detectHeuristicCategory()` blindada |
| **4** | Chatbot Tutor Primario | `qwen/qwen3.8-27b` (Groq) | 30 RPM exclusivos | Rotación a Bucket 5 |
| **5** | Chatbot Tutor Respaldo + Resumen | `openai/gpt-oss-120b` (Groq) | 30 RPM exclusivos | Reintento 429 / Bucket 6 |
| **6** | Respaldo Externo Multimodal/Texto | `gemini-3.5-flash-lite` (Google) | Failover rápido (~1s) | Mensaje controlado |

> **Nota crítica sobre Whisper y modelos:**
> - **NO enviar parámetro `prompt` a Whisper** en Groq (`transcribeLiveAudio`): el decodificador acústico tiende a alucinar repitiendo el prompt en pausas. La normalización fonética (`KPM ➔ CAPM`, `ISLM ➔ IS-LM`, `guac ➔ WACC`, `ban ➔ VAN`) se ejecuta en `openai/gpt-oss-20b` + `normalizeSpokenTerms()`.
> - **NO usar `llama-3.1-8b-instant` ni `gemini-2.5-flash`**: devolvieron `404` en el entorno actual del proyecto.

---

## 📁 Mapa de Archivos Activos (V3.1)

```text
├── server.js                      # Servidor Express, estado en memoria liveSession, ffmpeg, APIs REST y rutas
├── services/
│   └── aiEngine.js                # Whisper STT + filtros alucinación, Micro-Labeler, Tutor 3 modos, Caché Anti-Sesgo, Single-Flight, Cápsula & Insights
├── data/
│   └── coursesDb.js               # Cursos (macro IN4123, probabilidades IN3401, finanzas IN5233), slides U-Cursos, RAG histórico y longitudinalInsights
├── public/
│   ├── css/app.css                # Sistema visual "Obsidian Graphite" oscuro con viewport-locked desktop y switches custom
│   ├── index.html                 # Portada y selector de curso
│   ├── teacher.html & js/teacher.js   # Panel Docente/Auxiliar (Audio mic/Zoom, 3 modos, Radar, Modales QR / Apunte / Privacidad-GPU)
│   ├── student.html & js/student.js   # Vista Estudiante (Transcripción filtrable, pulsos Zoom, chat adaptativo KaTeX + Levantar la mano)
│   └── simulator.html             # Laboratorio Tri-Rol en 1 pantalla
├── Modelo IS-LM - Explicado para principiantes!.mp3  # Audio largo real (5m06s) Macroeconomía
├── Clase_Calculo_Derivadas.mp3    # Audio real Probabilidades / Cálculo (~1m08s)
├── Clase_Finanzas_CAPM.mp3        # Audio real Finanzas CAPM/WACC/VAN (~59s)
├── PRESENTACION_MARTES_V3.md      # Guion completo, trade-offs, valor de datos y resultados de estrés para la presentación
└── _legacy_v1/                    # Respaldo histórico de la primera versión (no servido por server.js)
```

---

## 🔌 Endpoints REST Principales (`server.js`)

- `GET /api/courses` y `POST /api/courses/select` — Lista y cambio de asignatura activa (`macro`, `probabilidades`, `finanzas`).
- `GET /api/live/state` — Estado en vivo completo (transcript, capítulos, clusters ordenados, pulsos, preguntas, tokenomics, Read.ai pace, `teacherSettings`).
- `POST /api/live/audio-chunk` — Recibe audio multipart desde micrófono o pestaña virtual, normaliza vía `ffmpeg-static` a MP3 mono 16kHz, transcribe, borra temporales (`ephemeralChunksDeleted++`), etiqueta, auto-resuelve Radar y actualiza Smart Chapters.
- `POST /api/simulator/step-chunk` — Simula ingesta incremental paso a paso sobre los MP3 locales del ramo activo.
- `POST /api/teacher/settings` — Cambia `chatState` (`paused` | `active` | `full_ia`), `allowComplement`, `hideDigressions`.
- `POST /api/teacher/cluster-action` — Marca cluster de Radar como `open`, `resolved`, `auto_resolved` o `for_ta`.
- `POST /api/teacher/close-class` — Cierra clase (`classClosed = true`), genera `lastCapsule`, guarda resumen en `historicalClasses` y activa automáticamente `🟣 Full IA`.
- `POST /api/chat` — Procesa duda del estudiante con caché seguro + Single-Flight, guarda `qaLog` diferenciando `phase` (`in_class` vs. `post_class`) y alimenta el Radar solo mientras `chatState !== 'full_ia'`.
- `POST /api/live/forward-question` — Escala manualmente una duda anónima al Radar (`escalatedCount`).
- `POST /api/live/lost` y `POST /api/live/pulse` — Pulsos anónimos (`lost`, `fast`, `example`).
- `GET /api/live/capsule` — Retorna Apunte Vivo Fusionado, Pauta del Auxiliar y `qaLog` + `longitudinalInsights`.
- `POST /api/materials/add` — Agrega material o guía al curso activo.
- `POST /api/live/reset` — Reinicia sesión viva manteniendo intactos los datos maestros de cursos.
- `GET /api/qr` — Genera QR SVG local sin dependencias de servicios externos.

---

## 🚀 Puesta en Marcha y Despliegue

### Variables de Entorno
Configura `.env` en local o Environment Variables en Render:
- `GROQ_API_KEY`: Clave de Groq (requerida para Whisper STT, Micro-Labeler y pool primario del Chatbot).
- `GEMINI_API_KEY`: Clave de Google AI Studio (respaldo externo Bucket 6).
- `PORT`: Puerto HTTP (por defecto `3000`).

### Ejecución Local
```bash
npm install
npm start
```
Abrir `http://localhost:3000` (o `/profesor`, `/estudiante`, `/simulador`).

### Despliegue en Render
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Node Engine:** `>=18.0.0`
- **Auto-Deploy:** Rama `main` del repositorio `https://github.com/giftofchalance/catedra-viva-demo.git`.

---

## 🤝 Guía Rápida de Handoff (Para Continuar con Otro Modelo)

Si necesitas cambiar de modelo en Antigravity por cuota, comparte este contexto esencial:
1. **Filosofía no negociable:** Toda mejora debe respetar **"cero fricción / cero trabajo extra"** para profesor y estudiante en sala. Ningún dato de diseño o estrategia longitudinal debe presentarse como imposición docente, siempre como posibilidad opcional.
2. **Privacidad y ética:** El audio **nunca** se persiste (se borra inmediatamente después de transcribir) y el alumno **nunca** tiene cuenta ni tracking individual (solo agregados por tópico en Capa 2).
3. **Soft-Tagging en Micro-Labeler:** `digresion` solo añade una etiqueta visual opcional (`hideDigressions: false` por defecto); jamás borra frases del contexto RAG ni del Apunte Vivo, evitando pérdida de analogías pedagógicas.
4. **Verificación de sintaxis:** Tras editar cualquier JS, ejecutar `node --check server.js services/aiEngine.js data/coursesDb.js public/js/teacher.js public/js/student.js` antes de iniciar `node server.js`.
5. **No contaminar con notas personales antiguas:** No leer archivos históricos antiguos del Vault salvo que Bruno los cite explícitamente; trabajar sobre el código vivo de este repositorio.
