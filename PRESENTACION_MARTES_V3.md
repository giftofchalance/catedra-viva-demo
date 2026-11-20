# Cátedra Viva V3.1 — Guía Completa para la Presentación del Martes

Documento de referencia con todas las funcionalidades implementadas en V3 / V3.1, decisiones de diseño (*trade-offs*), valor estratégico de la data, arquitectura de privacidad/tokenomics, resultados reales de las pruebas de estrés de 5 minutos + 6 casos límite y guión de demo en vivo.

---

## 1. Propuesta de Valor Central: "¿Por qué Cátedra Viva y no ChatGPT?"

1. **No mata la oportunidad de levantar la mano — la fomenta:**
   - Un LLM genérico responde 5 párrafos largos mientras el profesor sigue hablando: el estudiante deja de escuchar y nunca pregunta en sala.
   - En Cátedra Viva (`🟢 Modo Seguimiento`), el co-piloto responde en **2–3 líneas de reenganche rápido**, cita exactamente `[VIVO-X]` o `[SLIDE-X]`, y genera automáticamente una caja verde con **la pregunta redactada en primera persona lista para levantar la mano o pegar en el chat de Zoom/Meet** (`📋 Copiar para Zoom`).
2. **Anclaje vivo en tiempo real (Voz + PPT + Memoria):**
   - Sabe qué dijo el profesor hace 20 segundos (`[VIVO-X]`), en qué lámina está (`[SLIDE-X]` vía *U-Cursos Auto-Sync*), qué avisó que entra en el control (`📌 Ojo Control`) y qué se vio la clase pasada (`[HIST-X]`).
3. **Principio "Prender y Olvidarse" (Cero trabajo extra):**
   - El profesor no modera un chat, no marca "duda resuelta" manualmente (el sistema auto-resuelve clusters por voz cuando retoma el tema) y termina la clase con 1 clic (`🏁 Terminar Clase`), liberando el **Apunte Vivo Fusionado**, la **Pauta del Auxiliar** y el **Modo Full IA**.

---

## 2. Catálogo Completo de Funcionalidades (V3 / V3.1)

### A. Control Maestro Docente en 3 Modos
- **`🟡 Modo Pizarra`:** Pausa las respuestas automáticas del chatbot cuando el profesor quiere atención 100% en la pizarra presencial. Las dudas que escriben los alumnos no se pierden: quedan registradas anónimamente en el Radar Profe/Auxiliar.
- **`🟢 Modo Seguimiento` *(default en vivo)*:** Respuestas de 2–3 líneas + citas exactas + sugerencia en primera persona para preguntar en voz alta / Zoom. **No existe botón de bypass en la vista estudiante** para saltar a respuestas largas durante la clase.
- **`🟣 Modo Full IA` (En Vivo o Post-Clase):**
  - **Confirmado: sigue 100% habilitable durante la clase en vivo** si el profesor decide desbloquearlo manualmente desde el control maestro (`#chatModeControl`) — por ejemplo, en talleres o bloques de resolución de ejercicios.
  - Además, al pulsar **`🏁 Terminar Clase`** (o `✨ Cerrar & Full IA`), la sala cambia **automáticamente en 1 clic** a `🟣 Full IA` para que los alumnos estudien post-clase paso a paso con derivaciones en LaTeX y preguntas de chequeo conceptual.

### B. Adaptación Modular Automática (Sin Encasillar Asignaturas)
- Sin configuraciones manuales por ramo: el motor detecta automáticamente si la duda es **formal/matemática** (derivación paso a paso en LaTeX), **conceptual/causal** (intuición y contraste) o **híbrida** (ej. Electromagnetismo, Finanzas, Macroeconomía: intuición física/económica + ecuación).

### C. Radar de Comprensión + Auto-Resolución Hands-Free
- Agrupa dudas repetidas y pulsos anónimos (`⚡ Me perdí`, `🐢 Muy rápido`, `💡 Pedir ejemplo`) en **clusters por tópico** visibles en tiempo real para profesor y auxiliar (con banner superior legible a 3 metros desde la pizarra cuando hay cuellos de botella).
- **Hands-Free Voice Auto-Resolution:** Si el profesor retoma verbalmente un tópico abierto en el Radar durante el siguiente segmento de voz, `autoResolveClustersFromVoice()` lo marca automáticamente como resuelto (`✓ Retomado oralmente [MM:SS]`) sin exigir interacción física del docente.

