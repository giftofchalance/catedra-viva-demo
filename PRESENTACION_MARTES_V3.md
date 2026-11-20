# Cátedra Viva V4 (Clean-Core) — Guía Completa para la Presentación del Martes

Documento de referencia con la arquitectura final **V4 Clean-Core**, funcionalidades vigentes, evolución del enfoque frente al discurso docente (*Cero Exclusión*), valor estratégico opcional de la data, privacidad/tokenomics, resultados verificados tanto en simulación larga (5m) como en **audio real de clase presencial en pizarra (3m)** y guión de demo en vivo.

---

## 1. Propuesta de Valor Central: "¿Por qué Cátedra Viva y no ChatGPT?"

1. **No mata la oportunidad de levantar la mano — la fomenta:**
   - Un LLM genérico responde párrafos extensos mientras el profesor sigue hablando: el estudiante desconecta de la sala y no pregunta.
   - En Cátedra Viva (`Modo Seguimiento`), el co-piloto entrega una guía breve de reenganche anclada a lo recién explicado y prepara la pregunta en primera persona para levantar la mano o pegar en Zoom.
2. **Anclaje vivo al contexto real del aula (Voz + Material + Seguimiento Conversacional):**
   - Captura el habla del docente en tiempo real (`1.0s` de solapamiento acústico deduplicado con `mergeOverlappingTranscript`), la vincula al material cargado (`[MAT-X]`, `[HIST-X]`) y permite hacer preguntas de seguimiento citando cualquier fragmento o respuesta previa mediante **Quote-Reply**.
3. **Principio "Prender y Olvidarse" (Cero trabajo extra):**
   - Pensado para tres perfiles docentes sin carga operativa: quien solo presiona **Iniciar Clase** y se olvida, quien restringe la clase a `Seguimiento` / `Pizarra`, y quien abre `Full IA` en vivo o usa el Radar para ajustar el ritmo.
   - El sistema auto-resuelve clusters cuando el profesor retoma verbalmente el tópico (`autoResolveClustersFromVoice`) y cierra la clase en 1 clic con **Terminar Clase** (`classClosed = true`).

---

## 2. Arquitectura y Funcionalidades Clave (V4 Clean-Core)

### A. Estados y Modos Pedagógicos Reales
- **Modo Pizarra:** Detiene las respuestas automáticas del chat cuando el profesor pide atención plena en pizarra, manteniendo activo el registro anónimo de dudas en el Radar.
- **Modo Seguimiento *(predeterminado en vivo)*:** Respuestas acotadas orientadas a reenganchar con la clase e incentivar la pregunta presencial o en videollamada.
- **Modo `Full IA` en Vivo (`classClosed === false`):** Habilitable por el profesor *durante* la clase sin cerrarla ni apagar el Radar de Dudas, desbloqueando explicaciones completas para bloques de ejercicios o talleres.
- **Post-Clase · `Full IA` (`classClosed === true`):** Al presionar **Terminar Clase**, la sesión cambia a fase post-clase para estudio autónomo y separa las métricas de preguntas en vivo vs. estudio posterior (`inClass` vs. `postClass`).

### B. Quote-Reply y Memoria Acotada (Foco Estudiante)
- El estudiante puede presionar **Citar** tanto en líneas de la transcripción como en respuestas anteriores del tutor (`quotedContext`).
- Incluye ventana acotada de los últimos 2 turnos (`chatHistory` ubicado **después** del prefijo estático de clase para no invalidar Prefix KV-Caching) y persistencia local de conversación en `sessionStorage`.
- Navegación móvil de un pulgar (`48px` de altura en `.topbar` de `/estudiante`, barra inferior `En Vivo | Tutor | Me perdí`), actualización incremental del DOM y citas `[HIST-X]` / `[MAT-X]` clicables.

