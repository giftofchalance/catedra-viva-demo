# Cátedra Viva — Aula Aumentada con IA
*(nombre de trabajo — cambiar por el definitivo)*

> Documento de refinamiento del proyecto para el ramo "Aplicaciones de la IA en la Educación (powered by GPT)". Estructurado según las secciones de la pauta de evaluación para poder convertirlo directamente en la presentación.

---

## 1. Introducción

### 1.1 El problema

Las cátedras expositivas (clases magistrales, tipo lecture) siguen siendo, en gran parte de la educación superior, un evento efímero: el conocimiento se transmite una sola vez, en un momento y lugar fijo, y desaparece salvo por los apuntes que cada estudiante alcance a tomar. Esto genera tres problemas concretos:

1. **Accesibilidad**: estudiantes con discapacidad auditiva, o simplemente con dificultades de comprensión en el momento, no tienen forma de seguir o repasar el contenido en tiempo real.
2. **Pérdida de información**: quien falta a clases, se distrae, o no entendió un ejemplo puntual, no tiene cómo recuperar ese contenido específico sin depender de terceros (compañeros, grabaciones completas de 90 minutos sin indexar).
3. **Conocimiento no acumulado**: cada semestre la misma clase se dicta "desde cero" — no existe un registro comparable de cómo evoluciona el contenido de un ramo año a año, ni entre distintos profesores que dictan el mismo curso.

Las soluciones existentes (ver sección 2.3) atacan el problema 1 y 2 de forma genérica (transcripción + resumen), pero **ninguna está diseñada específicamente para el aula física universitaria ni construye una base de conocimiento histórica por ramo**. Ahí está el espacio que señaló el profesor Celis.

### 1.2 Objetivos específicos

- **O1.** Transformar el audio de una clase expositiva en una transcripción estructurada en tiempo real, distinguiendo claramente lo dicho por el docente de cualquier anotación generada por la IA.
- **O2.** Ofrecer, durante la clase, un asistente conversacional acotado al contenido de esa sesión específica (glosario, ejemplos, resúmenes de los últimos minutos), sin permitir que se convierta en un chatbot genérico.
- **O3.** Generar automáticamente, al cierre de cada clase, un resumen + lista de conceptos clave + transcripción completa indexada y buscable.
- **O4.** Construir progresivamente una base de datos histórica por ramo/módulo que permita comparar cómo se explica un mismo concepto entre distintas fechas, secciones o docentes.
- **O5.** Definir y validar, junto con al menos un curso piloto, el tipo de clase (formato, dinámica, tamaño) para el cual esta herramienta agrega valor real sin entorpecer la dinámica de aula.

---

## 2. Descripción del Diseño de la Aplicación

### 2.1 Alcance: ¿a qué tipo de clase apuntamos?

Respondiendo directamente al feedback del profesor Celis — **la propuesta es NO apuntar a cualquier clase**, sino acotar el MVP a:

- **Clases expositivas / magistrales**, con un docente hablando la mayor parte del tiempo (ej. introducción a álgebra, estadística, fundamentos de una disciplina), donde el flujo de habla es predominantemente unidireccional.
- **Explícitamente fuera de alcance para el MVP**: clases con dinámica grupal intensa, discusión abierta entre muchos estudiantes, o trabajo de taller (como esta clase del ramo), porque requieren diarización de múltiples hablantes y detección de actividad, un problema bastante más difícil y con menor tasa de acierto hoy.
- Esto no es una limitación permanente: es una decisión de scoping para poder demostrar algo sólido, con un camino claro de expansión (sección 6).
- Vale notar que **ambos tipos de clase tienen valor solo con la transcripción** (repaso, accesibilidad), pero el chatbot en vivo acotado y el control de alcance dependen fuertemente de que la clase sea predominantemente expositiva. **Confirmado como decisión del equipo.**

**Fuentes de datos para probar la idea** (según lo sugerido por Celis):
- Grabación corta (5-10 min) de una clase real tipo cátedra, con consentimiento del docente.
- Videos de clases grabadas ya existentes (EOL / repositorios de la universidad) como dataset adicional para probar transcripción y resumen sin depender solo de grabación en vivo.
- **Alternativa igual de válida si el terreno se complica:** audio de una clase expositiva pública descargado de YouTube (una cátedra universitaria grabada). Cumple la misma función para probar el prototipo — el punto no es de dónde viene el audio, sino que sea contenido real de una clase expositiva.