### D. U-Cursos Auto-Sync & Apunte Vivo Fusionado (Con Degradación Limpia)
- Mapea automáticamente lo hablado en sala contra las láminas escuetas cargadas del ramo (`SLIDE-1`..`SLIDE-4`, clicables con vista previa de bullets).
- Si el profesor habla sin diapositivas, usa pizarra libre o una PPT minimalista de 5 láminas escuetas, los segmentos que no calzan con un slide degradan limpiamente a **Pizarra Libre** (`unmappedEntries`) sin romperse ni inventar asociaciones.
- Genera la **Cápsula Post-Clase** descargable en Markdown (`.md`) con 3 pestañas:
  1. `📘 Apunte Vivo (Slides + Voz + Avisos Ojo Control)`
  2. `📋 Pauta Automática Auxiliar` (qué costó más, dudas anónimas reales y estado de resolución)
  3. `📈 Data & Insights (Opcional)`

### E. Soporte Nativo para Clases Virtuales (Zoom / Meet / Teams)
- Selector de fuente `💻 Virtual (Zoom/Meet)` que captura audio limpio directo de la pestaña/ventana (`getDisplayMedia` con audio sin video, evitando eco de parlantes o ruido ambiente).
- Acceso estudiantil sin fricción mediante enlace directo o QR SVG generado localmente (`/api/qr`) sin crear cuentas.
- **Barra de Pulsos Anónimos** en `/estudiante`: `⚡ Me perdí`, `🐢 Muy rápido`, `💡 Pedir ejemplo` + botón **`📋 Copiar para Zoom`** en la pregunta sugerida para pegarla directo al chat de la videollamada.

### F. Experiencia de Aula & Laboratorio Tri-Rol (UI Obsidian Graphite)
- Vistas independientes (`/profesor`, `/estudiante`, `/`) + **Laboratorio Tri-Rol (`/simulador`)** con las 3 columnas en 1 pantalla (Profe • Radar Auxiliar • Estudiante) y audios reales de los 3 ramos (`Macroeconomía IS-LM`, `Probabilidades/Cálculo`, `Finanzas CAPM/WACC/VAN`).
- Filtros 1-clic en transcripción (`Todo | 📌 Ojo Control | 🧮 Fórmulas | Sin digresiones`), métricas Read.ai en vivo (`Velocidad PPM`, `Palabras`, `"Me perdí"`) y capítulos inteligentes automáticos.

---

## 3. Trade-Off Crítico del Micro-Labeler (`digresión` vs. Analogías)

> *Inquietud válida de Bruno para defender el martes ante críticas técnicas o pedagógicas.*

### ¿Cuál es el riesgo real?
Un clasificador en tiempo real podría etiquetar equivocadamente como `digresion` una **analogía cotidiana usada para explicar materia** (ej. *"armar un portafolio diversificado es como armar una selección de fútbol o no poner todos los huevos en la misma canasta"*), o un comentario breve de transición que el alumno sí necesita entender.

### Cómo lo resolvimos (Enfoque: *Soft-Tagging No-Destructivo*)
1. **Nunca borra información (`Zero Data Loss`):**
   - A diferencia de un *Hard-Filter* que elimina chunks antes de guardarlos, Cátedra Viva aplica **Soft-Tagging**: todas las frases ingresan íntegras al transcript, al contexto RAG del chatbot y al Apunte Vivo Fusionado.
   - El switch `Ocultar Digresiones` está **desactivado (`false`) por defecto** tanto en `/profesor` como en `/estudiante`, y solo oculta visualmente la tarjeta si el usuario lo pide.
2. **Doble Barrera Anti-Falso-Positivo:**
   - **En el LLM (`openai/gpt-oss-20b`):** Regla explícita de que cualquier metáfora cotidiana usada *para explicar un concepto* (fútbol, huevos, casino, cocina) es SIEMPRE `concepto_clave`, reservando `digresion` solo para logística desconectada (paraguas perdido, horario de pasillo).
   - **En el Fallback Heurístico (`detectHeuristicCategory`):** Bloqueo determinista de términos académicos (`diversificación`, `riesgo`, `varianza`, `IS-LM`, `CAPM`, `Bayes`, etc.): si hay un término académico presente, **jamás** clasifica como `digresion`, aun cuando la API gratuita alcance su límite de RPM (`429`).