### C. Agnosticismo Curricular y Escalabilidad sin Configuración Rígida
- Se eliminó la dependencia exclusiva de reglas hardcoded de los ramos demo: `detectTopicCluster()`, `matchSlideForSegment()` y `maybeUpdateSmartChapters()` (histéresis `>= 50s` y `>= 8` palabras) operan sobre tokens reales del curso activo.
- Creación dinámica de ramos desde la consola (`+ Nueva clase` vía `POST /api/courses/custom`) y carga en línea de láminas (`+ Agregar material`), validado en vivo con `FI2002 — Electromagnetismo` haciendo match automático con `Lámina 2: Ley de Lenz`.
- Adaptación automática al tipo de duda (matemática, conceptual o híbrida) y **soft-landing** de alcance académico (`isLikelyAcademicQuestion()`), respondiendo prerequisitos matemáticos sin romper el foco ni requerir botones de bypass.

### D. Consola Docente Simplificada + Soporte Virtual (Zoom / Meet)
- `/profesor` simplificada en 2 zonas con **3 tarjetas principales**, sin emojis en controles de sistema (iconos SVG estilo Lucide uniformes en `public/js/icons.js`), flujo único de inicio/pausa/cierre y telemetría de costos trasladada al modal de Privacidad & GPU para despejar la vista en sala.
- Sincronización en tiempo real mediante **SSE** (`/api/live/stream` con `stateVersion`).
- Captura nativa para clases virtuales (audio de pestaña/ventana) + acceso estudiantil sin cuentas vía enlace o QR local.

---

## 3. Decisión Crítica del Micro-Labeler: De *Soft-Tagging* a Cero Exclusión

> *Punto clave para responder con solidez si preguntan cómo evitamos filtrar contenido valioso cuando el profesor se sale del guión.*

### ¿Qué demostró el audio real de clase presencial?
Al evaluar una clase real grabada frente a pizarra (Prof. María Inés Baragatti), fragmentos que un filtro ingenuo consideraría "charla personal" o geografía (*"todos los de La Plata están cerca porque vivo en Bernal... él vive a 10 cuadras"*) eran en realidad **la intuición pedagógica directa del concepto de cercanía ($\epsilon$-entorno)**.

### Solución definitiva en V4: Cero `digresion`
- En V3 mitigamos esto con *Soft-Tagging* no destructivo; en **V4 eliminamos por completo la categoría `digresion`**.
- `services/labeler.js` (`openai/gpt-oss-20b` + heurística) clasifica estrictamente en **4 categorías positivas**: `concepto_clave`, `formula`, `importancia` y `ejemplo`.
- **Beneficio defendible el martes:** Ninguna historia personal, broma conceptual ni analogía cotidiana del profesor queda excluida, oculta o marcada como relleno.

---

## 4. Valor Estratégico de la Data (*Posibilidad Opcional, Cero Obligación*)

Toda consulta académica válida y pulso anónimo queda trazada por fase (`phase: inClass` vs. `postClass`), sin identidad del estudiante:

- **Evidencia registrada en sesión:**
  1. Dudas en tiempo real durante la clase (distinguiendo `Seguimiento` vs. `Full IA`) y tópicos del Radar.
  2. Dudas **post-clase (`Post-Clase · Full IA`)**, que muestran qué conceptos siguen generando trabas cuando el estudiante estudia por su cuenta.
  3. Pulsos anónimos (`Me perdí`, etc.) y avisos marcados por el docente.
- **Usos posibles (siempre voluntarios para el profesor, nunca imposición ni evaluación docente):**
  1. Comparar entre semestres en qué tópico se concentraron más preguntas antes y después de cambiar una estrategia de enseñanza o el orden de un ejemplo.
  2. Entregar al auxiliar una pauta real de ayudantía basada en las fricciones observadas en sala sin trabajo de coordinación manual.
  3. Detectar qué láminas minimalistas requieren un ejemplo adicional el semestre siguiente.

---

## 5. Privacidad, Ética y Tokenomics + GPUs de Facultad