### 2.2 Funcionalidades clave

**Durante la clase (modo en vivo):**
- Transcripción continua en pantalla (accesibilidad auditiva).
- Chat lateral donde el estudiante puede preguntar en lenguaje natural: *"¿qué significa elasticidad?"*, *"no entendí el ejemplo anterior"*, *"resume los últimos 10 minutos"*.
- Separación visual explícita: lo que dijo el profesor vs. lo que agrega la IA (ej. dos columnas o dos estilos de burbuja de texto), para que nunca se confunda una explicación generada con la palabra del docente.

**Después de la clase (modo repaso):**
- Transcripción completa, indexada por timestamp.
- Resumen automático + lista de conceptos clave extraídos.
- Buscador tipo "¿qué dijo el profesor sobre la prueba?" sobre el historial de esa clase.

**A través del tiempo (base histórica — el diferenciador fuerte):**
- Cada clase queda asociada a ramo → módulo/unidad → fecha → docente.
- Al iniciar una nueva clase sobre un tema ya visto antes (mismo ramo, mismo módulo), el sistema usa el resumen de la sesión anterior como contexto para el resumen incremental (esto responde directamente al feedback de "recurrencia" recibido en la presentación 0).
- Vista comparativa: mismo concepto, explicado en distintos años o por distintos profesores — útil para coordinación académica y para mejora continua de la docencia.

**Analítica de comprensión (a partir de los chats guardados):**
- Se guardan las conversaciones que cada estudiante tiene con el chatbot durante la clase (ya se genera esa data, el costo adicional es solo de almacenamiento).
- Con eso se construye una vista agregada de qué conceptos generan más preguntas, o qué tramo de la clase tuvo más consultas tipo "no entendí" — señal directa para que el profesor sepa qué reforzar, en el momento o la próxima vez que dicte esa clase (se conecta con la recurrencia del punto anterior).
- Ver sección 2.5 para el diseño de privacidad de esta funcionalidad — es la parte más sensible del proyecto y requiere una decisión explícita sobre identificación de los estudiantes.

### 2.3 Comparación con soluciones existentes *(sección a delegar — no es un criterio puntuado directamente en la pauta, pero sostiene el argumento de innovación de 2.2)*

Existen varias herramientas de transcripción con IA en el mercado educativo:

- Herramientas como **Sonix** y **Otter.ai** ofrecen transcripción en tiempo real, identificación de hablantes y resúmenes automáticos, pensadas sobre todo para uso individual (grabar y repasar), no para integrarse como capa de la sala de clases.
- **Verbit** ("Campus Complete") apunta a cumplimiento normativo de accesibilidad (ADA) a nivel institucional, un enfoque más administrativo/compliance que pedagógico.
- Existe además un proyecto open-source (**eeclass**) muy cercano en concepto: transcripción en vivo con separación de hablantes durante la clase, y generación posterior de resúmenes y material de estudio con un LLM — construido para el contexto universitario chino.

**Conclusión honesta:** transcribir + resumir una clase ya no es, por sí solo, innovador — es terreno conocido. Nuestra propuesta de valor diferencial es:

1. El **asistente conversacional acotado durante la clase misma** (no solo post-procesamiento).
2. La **base de conocimiento histórica y comparativa por ramo/docente/año**, que ninguna de las soluciones revisadas ofrece.
3. El foco explícito en el **aula física universitaria local**, con integración a los sistemas y procesos de la institución (EOL, coordinación de docencia), no como herramienta genérica de terceros.

### 2.4 Cómo se integra la IA (y cómo se controla)

| Componente | Función | Cómo se acota |
|---|---|---|
| **Speech-to-Text** (ej. Whisper) | Transcribe el audio de la clase en tiempo real | — |
| **LLM (GPT / Claude) — modo resumen** | Genera resumen, conceptos clave y comparación con clases anteriores | Recibe solo la transcripción de esa clase + resumen(es) previo(s) del mismo módulo como contexto |
| **LLM — modo chatbot en vivo** | Responde preguntas de estudiantes durante la clase | **RAG acotado**: el modelo solo puede usar como contexto (a) la transcripción de la clase en curso y (b) el syllabus/glosario del ramo. Preguntas fuera de ese contexto reciben una respuesta estándar tipo "esa pregunta no está relacionada con el contenido de esta clase" en vez de responder con conocimiento general |
| **Clasificador de intención (opcional, si da el tiempo)** | Filtra antes de llegar al LLM si la pregunta es on-topic | Reduce costo y evita que el chatbot "se vaya por las ramas" |