**Cómo explicarlo en 20 segundos el martes:**
*"Elegimos un trade-off explícito a favor del recall pedagógico: hacemos Soft-Tagging no destructivo en vez de Hard-Filtering. Si el profesor cuenta una analogía o broma relacionada con el ramo, nunca se borra del contexto de la IA ni del apunte; simplemente queda etiquetada para quien quiera filtrar logística de sala."*

---

## 4. Valor Estratégico de la Data Recopilada (*Posibilidad Opcional, Cero Obligación*)

Toda interacción válida en la sala queda registrada anónimamente con trazabilidad temática y fase temporal (`phase: 'in_class'` vs `phase: 'post_class'`), sin identidad de estudiante:

- **Qué queda guardado hoy en `qaLog` (`generateFusedPostClassCapsule`):**
  1. Consultas realizadas **durante la clase** (distinguiendo `🟢 Seguimiento` vs `🟣 En Vivo Full IA`), su tópico (`TOPIC_RULES` / slide), timestamp, respuesta entregada y si fue servida desde caché seguro.
  2. Consultas profundas realizadas **post-clase (`🟣 Post-Clase Full IA`)** tras el cierre de la sesión, que revelan dónde se traba el alumno cuando estudia solo fuera del aula.
  3. Señales de pulso (`Me perdí`, `Muy rápido`, `Pedir ejemplo`) y énfasis del docente (`📌 Ojo Control`).

- **Posibilidades de uso de alto valor (siempre optativas para el docente):**
  1. **Comparativa Longitudinal Inter-Semestral (Tab `📈 Data & Insights (Opcional)`):**
     - Permite a un profesor —**solo si él quiere, jamás como obligación ni mecanismo de evaluación/vigilancia**— comparar qué temas concentraron más dudas en vivo vs. post-clase en semestres anteriores (ej. *Otoño 2025 vs. Primavera 2025*) y validar con evidencia si probar una nueva forma de explicar (ej. un contraejemplo numérico antes de la fórmula o el canal causal del *crowding out* antes del gráfico) redujo las dudas en las cohortes siguientes.
  2. **Pauta Viva de Ayudantía (Cero coordinación manual):**
     - El auxiliar recibe automáticamente los tópicos con mayor fricción real de esa semana y ejemplos anónimos de cómo preguntan los alumnos.
  3. **Evolución Basada en Evidencia de Guías y PPTs:**
     - Detectar diapositivas escuetas donde sistemáticamente se acumulan pulsos `"💡 Pedir ejemplo"` o `"🐢 Muy rápido"` para reforzarlas el próximo semestre.

---

## 5. Privacidad, Ética y Tokenomics + GPUs Dedicadas de Facultad

### A. Privacidad por Diseño (EU AI Act & Ley 21.719 Chile)
- **Audio Efímero 0s (Cero Biometría Vocal):** Cada chunk se normaliza vía `ffmpeg-static`, se transcribe y se elimina en `<1s` del servidor (`unlinkSync`, contador auditado en vivo `ephemeralChunksDeleted`). No se almacenan grabaciones ni voiceprints.
- **Privacidad en 2 Capas (Anonimato Real):** No existen cuentas de usuario, RUT, correos ni IDs de alumno en Capa 1. Profesor y auxiliar únicamente observan clusters agregados en Capa 2 (ej. `"Curva IS: 4 señales"`), eliminando la inhibición social.

### B. Tokenomics sin Sesgo Epistémico
Un caché semántico ingenuo responde con respuestas antiguas que contradicen la explicación nueva o confunden preguntas con negaciones (*Negation Blindness* & *Temporal Drift*). Cátedra Viva implementa **4 guardias verificables**:
1. **Guardia de Negación y Operadores (`extractLogicalSignature`):** Preguntar *"¿Por qué la curva IS **NO** tiene pendiente positiva?"* o cambiar signos/números invalida el match de caché respecto a *"¿Qué representa la curva IS?"*.
2. **Invalidador Temporal (`transcriptCount`):** Si el profesor dijo un bloque nuevo desde la última respuesta cacheada, el contexto cambió y se exige recalcular.
3. **`Single-Flight Coalescing` (`IN_FLIGHT_QUERIES`):** Si 30 alumnos en la sala preguntan casi lo mismo al mismo segundo tras un gráfico complejo, solo **1 llamada LLM** sale hacia la API/GPU y las demás comparten esa misma respuesta.
4. **Control Manual (`🔄 Explicar desde otro ángulo`):** Fuerza `bypassCache: true` y sube diversidad para entregar otra analogía o derivación.