### A. Privacidad por Diseño (Zero Biometría + Anonimato Real)
- **Audio efímero sin almacenamiento:** Los fragmentos de audio se transcriben y eliminan tras procesarse; no se guardan grabaciones ni huellas vocales.
- **Anonimato en 2 capas:** No existen cuentas ni identidades de estudiantes en las métricas compartidas; profesor y auxiliar solo observan clusters agregados de comprensión.

### B. Caché Semántica Sin Sesgo Epistémico (`services/semanticCache.js`)
Un caché naive repite respuestas viejas que ya no aplican o ignora negaciones (*Negation Blindness* & *Temporal Drift*). Cátedra Viva V4 aplica guardias verificables:
1. **Guardia de Negación y Operadores:** Cambios de negación o signos invalidan el acierto de caché (`"NO"`).
2. **Invalidador Temporal:** Nuevos bloques del profesor invalidan respuestas cacheadas previas al cambio de contexto.
3. **`Single-Flight Coalescing` (`IN_FLIGHT_QUERIES`):** Deduplica consultas simultáneas idénticas de múltiples estudiantes en una sola inferencia.
4. **Bypass Automático de Seguimiento (`isFollowUpQuestion()`):** Toda pregunta con **`quotedContext`** (Quote-Reply), historial previo (`chatHistory`) o anáforas de seguimiento omite la caché automáticamente.

### C. Tokenomics, Prefix KV-Caching y Stack de Modelos
- **Orden del prompt pensado para Prefix KV-Caching:** Contexto estático y transcripción primero; **`quotedContext` y los últimos 2 turnos de `chatHistory` al final**, maximizando reutilización de prefijo en infraestructura institucional (`vLLM` en GPU de facultad vs. API cloud comercial).
- **Pool de modelos verificado en V4:**
  - **STT (con solapamiento de 1.0s):** `whisper-large-v3` -> `whisper-large-v3-turbo` -> `gemini-3.5-flash-lite`.
  - **Micro-labeler:** `openai/gpt-oss-20b`.
  - **Tutor IA:** Priorizado **`openai/gpt-oss-120b` -> `qwen/qwen3.8-27b` -> `gemini-3.5-flash-lite`** (todos con `AbortSignal.timeout(15000)`). Este orden priorizó precisión conceptual y disponibilidad real en pruebas (ej. identificando correctamente desplazamiento de curva `LM` ante alza de `TPM` en Chile).

---

## 6. Validación Empírica: Línea Base V3 (5m) + Clase Real en Pizarra V4 (3m)

### A. Línea Base V3 (Clase Grabada Continua de 5m06s — *IS-LM*)
- 37 fragmentos reales: `693` palabras, `12` capítulos, latencia promedio `993 ms` (máx. `1577 ms`) y **`12/12 PASS`** en casos límite (analogías, premisa falsa, deixis temporal, ráfagas y cierre post-clase).

### B. Validación Final V4 (Audio Real de Clase en Pizarra + Suite V4 — *Análisis Matemático en Pizarra*)
Evaluado sobre 3 minutos reales de aula presencial con pizarra y ruido ambiente (`TLh_6G7i4_w`, `03:00–06:00`, 35 chunks con solapamiento, `eval_v4_report.json`):

