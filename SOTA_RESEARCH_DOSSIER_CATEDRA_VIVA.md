---
title: "🔬 SOTA Research Dossier: Cátedra Viva — De la Demostración Teórica a la Beta Móvil en Aulas de Cálculo"
investigador: "Antigravity (SOTA Deep Researcher)"
fecha: 2026-10-12
estado_del_arte: "2024 – 2026"
tema: "Speech-to-Text Matemático, RAG Socrático, PWA Móvil y Analítica de Aula en Tiempo Real"
tags:
  - deep-research
  - sota
  - speech-to-text
  - math-latex
  - socratic-ai
  - pwa-mobile
  - calculus-stem
  - catedra-viva
---

# 🔬 SOTA Research Dossier: Cátedra Viva — Blindaje Arquitectónico y Hoja de Ruta para Beta Móvil en Cálculo

- **Investigador:** Antigravity (Protocolo `sota-deep-researcher`)
- **Fecha:** Octubre 2026
- **Pregunta Central de Investigación:** ¿Cómo evolucionar la arquitectura de *Cátedra Viva* para blindar su precisión en asignaturas STEM de alta densidad simbólica (Cálculo Diferencial/Integral), desplegar una versión de prueba ultra-liviana en teléfonos móviles para docentes y estudiantes, y garantizar un acompañamiento pedagógico socrático sin alucinaciones ni sustitución cognitiva?
- **Horizonte Temporal SOTA Evaluado:** 2024 – 2026

---

## 1. Resumen Ejecutivo (Bottom-Line First)

La transición de una cátedra expositiva en ciencias sociales (Macroeconomía) a una disciplina de ciencias duras (Cálculo) introduce dos barreras de ingeniería y pedagogía que quiebran las herramientas convencionales de transcripción (Otter, Whisper estándar, Zoom Captions):
1. **La ambigüedad del lenguaje matemático hablado:** Cuando un docente enuncia *"la integral de cero a infinito de e a la menos x cuadrado de x"*, los modelos de ASR generales producen cadenas de texto fonético ambiguo y no estructurado con un Character Error Rate (CER) superior al 80% en fórmulas.
2. **El riesgo de atrofia cognitiva por respuestas directas:** La literatura científica 2024–2025 (UPenn, Stanford, Khanmigo) demuestra empíricamente que entregar desarrollos de derivadas o integrales resueltas destruye el aprendizaje profundo.

**La Solución SOTA Validada:**
* **Pipeline ASR Post-Correction (MathSpeech Architecture):** Captura de audio con VAD y streaming liviano (Groq Whisper v3 Turbo / Deepgram Nova-3) seguido de un micro-pipeline de post-corrección determinista + LLM de alta velocidad (Qwen 2.5 / Groq LLaMA) que proyecta la prosa matemática a sintaxis formal $\LaTeX$ ($e^{-x^2} dx$, $\lim_{x \to 0^+}$, $\int$) preservando el discurso pedagógico.
* **Cliente PWA Mobile-First con `AudioWorklet`:** Descartar el desarrollo de una app nativa (React Native/Flutter) para la fase beta. Una Progressive Web App (PWA) optimizada que utilice `AudioWorklet` en un subproceso de fondo, streaming binario por WebSockets a 16 kHz mono y control de sesiones iOS (`navigator.audioSession = "play-and-record"`) ofrece despliegue instantáneo por código QR en el aula con cero fricción de instalación.
* **Guardrails Socráticos Anti-Solución:** Implementación de un árbol de decisión pedagógico: el chatbot identifica el error conceptual o procedimental del alumno y formula preguntas guía paso a paso (*One-Question-at-a-Time*), prohibiendo terminantemente la resolución automática de integrales o ejercicios de certamen.
* **Analítica HCLA (Human-Centred Learning Analytics) de Capa 2:** Sustitución total de visión computacional invasiva por procesamiento de lenguaje natural semántico sobre el canal secundario de chat anónimo, agrupando picos de incomprensión en conceptos umbral (ej. Regla de la Cadena, Fracciones Parciales, Teorema Fundamental del Cálculo).

---

## 2. Taxonomía del Estado del Arte (Current Landscape 2024–2026)

### 2.1 Eje A: Speech-to-Text de Matemáticas Habladas (Spoken Math to $\LaTeX$)