Esto responde directamente al feedback de presentación 0 ("controlar la IA, alineados al curso").

**Cómo funciona en la práctica (sin jerga):** piensa en el chatbot como si tuviera una "biblioteca" que solo contiene dos cosas: lo que se ha dicho en la clase hasta ese minuto, y el programa/glosario del ramo. Cuando un estudiante pregunta algo, el sistema busca la respuesta ahí. Si la pregunta no tiene relación con esa biblioteca (por ejemplo, algo de otro ramo o de la contingencia), el sistema no usa su conocimiento general para responder, sino que devuelve un mensaje tipo "esa pregunta no parece estar relacionada con esta clase". Esto se logra dándole instrucciones explícitas al modelo (un "system prompt"), no requiere entrenar nada propio. No es 100% infalible — un estudiante insistente podría intentar sacarlo del tema —, pero cubre el caso normal y es fácil de demostrar en el prototipo (una pregunta on-topic funcionando vs. una off-topic siendo rechazada).

**Niveles de robustez (de más simple a más sofisticado):**

| Nivel | Cómo funciona | Robustez | ¿Construir para el prototipo? |
|---|---|---|---|
| 1. System prompt | Se le instruye al modelo "solo responde sobre estos temas" | Baja — el modelo igual tiene todo su conocimiento general disponible, solo se le pidió no usarlo; se puede intentar burlar | Sí, es la base |
| 2. RAG con contexto restringido | Al modelo literalmente no se le entrega en el contexto nada más que la transcripción de la clase y el glosario del ramo | Media-alta — no está "decidiendo" ignorar conocimiento, responde casi exclusivamente en base a lo que tiene delante | **Sí — recomendado para el MVP**, combinado con el nivel 1 |
| 3. Clasificador de filtro previo | Antes de llegar al modelo conversacional, un paso separado (más barato y estricto) decide si la pregunta es on-topic; si no, ni siquiera se llama al modelo principal | Alta — más difícil de burlar porque es una puerta separada | No para el prototipo — mencionar como próximo paso en la presentación |

Para el prototipo, niveles 1+2 combinados son suficientes y demostrables sin tomar mucho más tiempo que hacer solo el nivel 1.

### 2.5 Guardar las conversaciones del chatbot: ¿ligadas a la cuenta personal?

Guardar los chats para la analítica de comprensión (2.2) plantea una pregunta de diseño real, sin respuesta obvia: **¿debería cada conversación estar ligada a la cuenta de ucursos del estudiante?**

- **A favor de ligarlo:** permite trazabilidad en casos extremos de mal uso del chatbot, evita spam/troleo, y habilita analítica longitudinal por estudiante a futuro si se quisiera.
- **En contra:** el valor central del chatbot en vivo es que el estudiante se anime a preguntar "lo obvio" sin miedo a quedar expuesto frente al curso o al profesor. Si sabe que la pregunta queda asociada a su nombre, es esperable que pregunte menos o filtre lo que pregunta — justo lo opuesto de lo que se busca.

**Propuesta (confirmada por el equipo por ahora, revisable más adelante):** ligar la conversación a la cuenta a nivel de sistema (para poder identificar en un caso excepcional de abuso), pero que **lo que ve el profesor sea siempre agregado y anónimo** — "40% de las preguntas en los últimos 10 min fueron sobre X concepto", nunca "Juan preguntó X". La identidad real solo se destapa en un proceso excepcional y auditable, gestionado por el rol de "Administrador de Infraestructura y Seguridad de Datos" (ya identificado en el mapa de actores), no por el profesor directamente. Esto conserva la señal de analítica sin generar el efecto "mejor no pregunto".

**Diseño de accesos por capas:**

- **Capa 1 — raw**: conversaciones completas, identificables, en una base de datos con acceso restringido y auditado. Solo el rol de administración de datos, nunca el profesor.
- **Capa 2 — agregada**: estadísticas anónimas ("40% de preguntas fueron sobre X"). Esto es lo único a lo que accede el profesor.
- **Principio de cero fricción**: el profesor no hace nada distinto para que la herramienta funcione en su clase. La analítica queda disponible si la quiere revisar; si nunca entra al dashboard, la clase funciona exactamente igual. Esto es clave para la adopción institucional — no depende de que el docente cambie su forma de dar clases ni le suma carga de trabajo.

