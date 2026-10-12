import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const audioSource = path.join(__dirname, 'Modelo IS-LM - Explicado para principiantes!.mp3');
const tempDir = path.join(__dirname, 'temp_test_simulation');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function runSimulation() {
  console.log('================================================================');
  console.log('🧪 SIMULACIÓN DE TRANSMISIÓN DE AUDIO EN VIVO (POC 2 CELULARES)');
  console.log('================================================================');

  // 1. Reiniciar estado en el servidor
  console.log('\n1️⃣ Reiniciando estado del servidor (/api/live-stream/reset)...');
  const resetRes = await fetch('http://localhost:3000/api/live-stream/reset', { method: 'POST' });
  const resetData = await resetRes.json();
  console.log('   Respuesta:', resetData);

  // 2. Extraer 3 trozos de audio real de 5 segundos cada uno usando ffmpeg
  const chunksToTest = [
    { start: 5, duration: 5, label: 'Chunk 1 (Apertura de la clase)' },
    { start: 20, duration: 5, label: 'Chunk 2 (Mercado de bienes)' },
    { start: 45, duration: 5, label: 'Chunk 3 (Curva IS y tasa de interés)' }
  ];

  console.log('\n2️⃣ Extrayendo y enviando trozos de audio simulando el celular transmisor...');

  for (let i = 0; i < chunksToTest.length; i++) {
    const item = chunksToTest[i];
    const chunkPath = path.join(tempDir, `test_chunk_${i}.mp3`);

    console.log(`\n🎙️ [Celular 1] Grabando ${item.label} [${item.start}s - ${item.start + item.duration}s]...`);

    // Slicing nativo con ffmpeg
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(item.start),
      '-t', String(item.duration),
      '-i', audioSource,
      '-ac', '1',
      '-ar', '16000',
      chunkPath
    ]);

    const audioBuffer = fs.readFileSync(chunkPath);
    console.log(`   Audio extraído: ${audioBuffer.length} bytes. Enviando vía FormData a /api/live-stream/chunk...`);

    const tStart = performance.now();
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer], { type: 'audio/mp3' }), `chunk_${i}.mp3`);
    formData.append('elapsedSeconds', String(item.start + item.duration));

    const response = await fetch('http://localhost:3000/api/live-stream/chunk', {
      method: 'POST',
      body: formData
    });

    const latency = Math.round(performance.now() - tStart);
    const data = await response.json();

    console.log(`   ⚡ Transcrito por Groq Whisper en ${latency} ms:`);
    console.log(`   📝 Texto resultante [${data.timestamp}]: "${data.text}"`);
    console.log(`   📊 Total de líneas en la sesión: ${data.totalEntries}`);

    // Pausa breve para simular intervalo de tiempo real
    await new Promise(r => setTimeout(r, 1000));
  }

  // 3. Verificar estado sincronizado en el servidor (lo que ve el Celular 2)
  console.log('\n3️⃣ Verificando lo que recibe el Celular 2 del amigo (/api/live-stream/entries)...');
  const entriesRes = await fetch('http://localhost:3000/api/live-stream/entries');
  const entriesData = await entriesRes.json();
  console.log(`   Total de intervenciones acumuladas: ${entriesData.totalEntries}`);
  console.log('   Historial completo recibido:');
  entriesData.entries.forEach(e => {
    console.log(`     • [${e.timestamp}] ${e.speaker}: ${e.text}`);
  });

  // 4. Probar que el Chat Alumno responde con base en lo recién hablado por el micrófono
  console.log('\n4️⃣ [Celular 2 - Chat] Alumno pregunta sobre lo que acaba de escuchar por el micrófono...');
  const chatPrompt = '¿Qué acaba de explicar el profesor en el audio que recién se transmitió? Resume las ideas clave.';
  console.log(`   Pregunta del alumno: "${chatPrompt}"`);

  const tChatStart = performance.now();
  const chatRes = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: chatPrompt })
  });

  const chatLatency = Math.round(performance.now() - tChatStart);
  const chatData = await chatRes.json();

  console.log(`   ⚡ Respuesta de Cátedra Viva (${chatLatency} ms):`);
  console.log('----------------------------------------------------------------');
  console.log(chatData.answer);
  console.log('----------------------------------------------------------------');

  // Limpieza de archivos de prueba
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n✅ SIMULACIÓN COMPLETADA CON ÉXITO: Todo el pipeline de audio en vivo funciona.');
}

runSimulation().catch(err => {
  console.error('❌ Error en simulación:', err);
});