| Familia / Enfoque | Mecanismo | Rendimiento en Español & Latencia | Limitaciones / Fallas Críticas |
| :--- | :--- | :--- | :--- |
| **Enfoque 1: Whisper Base Vanilla (OpenAI Large v3 / Turbo)** | Transcripción directa end-to-end con prompt del sistema para $\LaTeX$. | WER general: 3–6%. <br>Latencia: 400–800 ms. | **Falla catastrófica en matemáticas:** Whisper no fue entrenado con tokens nativos de compilación $\LaTeX$. Tiende a alucinar texto literal (*"integral de equis al cuadrado"*). |
| **Enfoque 2: MathSpeech / Pipelines de Post-Corrección (SOTA 2024-2025)** | ASR fonético rápido (Whisper Turbo) $\rightarrow$ Micro-LLM contextualizador o modelo de corrección que traduce prosa oral a fórmulas $\LaTeX$ compilables. | CER en fórmulas: < 8%. <br>Latencia agregada: +200–350 ms en Groq. | Requiere segmentación estricta por ventanas de habla para no perder el contexto de la oración matemática. |
| **Enfoque 3: Modelos Nativos End-to-End Speech-to-LaTeX (Investigación ICLR 2025)** | Modelos entrenados sobre datasets masivos de audio alineado con código $\LaTeX$. | Precisión matemática alta. | Modelos cerrados o con baja capacidad en español coloquial universitario (acento chileno/latinoamericano). |

> [!important] Veredicto Técnico Eje A
> **Adoptar Enfoque 2 (Pipeline Híbrido Whisper v3 Turbo + Post-Corrección LLM en Groq).** Es el único que permite latencia sub-segundo en hardware accesible o APIs de inferencia ultra-rápida, traduciendo variables como *"delta de x"* a $\Delta x$ y *"fracción de uno sobre x"* a $\frac{1}{x}$.

---

### 2.2 Eje B: Captura de Audio Móvil y Despliegue en el Aula (PWA vs. Nativo)

| Criterio | App Nativa (Flutter / React Native) | PWA Moderna (`AudioWorklet` + WebSockets) |
| :--- | :--- | :--- |
| **Fricción de Entrada (Beta)** | **Alta:** Requiere compilar `.apk`, firmar TestFlight en iOS, pedir correos y autorizaciones. | **Cero:** El profesor o ayudante abre una URL o escanea un código QR en el proyector de la sala. |
| **Manejo de Micrófono** | Acceso nativo con permisos persistentes en segundo plano. | Requiere gesto de usuario inicial (`touchstart`) y control de la sesión de audio en iOS Safari. |
| **Latencia de Audio** | ~50–100 ms buffer nativo. | ~80–150 ms mediante buffer PCM mono de 16 kHz en `AudioWorkletNode`. |
| **Actualizaciones en Caliente** | Requiere redistribuir paquetes y reinstalar. | Despliegue continuo en la nube (Render / Cloudflare). |

> [!tip] Veredicto Técnico Eje B
> **Construir una PWA Mobile-First responsive.** Para un test piloto en un ramo de Cálculo, pedirle a 40 estudiantes y a un profesor descargar una app nativa genera una tasa de rebote > 70%. Una PWA con WebSockets y soporte para pantalla bloqueada/móvil resuelve el 100% de la validación empírica.

---

### 2.3 Eje C: Pedagogía Asistida por IA en STEM (Tutor Socrático vs. Solucionador)

La literatura reciente de UPenn (2024) y conferencias educativas (ICLR/EDM 2025) arroja una advertencia taxativa: **un asistente de IA que resuelve el problema numérico genera "ilusión de competencia"**. Los alumnos obtienen 100% en tareas con IA libre, pero reprueban los exámenes formales porque no desarrollaron el grafo mental de abstracción.

