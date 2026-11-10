/**
 * Script del Panel del Profesor y Transmisor de Audio (Cátedra Viva V2)
 */

let isRecording = false;
let mediaStream = null;
let mediaRecorder = null;
let audioContext = null;
let analyserNode = null;
let vuAnimationId = null;
let chunkCycleInterval = null;
let timerInterval = null;
let lectureSeconds = 0;
let isSimulating = false;
let simulationInterval = null;

// Calibración de Auto-Ancla de Voz del Profesor & Noise Gate Acústico
let teacherRmsAnchor = null;
let isAnchorCalibrated = false;
let currentChunkMaxVolume = 0; // Rastrea volumen pico del chunk actual para filtrar silencios
let uploadQueue = Promise.resolve(); // Cola secuencial de subida para garantizar orden cronológico

// DOM Elements
const btnToggleMic = document.getElementById('btnToggleMic');
const micIcon = document.getElementById('micIcon');
const micStatusText = document.getElementById('micStatusText');
const micTimerDisplay = document.getElementById('micTimerDisplay');
const vuBar = document.getElementById('vuBar');
const anchorStatusBadge = document.getElementById('anchorStatusBadge');
const btnSimulateOneMin = document.getElementById('btnSimulateOneMin');
const feedList = document.getElementById('feedList');
const feedEmptyState = document.getElementById('feedEmptyState');
const chaptersList = document.getElementById('chaptersList');
const forwardedQuestionsList = document.getElementById('forwardedQuestionsList');
const statWpm = document.getElementById('statWpm');
const statWords = document.getElementById('statWords');
const statLostCount = document.getElementById('statLostCount');
const paceBadge = document.getElementById('paceBadge');
const selectChatState = document.getElementById('selectChatState');
const checkComplement = document.getElementById('checkComplement');
const checkDigressions = document.getElementById('checkDigressions');
const btnCloseClass = document.getElementById('btnCloseClass');
const btnResetLecture = document.getElementById('btnResetLecture');
const teacherCourseSelect = document.getElementById('teacherCourseSelect');
const teacherCourseTitle = document.getElementById('teacherCourseTitle');
const btnShowQr = document.getElementById('btnShowQr');
const qrModal = document.getElementById('qrModal');
const btnCloseQr = document.getElementById('btnCloseQr');
const qrImg = document.getElementById('qrImg');
const qrUrlDisplay = document.getElementById('qrUrlDisplay');

// Inicialización
async function initTeacher() {
  await fetchState();
  bindEvents();
  // Poll de estado cada 3.5 segundos
  setInterval(fetchState, 3500);
}

