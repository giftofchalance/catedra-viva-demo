# Cátedra Viva — Asistente de Aula Aumentada con IA
**Prototipo de Demostración para Cátedras Universitarias**  
*Caso de estudio: Macroeconomía (IN4123) — Modelo IS-LM*

---

## 🏛️ Descripción del Proyecto

**Cátedra Viva** es un prototipo web de asistencia pedagógica en tiempo real para clases expositivas universitarias. Transforma el flujo de una cátedra magistral en un entorno de aprendizaje aumentado mediante:
1. **Transcripción continua en vivo** con estricta diferenciación visual entre lo dicho por el docente y el contenido generado por la IA.
2. **Tutor conversacional en tiempo real acotado** que asiste a los estudiantes en dudas conceptuales y resúmenes de los últimos minutos.
3. **Control curricular estricto** que distingue lo expuesto en clase, lo perteneciente al programa general del curso y lo ajeno a la materia.
4. **Memoria pedagógica acumulativa** que preserva el contexto entre sesiones consecutivas (recurrencia histórica).
5. **Dashboard anónimo de comprensión para el profesor** con métricas agregadas que no vulneran la privacidad de los alumnos.

---

## 🏗️ Arquitectura y Separación por Interfaces

El prototipo cumple rigurosamente con los dos requisitos de separación arquitectónica solicitados:

### 1. Desacoplamiento del Avance de la Transcripción (`TranscriptSource`)
- **Ubicación:** `public/modules/transcriptSource.js`
- **Contrato de Interfaz:** Define la clase base abstracta `TranscriptSource` con métodos esenciales:
  - `getRevealedText()`: Retorna el texto y timestamps revelados hasta el segundo actual.
  - `getRevealedEntries()`: Retorna la lista estructurada de intervenciones hasta el momento.
  - `getCurrentTimestamp()`: Retorna el tiempo actual de la sesión (ej. `00:01:28`).
  - `isComplete()`: Indica si la clase ha finalizado.
  - `subscribe(listener)`: Notifica cambios de estado y nuevas líneas.
- **Implementación Simulada:** `SimulatedTranscriptSource` revela progresivamente el texto pregrabado (cada 2.5s o sincronizado opcionalmente con el archivo de audio `.mp3`). Permite pausar, avanzar línea por línea, cambiar velocidad (1x, 2x, 5x) o **"Revelar Todo"** para pruebas inmediatas.
- **Independencia:** El chat, el backend y la UI no saben si la clase viene de una simulación o de un stream de Speech-to-Text en vivo.

### 2. Desacoplamiento del Alcance Curricular (`COURSE_CONFIG`)
- **Ubicación:** `config/courseConfig.js`
- **Contrato:** Configuración aislada de la lógica del chat. Contiene las unidades del programa de Macroeconomía IN4123:
  - **Unidad 1:** Cuentas nacionales, índices de precios e inflación, ciclo económico.
  - **Unidad 2:** Mercados financiero y monetario, modelo IS/LM, mercado laboral neoclásico, modelo AS/AD y curva de Phillips, expectativas, modelo Mundell-Fleming.
  - **Unidad 3:** Modelo de Solow, convergencia, consumo intertemporal, Q de Tobin.
- Permite ampliar o acotar el alcance temático simplemente editando este archivo o utilizando el selector interactivo en la barra superior de la app, sin tocar el motor de chat.

---

## 💬 Lógica del Chat en Vivo (Las Dos Ramas)

El asistente procesa cada consulta según las reglas pedagógicas establecidas:

1. **Rama A (Tema dentro del curso):**
   - **Si está en la transcripción revelada:** Responde normalmente con base en lo explicado por el profesor en la clase (ej. *¿Qué es la curva LM?*).
   - **Si NO está en la transcripción revelada:** Responde la duda conceptualmente, pero antepone de forma destacada el disclaimer explícito:
     > ⚠️ **Aviso:** *Esto no lo dijo el profesor en esta clase, es una explicación general — probablemente lo explique con más detalle más adelante.*
     (Ejemplo: *¿Qué es el modelo de Solow?*, tema de la Unidad 3 que no se menciona en esta clase sobre IS-LM).

2. **Rama B (Tema fuera del curso):**
   - Si la pregunta no pertenece al ámbito de Macroeconomía (ej. *¿Cuál es la capital de Francia?* o materias de otros ramos), el asistente rechaza de forma estricta:
     > ⛔ **Esa pregunta no está relacionada con este curso.**

3. **Solicitudes de Resumen:**
   - Consultas como *"Resume los últimos 2 minutos de la clase"* sintetizan exclusivamente el fragmento revelado por la transcripción hasta ese instante.

---

## 🖥️ Pantallas Construidas

1. **🔴 Clase en Curso:**
   - Panel izquierdo con transcripción progresiva, badges de docente y timestamps, barra de progreso y controles de reproducción.
   - Panel derecho con chat de estudiante, chips de acceso rápido a las 4 preguntas de prueba y formato visual enriquecido (alertas para disclaimers y rechazos).
2. **📋 Post-Clase:**
   - Resumen ejecutivo generado con LLM a partir de la transcripción completa.
   - Glosario de conceptos clave extraídos con sus timestamps correspondientes.
   - Preguntas de autoevaluación para estudio activo.
   - Buscador semántico libre sobre la clase completa.
   - Archivo indexado y filtrable de todas las líneas de la cátedra.
3. **🔄 Recurrencia Histórica:**
   - Línea de tiempo interactiva entre la Clase 11 (20 de Septiembre) y la Clase 12 (27 de Septiembre).
   - Muestra el resumen incremental donde la IA menciona explícitamente el contexto de la sesión previa para dar continuidad al aprendizaje.
4. **📊 Dashboard del Profesor:**
   - Alerta didáctica: *"42% de las preguntas fueron sobre la Curva LM en los últimos 10 minutos"*.
   - Gráfico de barras de distribución temática de dudas.
   - Histograma de densidad de preguntas por minuto a lo largo de la cátedra.
   - Demostración de la **Capa 2 de Privacidad**: datos 100% anonimizados y principio de cero fricción para el docente.

---

## 🚀 Puesta en Marcha

### Prerrequisitos
- Node.js (v18+)
- Variable de entorno `GEMINI_API_KEY` (configurada en el sistema o en archivo `.env`).

### Instalación y Ejecución
```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor
npm start
```

Abrir en el navegador:
👉 **`http://localhost:3000`**

---

## 🌐 Despliegue en Render (Web Service Gratuito)

Este proyecto está configurado para ejecutarse como un **único servicio web** (sirviendo tanto la API REST como la aplicación web estática frontend desde Express).

- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Node Engine:** `>=18.0.0`
- **Variables de Entorno en Render:**
  - `GEMINI_API_KEY`: Tu API Key obtenida en Google AI Studio.
  - `PORT`: Asignado automáticamente por Render (no requiere configuración manual).

---

## ✅ Verificación de Preguntas de Prueba

| Pregunta de Prueba | Comportamiento Esperado | Resultado Verificado |
|---|---|---|
| **"¿Qué es la curva LM?"** | Responde directo desde la transcripción explicada por el profesor. | ✅ Aprobado |
| **"Resume los últimos 2 minutos de la clase."** | Resume dinámicamente el fragmento revelado hasta ese minuto. | ✅ Aprobado |
| **"¿Qué es el modelo de Solow?"** | Responde explicando el modelo e incluye el disclaimer obligatorio de no haber sido dicho en clase. | ✅ Aprobado |
| **"¿Cuál es la capital de Francia?"** | Rechaza responder por no estar relacionada con el curso. | ✅ Aprobado |