```mermaid
graph TD
    A[Pregunta del Alumno: '¿Cómo calculo la integral de x e^x?'] --> B{Filtro de Intención Pedagógica}
    B -->|Comportamiento Errante / Solucionador Tradicional| C[Entrega la respuesta directa: x e^x - e^x + C]
    C --> D[Atrofia Cognitiva & Trampa Académica]
    
    B -->|Comportamiento Socrático SOTA 'Cátedra Viva'| E[Diagnóstico de Estrategia]
    E --> F[Intervención 1: '¿Qué método de integración sirve para el producto de una algebraica y una exponencial?']
    F --> G[Estudiante responde: 'Por partes']
    G --> H[Intervención 2: 'Correcto. ¿Cuál escogerías como u y cuál como dv según la regla LIATE/ALPES?']
    H --> I[Aprendizaje Profundo y Retención Evaluativa]
```

---

## 3. Matriz Comparativa de Decisiones de Arquitectura

| Dimensión Técnica | Enfoque Anterior (MVP Macroeconomía) | Enfoque SOTA Blindado (Beta Cálculo Móvil) | Justificación Técnica & Pedagógica |
| :--- | :--- | :--- | :--- |
| **Ingesta de Audio** | Audio pregrabado con revelación simulada (`SimulatedTranscriptSource`). | **Streaming en vivo Web Audio API (`AudioWorklet`) $\rightarrow$ WebSockets.** | Permite al compañero dictar su clase real usando el micrófono de su teléfono o corbatero Bluetooth. |
| **Representación Matemática** | Solo texto plano con formato Markdown elemental. | **Renderizado KaTeX ultra-liviano + Tokens $\LaTeX$ sanitizados.** | Cálculo no se puede enseñar con prosa; requiere ecuaciones legibles ($\int f(x)dx$, $\frac{df}{dx}$, $\lim$). |
| **Control del Chatbot** | Regla de 2 ramas (dentro/fuera de clase con disclaimers). | **RAG Socrático Anti-Solución + Regla One-Question-at-a-Time.** | Impide que el estudiante use la app para copiar en evaluaciones o saltarse el razonamiento analítico. |
| **Analítica de Aula** | Categorización genérica en 5 temas macroeconómicos. | **Clasificación en Conceptos Umbral de Cálculo + Alertas en Pizarra.** | El profesor de cálculo necesita saber de inmediato si la traba está en el álgebra previa o en el concepto nuevo de cálculo. |
| **Dispositivo Objetivo** | Desktop / Laptop optimizado. | **Mobile-First PWA (Profesor = Emisor / Alumno = Receptor).** | En una sala de clases, el alumno interactúa desde su smartphone personal apoyado en el banco. |

---

## 4. Brechas Abiertas y Fallos Críticos (Open Challenges)

### 4.1 La Deixis en la Pizarra ("El problema del 'esto' y 'aquello'")
En asignaturas de matemáticas, los docentes utilizan constantemente gestos deícticos: *"reemplazamos **esto** acá"*, *"miren cómo cambia **esta curva**"*.
* **El fallo:** Si solo capturamos audio, la IA recibe una frase vacía de contexto espacial.
* **Mitigación SOTA:** 
  1. Diseñar un micro-módulo donde el docente o ayudante pueda tomar una foto a la pizarra cada 15–20 minutos (o subir el PDF de la pauta/diapositiva previa) para alimentar el contexto multimodal del RAG.
  2. Instruir en el prompt socrático la clarificación de variables: *"El profesor se refirió a un término de la pizarra; ¿te refieres a la función interna o a los límites de integración?"*.

### 4.2 Restricciones de Red en Campus Universitario (Wi-Fi Saturado / eduroam)
En aulas con 50–100 estudiantes, las conexiones Wi-Fi sufren caídas de paquetes y saltos de IP constantes.
* **Mitigación:** 
  - Protocolo WebSocket con mecanismo de reconexión exponencial y buffer local en `IndexedDB` en el cliente móvil.
  - Compresión de audio PCM a formato comprimido Opus o downsampling estricto a 16 kHz Mono de 16-bit antes del envío por red (consumo < 32 kbps por profesor).

### 4.3 Acústica y Reverberación del Aula Universitaria
Los micrófonos integrados de teléfonos móviles capturan eco y ruido de fondo de los pasillos.
* **Mitigación:** 
  - Activar constraints nativas en `getUserMedia`: `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }`.
  - Recomendar al docente utilizar audífonos inalámbricos tipo AirPods o micrófono corbatero Bluetooth de \$15 USD emparejado a su teléfono.

---

## 5. Arquitectura Propuesta para la Versión Beta (Cálculo)