### C. Economía de Escala: API Cloud vs. GPUs Dedicadas de Facultad (`vLLM`)
Con **Prefix KV-Caching (~92% de prefijo compartido)** porque toda la sala comparte sistema + transcript + slides:

| Arquitectura (40 salas/día) | CapEx Inicial | OpEx Mensual | TCO 3 Años | Soberanía de Datos |
|---|---|---|---|---|
| **API Cloud Comercial** | \$0 | ~\$1.500–\$2.500 USD | ~\$54.000–\$90.000 USD | Datos salen a servidores externos |
| **GPU Facultad (`vLLM`: 2× RTX 4090 / 1× L40S)** | ~\$6.500–\$12.000 USD | ~\$95 USD electricidad | **~\$10.000–\$15.400 USD (>75% ahorro)** | **100% Red Campus** (y de noche corre investigación) |

*(Separación actual del prototipo en nube gratuita: 6 buckets independientes entre `whisper-large-v3`, `whisper-large-v3-turbo`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-120b` y failover rápido `gemini-3.5-flash-lite` en `<1s`.)*

---

## 6. Resultados de la Prueba Extendida (5+ Minutos y 6 Casos Límite)

Para validar robustez antes del martes se ejecutó una simulación continua de **5 minutos reales (`Modelo IS-LM - Explicado para principiantes!.mp3`, 37 fragmentos de audio de 8s)** seguida de **6 casos límite adversarios** (`stress_test_v3.mjs`).

### Bugs Reales que Expuso la Simulación Larga (y Fueron Corregidos)
Las pruebas largas destaparon 7 fallos reales que no aparecían en pruebas unitarias cortas:
1. **Timeouts colgados y modelo Gemini caído:** `fetch` a APIs externas no tenía timeout y `gemini-3.8-flash` superaba 15s; se reemplazó Bucket 6 por **`gemini-3.5-flash-lite` (~991ms)** + `AbortSignal.timeout(15000)` en todos los llamados.
2. **Alucinación `"Música"` al final del video (04:56):** Whisper devolvía `"Música"` sobre la cortina musical final; añadida a `WHISPER_SILENCE_HALLUCINATIONS`.
3. **Saturación TPM en ráfagas y post-cierre (`429`):** Al acumular >35 bloques, el prompt + `generateClassSummary` excedía los `8.000 TPM` de Groq Free Tier; solucionado con compactación inteligente (`>18` bloques -> últimos 12 + máx 8 históricos clave, ~55% menos tokens), `Single-Flight Coalescing` y failover inmediato a `gemini-3.5-flash-lite`.
4. **Falso `digresión` en analogía bajo fallback `429`:** La heurística local marcaba `"fútbol"` como digresión y no reconocía avisos de `"paraguas/portería"`; corregido con escudo de vocabulario académico en `detectHeuristicCategory()`.
5. **Truncamiento en respuestas rápidas:** Modelos con razonamiento interno consumían `max_tokens: 380` cortando la frase final; ampliado a `900` (`active`) / `1800` (`full_ia`) manteniendo la concisión vía prompt.
6. **Smart Chapters ausentes en simulador:** `/api/simulator/step-chunk` no invocaba el generador de capítulos compartido con `/api/live/audio-chunk`.
7. **Premisa falsa rechazada o devuelta sin cuerpo:** Ante *"Como el profesor dijo que la curva IS tiene pendiente positiva..."*, el LLM primero la rechazó como `🚫 off_topic` y luego emitió `@@VOZ_ALTA@@` sin explicación previa; resuelto reordenando prioridad académica primero + guardia determinista `hasCourseAcademicKeyword()` + guardia de cuerpo mínimo antes de `@@VOZ_ALTA@@`.

### Métricas Finales Verificadas (`stress_report_v3.json` — 12/12 PASS)

| Métrica / Caso Límite Evaluado | Resultado Verificado | Estado |
|---|---|---|
| **Clase continua 5m06s (37 chunks audio real)** | `693` palabras, `12` capítulos inteligentes (`00:00` a `04:32`), **0 alucinación `"Música"`** | ✅ PASS |
| **Latencia de procesamiento por chunk (Whisper + Label + Sync)** | Promedio **`993 ms`** • Máxima **`1577 ms`** | ✅ PASS |
| **Caso 1 — Analogía pedagógica (*fútbol/huevos + riesgo*)** | Etiquetada `concepto_clave` (no `digresion`), incluso con `429` en Groq | ✅ PASS |
| **Caso 2 — Digresión logística (*paraguas en portería*)** | Etiquetada correctamente como `digresion` | ✅ PASS |
| **Caso 3 — Premisa falsa (*"IS tiene pendiente positiva..."*)** | Corrige explícitamente: pendiente **negativa**, inversión y PIB disminuyen `[VIVO-24]` `[SLIDE-1]` | ✅ PASS |
| **Caso 4 — Deixis temporal (*"lo último que dijo recién"*)** | Sintetiza los últimos bloques completos `[VIVO-36]` sin truncarse | ✅ PASS |
| **Caso 5 — Ráfaga concurrente (5 queries simultáneas)** | Repetidas x2 `fromCache: true`, Negación `"NO"` hace bypass (`fromCache: false`), Off-topic bloqueado (`canForwardToTeacher: false`), Multiplicador respondido sin HTTP 500 | ✅ PASS |
| **Caso 6 — `🟣 Full IA` en vivo + Cierre + Post-Clase + Insights** | En vivo `Full IA` OK (`3336` chars), Post-Clase `Full IA` OK (`2945` chars), `qaLog`: **8 En Vivo / 1 Post-Clase** + `longitudinalInsights` presentes | ✅ PASS |
| **Inspección visual navegador (`/profesor` -> `📈 Data & Insights`)** | Modal oscuro sin clipping ni errores JS (`0` errores), `🟣 Full IA` activo y `12` capítulos visibles | ✅ PASS |

---

## 7. Guión Sugerido de Demo en Vivo (5 Minutos el Martes)

1. **Minuto 0:00–1:00 — El Problema y la Filosofía ("Cero fricción + Participación"):**
   - Mostrar `/profesor` y explicar: *"Prender y olvidarse. No competimos por reemplazar al profe, sino por devolverle al alumno la confianza para levantar la mano y al profe el pulso silencioso de la sala."*
2. **Minuto 1:00–2:15 — Voz Real + U-Cursos Auto-Sync + Zoom/ sala (`Finanzas CAPM/WACC/VAN`):**
   - Seleccionar `IN5233 — Finanzas` en `/simulador` (o `/profesor` + `/estudiante`) y avanzar 2–3 chunks reales de audio: mostrar transcripción en `<1s`, mapeo automático `[SLIDE-1/2/3]` y `📌 Ojo Control`. Mostrar la pestaña `💻 Virtual (Zoom/Meet)` para videollamadas.
3. **Minuto 2:15–3:30 — Pregunta en Vivo + Guardia Anti-Sesgo + Radar Auto-Resuelto:**
   - En Estudiante, preguntar *"¿Qué riesgo mide la beta bajo el CAPM?"* -> mostrar respuesta de **2–3 líneas + caja verde "Para levantar la mano / Copiar para Zoom"**.
   - Preguntar *"¿Por qué la beta **NO** mide el riesgo idiosincrático?"* -> mostrar que la **Guardia de Negación** no devuelve caché sesgado.
   - Simular pulsos `⚡ Me perdí` -> ver el **Radar de Pizarra** y cómo al avanzar el audio donde el profe lo explica, **se auto-resuelve sin tocar la pantalla**.
4. **Minuto 3:30–4:30 — `🏁 Terminar Clase` ➔ `🟣 Full IA` + Apunte Vivo & Data Opcional:**
   - Pulsar `🏁 Terminar Clase` (aclarando que `🟣 Full IA` también puede abrirse durante la clase cuando el profe quiera). Mostrar cómo el estudiante se desbloquea a respuestas profundas con LaTeX.
   - Abrir `📘 Apunte Vivo`: mostrar las 3 pestañas (`Apunte Vivo`, `Pauta Auxiliar` y `📈 Data & Insights (Opcional)` con la comparativa inter-semestral).
5. **Minuto 4:30–5:00 — Privacidad Explícita, Tokenomics GPU y Validación:**
   - Abrir `🛡️ Audio Efímero • Anónimo`: explicar Audio Efímero 0s, Anonimato 2 Capas, `vLLM` + Prefix Cache (92%) en 2× RTX 4090 / 1× L40S (>75% ahorro TCO), Trade-off *Soft-Tagging* en digresiones y el resultado **12/12 PASS** en clase simulada de 5 minutos.