---

## 3. Demostración del Prototipo y Funcionalidad *(21/70 puntos — el criterio más pesado)*

Dado el peso de este criterio, el prototipo para Antigravity debería priorizar, en este orden:

1. **Demo mínima pero end-to-end**: audio pre-grabado (de una clase real o de EOL) → transcripción en pantalla → resumen + conceptos clave generados al final. Esto por sí solo ya cubre gran parte de los puntos de "demostración clara y efectiva".
2. **Chatbot en vivo sobre esa transcripción**, con al menos 2-3 preguntas de ejemplo funcionando (una de definición, una de "resume los últimos X minutos", una que debiera ser rechazada por estar fuera de tema — esto demuestra visualmente el control de la IA).
3. **Si alcanza el tiempo**: la vista de "recurrencia" con dos clases de ejemplo (puede ser data simulada) mostrando cómo el resumen de la segunda usa contexto de la primera.

**Plan de datos para la demo (dos fases):**

- **Fase 1 (para esta entrega):** grabar unos minutos de una clase real con permiso explícito del docente (conecta con el punto de consentimiento de la sección 5), pasar ese audio ya grabado — no en vivo — al prototipo, y generar transcripción + resumen + chat sobre contenido real. Es la opción técnicamente más simple y da contenido genuino para el mini-test de usabilidad de la sección 4.
- **Fase 2 (roadmap, mencionar pero no construir ahora):** transcripción incrementando en tiempo real, mandando fragmentos de audio cada 10-30 segundos en vez de un archivo completo. Es bastante más complejo (latencia, manejo de un contexto que va creciendo) y no es necesario resolverlo para demostrar que el mecanismo central funciona.

### 3.1 Formato del prototipo y plan de presentación

**Formato:** app web simple (no móvil ni nada más complejo), construida en Antigravity — es el tipo de artefacto que la herramienta construye y prueba mejor, y se puede correr localmente o dejar un link desplegado.

**Pantallas mínimas:**
1. Vista "clase en curso": transcripción + chat lateral.
2. Vista "post-clase": resumen + conceptos + buscador.
3. Vista "recurrencia" (puede ser con datos mock si no da el tiempo).
4. Dashboard del profesor con stats agregadas (mock también sirve, es lo menos crítico de mostrar en vivo).

**Qué mostrar en vivo vs. precomputado el día de la presentación:**
- La transcripción **no** se genera en vivo frente al curso — depender de audio de sala + wifi + STT en tiempo real es riesgo innecesario. Se procesa el audio real antes, y en la presentación se reproduce el clip mientras el texto aparece sincronizado (efecto "máquina de escribir") — se ve como tiempo real sin el riesgo.
- El chat **sí se muestra genuinamente en vivo**: alguien del curso o el profesor escribe una pregunta real en el momento y la IA responde ahí mismo — es lo que convence de que no es un mockup. Aprovechar para mostrar también una pregunta fuera de tema siendo rechazada (demo + control de la IA en un solo momento).
- Screen recording de respaldo ya grabado, por si falla la API o el wifi de la sala ese día.

### 3.2 Datos y prompt para Antigravity

**Decisión de arquitectura:** el "avance de la transcripción" se construye como un módulo separado y reemplazable (una interfaz tipo `TranscriptSource`), no como lógica acoplada al resto de la app. Hoy usa una implementación simulada (revela texto ya existente progresivamente); en la Fase 2 se reemplaza por una implementación de streaming real sin tocar el chat, el resumen ni la UI.

**Alcance del contexto del chat — 2 niveles de respuesta** (simplificado: el disclaimer resuelve el problema de atribución, así que no hace falta distinguir qué tan "tangencial" es un tema dentro del curso):
1. **Dentro del curso** (esté o no en la transcripción de esta clase específica) → responde siempre. Si está en la transcripción, responde normal. Si no está, responde igual pero con un disclaimer explícito: *"esto no lo dijo el profesor en esta clase, es una explicación general — probablemente lo explique con más detalle más adelante"*.
2. **Fuera del curso** (otro ramo, o cualquier pregunta sin relación) → rechaza: *"esa pregunta no está relacionada con este curso"*.

**Decisión de alcance:** se amplía el "dentro del curso" a todo el syllabus del ramo (no solo Unidad 2) — el disclaimer ya protege el rol del profesor de "enseñar antes de tiempo", así que restringir por unidad ya no es necesario. El objetivo real (feedback de Celis) era estar alineado al *curso*, no a la unidad puntual.