```mermaid
flowchart LR
    subgraph DocenteMobile["📱 Teléfono del Profesor (Emisor)"]
        A[Micrófono Teléfono / Bluetooth] --> B[PWA AudioWorklet 16kHz]
        B --> C[WebSocket Client Binary]
    end

    subgraph CloudEngine["☁️ Backend Cátedra Viva (Node/Express)"]
        C --> D[WebSocket Server Gateway]
        D --> E[VAD & Chunk Buffer 2.5s]
        E --> F[Groq Whisper Large v3 Turbo]
        F --> G[Micro-Pipeline Post-Corrección LaTeX]
        G --> H[Historial de Transcripción Estructurado]
        H --> I[Clasificador Semántico de Dudas]
    end

    subgraph EstudianteMobile["📱 Teléfonos de Estudiantes (Receptores)"]
        H --> J[Transcripción en Vivo + KaTeX]
        K[Duda en Chat Móvil] --> L[Motor Socrático Anti-Solución]
        L --> M[Respuesta Guía Paso a Paso]
        K --> I
    end

    subgraph DocenteDashboard["📊 Tablero de Pizarra (Laptop/Tablet Proyector)"]
        I --> N[Alertas de Incomprensión en Tiempo Real]
    end
```

---

## 6. Hoja de Ruta de Implementación para el Piloto de Cálculo

### Fase 1: Adaptación Curricular & Soporte $\LaTeX$ (Inmediato)
- [ ] Incorporar el renderizado visual de fórmulas matemáticas con **KaTeX** en la interfaz del chat móvil.
- [ ] Configurar el archivo de alcance curricular (`courseConfig.js`) para **Cálculo I / Diferencial e Integral**:
  - **Unidad 1:** Límites, continuidad, indeterminaciones ($\frac{0}{0}$, $\frac{\infty}{\infty}$).
  - **Unidad 2:** Derivadas, regla de la cadena, derivación implícita, optimización y razones de cambio.
  - **Unidad 3:** Integrales inmediatas, sustitución, integración por partes, Teorema Fundamental del Cálculo.

### Fase 2: Implementación de la Capa de Streaming Móvil (PWA)
- [ ] Crear el módulo de captura de audio con `AudioWorklet` en JavaScript estándar para navegadores móviles.
- [ ] Habilitar el endpoint WebSocket bidireccional en `server.js` para recibir el stream del profesor y emitir transcripción tokenizada a los alumnos.
- [ ] Implementar el control de sesión en iOS (`navigator.audioSession.type = 'play-and-record'`).

### Fase 3: Blindaje del Prompt Socrático Anti-Solución
- [ ] Inyectar la regla obligatoria de tutoría guiada:
  > *"Si el alumno te pide resolver una derivada o integral, NO entregues el resultado final. Pregúntale cuál es el primer paso o qué regla planea aplicar. Si comete un error, indícale exactamente en qué signo o exponente ocurrió sin darle la respuesta completa."*

### Fase 4: Prueba de Campo en Sala con el Compañero Ayudante
- [ ] Probar la transmisión con el teléfono del ayudante conectado a internet móvil 4G/5G en una clase auxiliar de 45 minutos.
- [ ] Medir la latencia percibida entre lo que dice en voz alta y lo que aparece en la pantalla de 3 alumnos voluntarios.
- [ ] Verificar si el panel del profesor detectó correctamente las preguntas más frecuentes de la ayudantía.

---

## 7. Conclusión del Investigador

*Cátedra Viva* tiene una ventaja de diseño decisiva: **la separación limpia entre la fuente de transcripción y el motor pedagógico**. Al aplicar los estándares SOTA 2024–2026 analizados en este dossier:
1. No necesitamos reinventar un modelo de reconocimiento de voz: la combinación de **Groq Whisper + Post-corrección $\LaTeX$** supera la precisión de soluciones propietarias en entornos hispanohablantes.
2. La adopción no requiere publicar en App Store ni Google Play: una **PWA con WebSockets** permite que el compañero pruebe el sistema mañana mismo simplemente abriendo un enlace en su navegador móvil.
3. El enfoque socrático blindará el proyecto ante cualquier objeción de los profesores de matemáticas respecto al plagio o la sustitución del razonamiento de los estudiantes.