| Evaluación V4 Verificada | Resultado Observado | Estado |
|---|---|---|
| **Audio real en pizarra (35 chunks con solapamiento)** | `35` entradas, `497` palabras, **`88%` cobertura frente a VTT** | PASS |
| **Latencia STT + Merge + Label + Capítulos** | **`893 ms` promedio** • `1736 ms` máxima | PASS |
| **Capítulos y Cero Exclusión** | `2` capítulos limpios (`00:00 Apertura y Objetivos`, `00:20 Límite y Continuidad`), **0 descartes por `digresion`** | PASS |
| **Agnosticismo dinámico (`FI2002 — Electromagnetismo`)** | Curso creado vía API y match automático con `Lámina 2: Ley de Lenz` | PASS |
| **Modo `Full IA` en Vivo (sin cerrar clase)** | Respuesta completa con **`classClosed === false`** y Radar operativo | PASS |
| **Precisión conceptual (`TPM Chile`)** | Determina correctamente que sube tasa real y **desplaza `LM` a la izquierda** | PASS |
| **Quote-Reply + Prerequisito + Caché/Negación + Filtro** | Quote-Reply (`fromCache: false`), prerequisito algebraico respondido, caché + bypass por negación `"NO"`, Netflix bloqueado `off_topic` | PASS |
| **Cierre a Post-Clase y Trazabilidad** | `classClosed === true`, `qaLog`: **`totalValid: 8` (`inClass: 7` / `postClass: 1`)** | PASS |
| **Suite automatizada V4 (`eval_v4_report.json`)** | **`11/11` pruebas aprobadas (`ALL PASSED: true`)** | PASS |
| **Auditoría visual en navegador (`1280×800` y `390×844`)** | `0` errores de consola; `/profesor` reducido a `3` tarjetas; `/estudiante` móvil con `.topbar` de `48px` y **Quote-Reply** funcional | PASS |

**Matices transparentes observados (bueno transparentarlo si hay preguntas técnicas):**
1. Aun acertando la conclusión (`desplaza LM a la izquierda`), en una respuesta puntual de `TPM Chile` el modelo mencionó *"demanda de dinero"* en vez de *"oferta monetaria / liquidez"*, reforzando la importancia de mostrar siempre citas de clase al alumno.
2. En vista móvil muy estrecha (`390px`), un nombre largo de curso (`Mac...`) se trunca al lado del indicador `En vivo · Seguimiento` dentro del header de `48px`.

---

## 7. Guión Sugerido de Demo en Vivo (5 Minutos)

1. **Minuto 0:00–1:00 — Problema y Filosofía:**
   - Mostrar `/profesor` limpia (3 tarjetas, botón protagonista **Iniciar Clase**): *"Prender y olvidarse; no reemplazamos la mano alzada, la habilitamos."*
2. **Minuto 1:00–2:15 — Voz Real, Capítulos Agnósticos y Cero Exclusión:**
   - Mostrar cómo la transcripción solapada (`1.0s`) arma capítulos limpios y clasifica en 4 categorías sin borrar historias o analogías del docente (y mencionar que funciona igual en un curso recién creado como `FI2002 Electromagnetismo` o en clases virtuales Zoom/Meet).
3. **Minuto 2:15–3:30 — Experiencia Estudiante (Seguimiento + Quote-Reply + Radar):**
   - En `/estudiante` (o vista móvil / `/simulador`), enviar una pregunta en `Seguimiento` y luego hacer **Citar (Quote-Reply)** sobre la respuesta del tutor o sobre un bloque del transcript para profundizar una parte puntual.
   - Destacar cómo las dudas alimentan el Radar del docente/auxiliar de forma anónima.
4. **Minuto 3:30–4:30 — `Full IA` en Vivo vs. `Terminar Clase` (Post-Clase):**
   - Activar `Full IA` en vivo demostrando que la clase sigue abierta y el Radar activo; luego presionar **Terminar Clase** para mostrar la transición a **Post-Clase · Full IA** y la cápsula con desglose `inClass` / `postClass` + uso opcional entre semestres.
5. **Minuto 4:30–5:00 — Privacidad, Tokenomics y Evidencia:**
   - Mostrar la trazabilidad sin cuentas, Prefix KV-Caching + cachés con guardia de negación/seguimiento, y cerrar con los resultados reales: **`88%` cobertura VTT en clase real de pizarra, `893 ms` de latencia media y `11/11 PASS` (`ALL PASSED: true`)**.
   - *(Respaldo técnico en Git: tag inmutable `v3.1-stable` disponible para rollback instantáneo en `git checkout v3.1-stable`).*