**Glosario/contexto del curso completo (Macroeconomía IN4123)** usado como "conocimiento permitido":
- Unidad 1: cuentas nacionales, índices de precios e inflación, ciclo económico.
- Unidad 2: mercados financiero y monetario, modelo IS/LM, mercado laboral neoclásico, modelo AS/AD y curva de Phillips, expectativas, modelo Mundell-Fleming.
- Unidad 3: modelo de Solow, convergencia, consumo intertemporal, Q de Tobin.

**Fuera de alcance (rechazo):** cualquier pregunta de otro ramo, o sin relación con macroeconomía (ej. "¿cuál es la capital de Francia?").

**Preguntas de prueba:**
- Dentro del curso, en la transcripción: "¿Qué es la curva LM?"
- Dentro del curso, resumen: "Resume los últimos 2 minutos de la clase."
- Dentro del curso, no dicho en esta clase (debe llevar disclaimer): "¿Qué es el modelo de Solow?"
- Fuera del curso (debe rechazar): "¿Cuál es la capital de Francia?"

No es necesario resolver diarización de múltiples hablantes ni la app completa — el prototipo debe demostrar el *mecanismo* central (STT → IA acotada → output útil), no todas las funcionalidades del roadmap.

---

## 4. Análisis de Viabilidad y Aplicabilidad en el Ámbito Educativo

> Este criterio (11 pts) pide "resultados **o** planificación de evaluación de experiencia usuaria" — como no habrá piloto real corriendo antes de la presentación, lo que se evalúa es si existe un plan concreto de con quién, qué y cómo se mediría. Además, "viabilidad" no es solo UX del estudiante: incluye viabilidad institucional (los actores de "decisión" del mapa de actores son evidencia directa de que se pensó eso).
>
> **Importante — esto es distinto de la demo del prototipo (sección 3).** Un prototipo funcionando en Antigravity demuestra que el *mecanismo* funciona técnicamente; no es, por sí solo, evidencia de experiencia de usuario. Lo que sube más la nota acá, y es alcanzable en el tiempo disponible, es un **mini-test con compañeros**: mostrar el prototipo a 3-5 personas, pedirles que lo usen como si fueran estudiantes en la clase simulada, y recoger 2-3 reacciones estructuradas (¿la respuesta se sintió relevante?, ¿el resumen fue útil?, ¿se sentirían cómodos preguntando sabiendo que queda registrado?). Eso cuenta como **resultados**, no solo como plan, y pesa más en la pauta.

### 4.1 Mapa de actores (ya trabajado en clase — resumen)

- **Usuarios**: estudiantes en clase presencial, estudiantes asincrónicos, estudiantes con necesidades de accesibilidad.
- **Beneficiarios**: Dirección Académica (indicador de inclusión/retención), equipos docentes (menos carga de dudas fuera de horario), Innovación Educativa (casos de éxito).
- **Decisores**: Dirección Ejecutiva del Programa, Finanzas/Operaciones, Dirección de TI.
- **Validadores**: Coordinación Pedagógica, UX, Desarrollo Técnico.
- **Dueños de datos**: profesores (audio), Coordinación de Docencia (inscritos/módulos), Administrador de Infraestructura (almacenamiento y cumplimiento).

### 4.2 Plan de evaluación de experiencia de usuario (falta hoy — propuesta)

1. **Piloto acotado**: 1-2 clases reales tipo cátedra, con consentimiento explícito del docente, grabando solo 10-15 minutos para la prueba inicial.
2. **Métricas a medir**:
   - Precisión de la transcripción (WER — word error rate) sobre esa grabación.
   - Relevancia percibida de las respuestas del chatbot (encuesta corta post-clase a un grupo pequeño de estudiantes: ¿la respuesta fue útil?, ¿fue precisa?, ¿respetó el tema de la clase?).
   - Utilidad percibida del resumen post-clase (comparación cualitativa contra los propios apuntes del estudiante).
3. **Instrumento**: encuesta corta (5 preguntas, escala Likert + 1 pregunta abierta) aplicada a estudiantes voluntarios del curso piloto.
4. **Validación con Coordinación Pedagógica**: revisión de que los conceptos y resúmenes generados mantienen el rigor académico (no simplifican ni distorsionan contenido).

---

## 5. Implicancias Éticas y Responsabilidad Social

