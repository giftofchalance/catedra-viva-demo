/**
 * CLI Test Harness: Simulación Interactiva Dual de Aula (Audio Stream + Chat Pedagógico a Distintos Delta t)
 * 
 * Uso:
 *   node scripts/simulate_interactive.js
 *   node scripts/simulate_interactive.js --course macro
 *   node scripts/simulate_interactive.js --course calculo --delay 1500
 */

import 'dotenv/config';

const args = process.argv.slice(2);
let course = 'calculo';
let delayMs = 1200;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--course' && args[i + 1]) {
    course = args[i + 1].toLowerCase();
    i++;
  } else if (args[i] === '--delay' && args[i + 1]) {
    delayMs = parseInt(args[i + 1], 10);
    i++;
  }
}

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function divider(title = '') {
  console.log('\n' + '='.repeat(70));
  if (title) console.log(`  ${title}`);
  console.log('='.repeat(70));
}

async function runInteractiveSimulation() {
  divider(`🧪 INICIANDO SIMULACIÓN DUAL: ${course.toUpperCase()}`);
  console.log(`📡 Servidor destino: ${BASE_URL}`);
  console.log(`⏱️ Intervalo entre eventos: ${delayMs} ms`);

  // 1. Reiniciar estado en el servidor
  console.log('\n[1/5] 🔄 Reiniciando estado del aula en vivo (/api/live-stream/reset)...');
  const resetRes = await fetch(`${BASE_URL}/api/live-stream/reset`, { method: 'POST' });
  const resetData = await resetRes.json();
  console.log('   ✓ Estado reiniciado:', resetData.message || 'OK');

  await wait(delayMs);

  // 2. Chunks de audio a transmitir secuencialmente
  const chunksToStream = course === 'calculo' ? [
    { start: 0, duration: 5, label: 'Apertura: Regla del producto para f(x) * g(x)' },
    { start: 5, duration: 5, label: 'Fórmula: f prima por g más f por g prima' },
    { start: 10, duration: 5, label: 'Ejemplo propuesto: derivada de x^2 * sin(x)' },
    { start: 15, duration: 5, label: 'Desarrollo del ejemplo por el docente' }
  ] : [
    { start: 5, duration: 5, label: 'Apertura: Introducción al Modelo IS-LM' },
    { start: 20, duration: 5, label: 'Equilibrio en el mercado de bienes' },
    { start: 40, duration: 5, label: 'Pendiente negativa de la curva IS' },
    { start: 60, duration: 5, label: 'Efecto de la tasa de interés sobre la inversión' }
  ];

  divider(`🎙️ DISPOSITIVO 1: STREAMING DE AUDIO (MICRÓFONO DOCENTE)`);

  for (let i = 0; i < chunksToStream.length; i++) {
    const chunk = chunksToStream[i];
    console.log(`\n▶ [${chunk.start}s - ${chunk.start + chunk.duration}s] Transmitiendo: "${chunk.label}"...`);

    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/simulator/step-chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course,
        startSecond: chunk.start,
        durationSeconds: chunk.duration
      })
    });

    const elapsed = Math.round(performance.now() - t0);

    if (!res.ok) {
      const err = await res.json();
      console.error(`   ❌ Error en chunk:`, err);
      continue;
    }

    const data = await res.json();
    console.log(`   ⚡ Groq Whisper [${data.timestamp}]: ${elapsed} ms`);
    console.log(`   📝 Transcripción: "${data.text}"`);
    console.log(`   📊 Líneas acumuladas en memoria: ${data.totalEntries}`);

    await wait(delayMs);
  }

  // 3. Verificar lo que ve el estudiante en su dispositivo
  divider(`📱 DISPOSITIVO 2: ESTUDIANTE EN EL AULA (CONSULTAS A DISTINTOS Δt)`);

  const entriesRes = await fetch(`${BASE_URL}/api/live-stream/entries`);
  const entriesData = await entriesRes.json();
  console.log(`📚 Contexto acumulado de la clase (${entriesData.totalEntries} intervenciones):`);
  entriesData.entries.forEach(e => {
    console.log(`   • [${e.timestamp}] ${e.speaker}: ${e.text}`);
  });

  // 4. Preguntas de prueba pedagógica a distintos Delta t
  const testQuestions = course === 'calculo' ? [
    {
      type: 'Definición / Concepto en Clase',
      deltaT: '00:10',
      question: '¿Cuál es la regla del producto para derivar dos funciones según lo que explicó el profesor?'
    },
    {
      type: 'Andamiaje Nivel 1 (Pista / Estrategia)',
      deltaT: '00:15',
      question: 'Tengo la función f(x) = x^2 * sin(x), ¿cuál es el primer paso para derivarla?'
    },
    {
      type: 'Andamiaje Nivel 5 (Resolución Completa con Cierre Metacognitivo)',
      deltaT: '00:20',
      question: 'Ya lo intenté y me confundo con el signo de la derivada de sin(x). Por favor muéstrame el desarrollo completo paso a paso.'
    },
    {
      type: 'Filtro Fuera de Clase (Disclaimer Pedagógico)',
      deltaT: '00:25',
      question: '¿Qué es la regla de L\'Hôpital y cuándo se aplica?'
    },
    {
      type: 'Filtro Off-Topic (Guardrail Estricto)',
      deltaT: '00:30',
      question: '¿Cuál es la capital de Francia y cuántos habitantes tiene?'
    }
  ] : [
    {
      type: 'Definición / Concepto en Clase',
      deltaT: '00:20',
      question: '¿Qué representa la curva IS según lo que dijo el docente?'
    },
    {
      type: 'Andamiaje Nivel 1 (Pista Cuantitativa)',
      deltaT: '00:40',
      question: '¿Cómo calculo el multiplicador keynesiano si c = 0.8?'
    },
    {
      type: 'Andamiaje Nivel 5 (Resolución Completa)',
      deltaT: '01:00',
      question: 'No entiendo cómo despejar el ingreso de equilibrio Y = C + I + G. Muéstrame el desarrollo algebraico completo paso a paso.'
    },
    {
      type: 'Filtro Fuera de Clase (Disclaimer Pedagógico)',
      deltaT: '01:15',
      question: '¿Qué plantea el modelo de Solow sobre la acumulación de capital?'
    },
    {
      type: 'Filtro Off-Topic (Guardrail Estricto)',
      deltaT: '01:30',
      question: '¿Quién ganó el mundial de fútbol de 2022?'
    }
  ];

  for (let idx = 0; idx < testQuestions.length; idx++) {
    const tq = testQuestions[idx];
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`❓ [Prueba ${idx + 1}/${testQuestions.length}] ${tq.type} (Δt = ${tq.deltaT})`);
    console.log(`   Estudiante pregunta: "${tq.question}"`);

    const tStart = performance.now();
    const chatRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: tq.question,
        currentTimeFormatted: tq.deltaT
      })
    });

    const chatElapsed = Math.round(performance.now() - tStart);

    if (!chatRes.ok) {
      const err = await chatRes.json();
      console.error(`   ❌ Error en chat:`, err);
      continue;
    }

    const chatData = await chatRes.json();
    console.log(`   ⚡ Latencia LLM: ${chatElapsed} ms`);

    // Detectar y etiquetar el tipo de respuesta
    const ans = chatData.answer || '';
    const low = ans.toLowerCase();
    let verdict = 'RESPUESTA ESTÁNDAR';
    if (low.includes('esa pregunta no está relacionada con este curso')) {
      verdict = '🛡️ GUARDRAIL: RECHAZO OFF-TOPIC EXITOSO';
    } else if (low.includes('esto no lo dijo el profesor en esta clase')) {
      verdict = '⚠️ DISCLAIMER: FUERA DE ESTA CLASE DETECTADO';
    } else if (low.includes('cierre') || low.includes('pregunta de verificación') || (low.includes('paso a paso') && low.includes('comprend')) || ans.includes('$$')) {
      verdict = '📐 ANDAMIAJE / KATEX FORMULA ACTIVA';
    }

    console.log(`   🏷️ Veredicto: ${verdict}`);
    console.log(`   💬 Respuesta:\n${ans}\n`);

    await wait(delayMs);
  }

  divider(`✅ SIMULACIÓN FINALIZADA CON ÉXITO`);
  console.log(`Para probar interactivamente en el navegador, abre:`);
  console.log(`👉 http://localhost:3000/simulator.html\n`);
}

runInteractiveSimulation().catch(err => {
  console.error('Error fatal en la simulación:', err);
  process.exit(1);
});