function bindEvents() {
  btnToggleMic.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
  });

  btnSimulateOneMin.addEventListener('click', toggleSimulatedLecture);

  selectChatState.addEventListener('change', updateTeacherSettings);
  checkComplement.addEventListener('change', updateTeacherSettings);
  checkDigressions.addEventListener('change', updateTeacherSettings);

  btnResetLecture.addEventListener('click', async () => {
    if (confirm('¿Deseas reiniciar la transcripción de la clase activa?')) {
      await fetch('/api/live/reset', { method: 'POST' });
      lectureSeconds = 0;
      micTimerDisplay.textContent = '00:00';
      feedList.innerHTML = '';
      feedList.appendChild(feedEmptyState);
      feedEmptyState.style.display = 'block';
      fetchState();
    }
  });

  btnCloseClass.addEventListener('click', async () => {
    if (confirm('¿Deseas cerrar la clase y generar el resumen para la memoria histórica?')) {
      stopRecording();
      btnCloseClass.disabled = true;
      btnCloseClass.textContent = '⏳ Generando resumen histórico con IA...';
      try {
        const res = await fetch('/api/teacher/close-class', { method: 'POST' });
        const data = await res.json();
        alert('¡Clase archivada con éxito!\nNuevo ID histórico: ' + data.newHistoricalEntry?.id);
        fetchState();
      } catch (e) {
        alert('Error cerrando clase: ' + e.message);
      } finally {
        btnCloseClass.disabled = false;
        btnCloseClass.textContent = '✨ Cerrar Clase y Guardar en RAG Histórico';
      }
    }
  });

  teacherCourseSelect.addEventListener('change', async (e) => {
    const courseId = e.target.value;
    await fetch('/api/courses/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId })
    });
    fetchState();
  });

  // QR Modal
  btnShowQr.addEventListener('click', () => {
    const studentUrl = `${window.location.origin}/estudiante`;
    qrUrlDisplay.textContent = studentUrl;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(studentUrl)}`;
    qrModal.classList.add('active');
  });

  btnCloseQr.addEventListener('click', () => {
    qrModal.classList.remove('active');
  });
}

async function updateTeacherSettings() {
  const payload = {
    chatState: selectChatState.value,
    allowComplement: checkComplement.checked,
    hideDigressions: checkDigressions.checked
  };
  await fetch('/api/teacher/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function fetchState() {
  try {
    const res = await fetch('/api/live/state');
    const state = await res.json();
    const course = state.course;

    teacherCourseTitle.textContent = `${course.code}: ${course.name}`;
    teacherCourseSelect.value = course.id;

    // Sincronizar switches
    if (document.activeElement !== selectChatState) {
      selectChatState.value = state.teacherSettings.chatState;
    }
    checkComplement.checked = state.teacherSettings.allowComplement;
    checkDigressions.checked = state.teacherSettings.hideDigressions;

    // Métricas Read.ai
    statWpm.textContent = `${state.pace.currentWpm} PPM`;
    statWords.textContent = state.pace.totalWords;
    statLostCount.textContent = state.lostCountTotal;
    paceBadge.textContent = `Ritmo: ${state.pace.paceLabel}`;

    // Capítulos
    renderChapters(state.chapters);

    // Dudas enviadas por estudiantes
    renderStudentQuestions(state.forwardedQuestions, state.questions);

    // Feed
    if (state.entries && state.entries.length > 0) {
      if (feedEmptyState.parentNode === feedList) feedEmptyState.style.display = 'none';
      renderFeedEntries(state.entries);
    }
  } catch (err) {
    console.warn('Error sincronizando estado del profesor:', err);
  }
}

function renderStudentQuestions(forwarded = [], allQuestions = []) {
  if (!forwardedQuestionsList) return;
  if ((!forwarded || forwarded.length === 0) && (!allQuestions || allQuestions.length === 0)) {
    forwardedQuestionsList.innerHTML = `<div style="color: var(--text-muted);">Las dudas enviadas por los alumnos aparecerán aquí en tiempo real.</div>`;
    return;
  }

  forwardedQuestionsList.innerHTML = '';

  // Mostrar primero las dudas escaladas directamente al profesor
  forwarded.slice().reverse().forEach(fq => {
    const card = document.createElement('div');
    card.style.padding = '0.45rem 0.6rem';
    card.style.background = 'rgba(245, 158, 11, 0.14)';
    card.style.borderRadius = '6px';
    card.style.borderLeft = '3px solid #F59E0B';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #FCD34D; font-weight: 700;">
        <span>🙋‍♂️ DUDA PARA EL PROFESOR [${fq.timestamp}]</span>
        <span>${fq.createdAt || ''}</span>
      </div>
      <div style="margin-top: 0.2rem; font-weight: 600; color: #F8FAFC;">"${fq.question}"</div>
    `;
    forwardedQuestionsList.appendChild(card);
  });

  // Mostrar preguntas recientes hechas al tutor IA
  allQuestions.slice(-4).reverse().forEach(q => {
    const badgeColor = q.questionType === 'off_topic' ? '#F87171' : (q.questionType === 'unseen_academic' ? '#FCD34D' : '#6EE7B7');
    const badgeLabel = q.questionType === 'off_topic' ? '🚫 Off-Topic bloqueado' : (q.questionType === 'unseen_academic' ? '❓ No visto aún' : '✓ Respondida por IA');
    const card = document.createElement('div');
    card.style.padding = '0.35rem 0.55rem';
    card.style.background = 'rgba(15, 23, 42, 0.55)';
    card.style.borderRadius = '6px';
    card.style.borderLeft = `2px solid ${badgeColor}`;
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.68rem;">
        <span style="color: var(--text-muted);">[${q.timestamp}] Chat Tutor</span>
        <span style="color: ${badgeColor}; font-weight: 700;">${badgeLabel}</span>
      </div>
      <div style="margin-top: 0.15rem; color: #CBD5E1;">${q.question}</div>
    `;
    forwardedQuestionsList.appendChild(card);
  });
}

function renderChapters(chapters = []) {
  chaptersList.innerHTML = '';
  chapters.forEach(ch => {
    const item = document.createElement('div');
    item.style.padding = '0.35rem 0.5rem';
    item.style.background = 'rgba(15, 23, 42, 0.5)';
    item.style.borderRadius = '6px';
    item.style.borderLeft = '2px solid #38BDF8';
    item.innerHTML = `
      <span style="font-family: var(--font-mono); color: #38BDF8; font-weight: 700;">[${ch.minute}]</span>
      <span style="font-weight: 600;">${ch.title}</span>
    `;
    chaptersList.appendChild(item);
  });
}

function renderFeedEntries(entries) {
  feedList.innerHTML = '';
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.id = `entry-${entry.id}`;

    let tagClass = 'tag-concept';
    let tagText = '📐 Concepto';
    if (entry.category === 'formula') { tagClass = 'tag-formula'; tagText = '🧮 Fórmula'; }
    else if (entry.category === 'importancia') { tagClass = 'tag-emphasis'; tagText = '📌 Énfasis'; }
    else if (entry.category === 'digresion') { tagClass = 'tag-digression'; tagText = '💬 Digresión'; }

    item.innerHTML = `
      <div class="feed-meta">
        <div>
          <span class="feed-time">[${entry.timestamp}]</span>
          <span style="color: var(--text-muted); font-size: 0.72rem; margin-left: 0.3rem;">${entry.speaker}</span>
        </div>
        <span class="tag-badge ${tagClass}">${tagText}</span>
      </div>
      <div class="feed-text" style="font-size: 0.88rem;">${entry.text}</div>
    `;
    feedList.appendChild(item);
  });
  feedList.scrollTop = feedList.scrollHeight;

  if (window.renderMathInElement) {
    window.renderMathInElement(feedList, {
      delimiters: [{ left: '$', right: '$', display: false }]
    });
  }
}

// --------------------------------------------------------------------------
// GRABACIÓN DE AUDIO DESDE MICRÓFONO CELULAR / LAPTOP
// --------------------------------------------------------------------------

async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    sourceNode.connect(analyserNode);

    isRecording = true;
    btnToggleMic.classList.add('recording');
    micIcon.textContent = '⏹';
    micStatusText.textContent = 'Transmitiendo en vivo con Whisper...';
    micStatusText.style.color = '#EF4444';

    startVuMeter();

    // Contador de tiempo
    timerInterval = setInterval(() => {
      lectureSeconds++;
      const m = Math.floor(lectureSeconds / 60);
      const s = Math.floor(lectureSeconds % 60);
      micTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);

    // Ciclo continuo de trozos de audio (4.5s exactos sin hueco de 400ms)
    recordSingleChunk();
    chunkCycleInterval = setInterval(recordSingleChunk, 4500);

  } catch (err) {
    alert('No se pudo acceder al micrófono: ' + err.message);
  }
}

function stopRecording() {
  isRecording = false;
  btnToggleMic.classList.remove('recording');
  micIcon.textContent = '🎙️';
  micStatusText.textContent = 'Micrófono en espera';
  micStatusText.style.color = '#94A3B8';

  if (chunkCycleInterval) clearInterval(chunkCycleInterval);
  if (timerInterval) clearInterval(timerInterval);
  if (vuAnimationId) cancelAnimationFrame(vuAnimationId);

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  vuBar.style.width = '0%';
}

function recordSingleChunk() {
  if (!isRecording || !mediaStream) return;

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
  const rec = new MediaRecorder(mediaStream, { mimeType: mime });
  const chunks = [];
  const chunkStartSecond = lectureSeconds;
  currentChunkMaxVolume = 0; // Reiniciar pico de volumen para este chunk

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  rec.onstop = () => {
    const peakVol = currentChunkMaxVolume;
    if (chunks.length > 0) {
      // Noise Gate Acústico: si el volumen máximo del bloque fue < 6% (silencio), no gastar request ni alucinar "Gracias."
      if (peakVol < 6) {
        console.log(`[Noise Gate] Silencio detectado en seg ${chunkStartSecond} (pico ${peakVol}%). Omitiendo envío a Whisper.`);
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      // Encolar secuencialmente para garantizar que el chunk N siempre llegue antes que el N+1
      uploadQueue = uploadQueue
        .then(() => sendChunkToServer(blob, chunkStartSecond))
        .catch(err => console.warn('Error en cola de audio:', err));
    }
  };

  rec.start();
  setTimeout(() => {
    if (rec.state === 'recording') rec.stop();
  }, 4500);
}

async function sendChunkToServer(audioBlob, currentSeconds) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'chunk.webm');
  formData.append('elapsedSeconds', currentSeconds);
  formData.append('isPrimarySpeaker', 'true');

  try {
    const res = await fetch('/api/live/audio-chunk', {
      method: 'POST',
      body: formData
    });
    if (res.ok) {
      const data = await res.json();
      if (data.entry) {
        fetchState();
      }
    }
  } catch (err) {
    console.warn('Error enviando chunk de audio:', err);
  }
}

function startVuMeter() {
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

  function update() {
    if (!isRecording) return;
    analyserNode.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const pct = Math.min(100, Math.round((avg / 128) * 100));
    vuBar.style.width = pct + '%';

    if (pct > currentChunkMaxVolume) {
      currentChunkMaxVolume = pct;
    }

    // Auto-calibración durante primeros 6 segundos
    if (lectureSeconds <= 6 && pct > 20 && !isAnchorCalibrated) {
      teacherRmsAnchor = pct;
      isAnchorCalibrated = true;
      anchorStatusBadge.textContent = `🎯 Docente Calibrado (${pct}%)`;
    }

    vuAnimationId = requestAnimationFrame(update);
  }
  update();
}

// --------------------------------------------------------------------------
// MODO SIMULACIÓN AUTOMÁTICA DE 1 MINUTO (PLAN B)
// --------------------------------------------------------------------------

function toggleSimulatedLecture() {
  if (isSimulating) {
    stopSimulation();
  } else {
    startSimulation();
  }
}

function startSimulation() {
  isSimulating = true;
  btnSimulateOneMin.textContent = '⏹ Detener Simulación';
  btnSimulateOneMin.classList.add('btn-danger');

  let simSec = 0;
  async function step() {
    if (!isSimulating) return;
    try {
      const res = await fetch('/api/simulator/step-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startSecond: simSec, durationSeconds: 5 })
      });
      const data = await res.json();
      simSec = data.nextSeconds || (simSec + 5);
      fetchState();
      if (simSec >= 60) {
        stopSimulation();
        alert('¡Simulación de 1 minuto completada con éxito!');
      }
    } catch (e) {
      console.warn('Error en simulación:', e);
    }
  }

  step();
  simulationInterval = setInterval(step, 5500);
}

function stopSimulation() {
  isSimulating = false;
  btnSimulateOneMin.textContent = '⚡ Simular 1 Minuto de Clase Hablada (Auto)';
  btnSimulateOneMin.classList.remove('btn-danger');
  if (simulationInterval) clearInterval(simulationInterval);
}

window.addEventListener('DOMContentLoaded', initTeacher);