Este proyecto maneja datos sensibles en dos direcciones — el docente y el estudiante — y eso debe abordarse explícitamente:

- **Consentimiento del docente**: grabar y almacenar la voz/contenido de un profesor, y además compararlo año a año, requiere consentimiento informado explícito y la posibilidad de excluir su clase del histórico comparativo.
- **Privacidad del estudiante**: las preguntas que un estudiante hace al chatbot en clase pueden revelar qué no entendió, o inseguridades — deben tratarse como dato sensible, no asociarse públicamente a la identidad del estudiante, y no usarse para evaluación docente sin anonimizar.
- **Asimetría entre audio y chats de texto (el mayor riesgo de privacidad del proyecto)**: el audio de la clase es, en la práctica, relativamente anónimo respecto a los estudiantes — capta sobre todo al profesor. Los chats de texto con el asistente son mucho más sensibles porque, si se ligan a una cuenta personal (ver 2.5), identifican exactamente quién preguntó qué y cuándo. Esto requiere tratamiento diferenciado: pseudonimización de cara al profesor, acceso a la identidad real restringido y auditable, y una política clara de retención (¿por cuánto tiempo se guardan los chats identificables?).
- **Precisión y responsabilidad del contenido generado**: un resumen o explicación incorrecta generada por la IA, si se confunde con lo dicho por el profesor, puede inducir a error en una evaluación — de ahí la importancia (ya incorporada en el diseño, sección 2.2) de separar visualmente siempre "lo que dijo el profesor" de "lo que explica la IA".
- **Gobernanza de la base histórica**: ¿quién es dueño del dataset acumulado de una cátedra a través de los años? ¿el docente, la universidad, el ramo? Debe definirse antes de escalar el proyecto más allá del piloto.
- **Riesgo de sustitución de la habilidad de síntesis**: si el estudiante delega demasiado en el resumen automático, puede reducir su propio ejercicio de comprensión activa en clase — vale la pena mencionar esto como riesgo reconocido, no ignorarlo.

---

## 6. Conclusión y Futuras Mejoras

### 6.1 Síntesis

El proyecto propone aumentar (no reemplazar) la clase presencial expositiva con una capa de IA que: (a) mejora la accesibilidad y comprensión en tiempo real mediante un asistente acotado al contenido de la sesión, y (b) construye progresivamente una base de conocimiento histórica y comparable por ramo, algo que no ofrece ninguna de las herramientas de transcripción educativa existentes revisadas.

### 6.2 Futuros pasos

- Expandir de clases puramente expositivas a formatos con más interacción (requiere diarización de hablantes).
- Integración con sistemas institucionales (EOL, plataforma de inscripción) para automatizar la asociación clase→ramo→módulo.
- Panel para Coordinación Pedagógica con vista comparativa entre docentes/años.
- Explorar traducción en tiempo real para estudiantes internacionales, siguiendo el mismo patrón que otras herramientas del mercado.

---

## 7. Notas para la presentación (habilidades de exposición)

- Usar la comparación con Otter/Sonix/eeclass como fortaleza, no como debilidad: "existen herramientas de transcripción, pero ninguna construye memoria histórica por ramo ni un asistente acotado en vivo para el aula física".
- Tener lista una demo grabada (screen recording) como respaldo en caso de que la demo en vivo falle.
- Repartir explícitamente los tiempos entre los 2 miembros del equipo antes del día de la presentación, dado que "manejo del tiempo y ritmo" es un criterio evaluado aparte.

---

## 8. Pendientes explícitos

Cosas que quedan abiertas a propósito — mejor dejarlas visibles que resolverlas mal apurados:

- **Política de retención de los chats identificables** (sección 5): ¿por cuánto tiempo se guarda la data cruda antes de eliminarse o anonimizarse por completo? Sin definir aún.
- **Comparación con soluciones existentes** (sección 2.3): delegada a un integrante del equipo — falta que efectivamente se escriba, aunque sea breve, porque sostiene el argumento de innovación de 2.2.
- **Presentación del equipo** (1.5 pts de la pauta, sección 1): quién es quién y sus roles — no está escrito en ningún lado todavía.
- Cualquier contenido de "Inventario de datos" y "Matriz de Validación" mencionados como actividades de la Clase 6: no se incluyó en este documento porque no había contenido disponible para revisar — si es un entregable aparte, conviene confirmarlo directamente con el curso, no depende de este refinamiento del proyecto.
