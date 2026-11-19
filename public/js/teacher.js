/**
 * Script del Panel del Profesor / Auxiliar y Transmisor de Audio (Cátedra Viva V3)
 */

let isRecording = false;
let audioSourceMode = 'mic'; // 'mic' | 'virtual'
let mediaStream = null;
let audioContext = null;
let analyserNode = null;
let vuAnimationId = null;
let chunkCycleInterval = null;
let timerInterval = null;
let lectureSeconds = 0;
let isSimulating = false;
let simulationInterval = null;
let activeRecorder = null;
let uploadQueue = Promise.resolve();
let latestAlertClusterId = null;
let latestCapsuleData = null;
let activeCapsuleTab = 'apunte'; // 'apunte' | 'pauta'

// DOM Elements
const teacherCourseTitle = document.getElementById('teacherCourseTitle');
const btnToggleMic = document.getElementById('btnToggleMic');
const micIcon = document.getElementById('micIcon');
const micStatusText = document.getElementById('micStatusText');
const micTimerDisplay = document.getElementById('micTimerDisplay');
const vuBar = document.getElementById('vuBar');
const anchorStatusBadge = document.getElementById('anchorStatusBadge');
const btnSimulateOneMin = document.getElementById('btnSimulateOneMin');
const btnEndClassQuick = document.getElementById('btnEndClassQuick');
const audioSourceControl = document.getElementById('audioSourceControl');

const ucursosDeckLabel = document.getElementById('ucursosDeckLabel');
const ucursosSlidesList = document.getElementById('ucursosSlidesList');
const chaptersList = document.getElementById('chaptersList');
const feedList = document.getElementById('feedList');
const feedEmptyState = document.getElementById('feedEmptyState');
const btnResetLecture = document.getElementById('btnResetLecture');

const statWpm = document.getElementById('statWpm');
const statWords = document.getElementById('statWords');
const statLostCount = document.getElementById('statLostCount');
const paceBadge = document.getElementById('paceBadge');

const chatModeControl = document.getElementById('chatModeControl');
const modeDescText = document.getElementById('modeDescText');
const checkComplement = document.getElementById('checkComplement');
const checkDigressions = document.getElementById('checkDigressions');
const btnCloseClass = document.getElementById('btnCloseClass');
const btnDownloadTaGuide = document.getElementById('btnDownloadTaGuide');
const clustersList = document.getElementById('clustersList');
const radarTotalBadge = document.getElementById('radarTotalBadge');
const teacherCourseSelect = document.getElementById('teacherCourseSelect');

// Alert Banner
const boardAlertBanner = document.getElementById('boardAlertBanner');
const boardAlertText = document.getElementById('boardAlertText');
const btnAlertResolve = document.getElementById('btnAlertResolve');
const btnAlertForTa = document.getElementById('btnAlertForTa');

// Telemetry & Privacy
const telemetryPrivacyCount = document.getElementById('telemetryPrivacyCount');
const telemetryTokenSaved = document.getElementById('telemetryTokenSaved');
const telemetryGpuVsCloud = document.getElementById('telemetryGpuVsCloud');
const privacyPillText = document.getElementById('privacyPillText');
const btnOpenPrivacy = document.getElementById('btnOpenPrivacy');
const privacyModal = document.getElementById('privacyModal');
const btnClosePrivacy = document.getElementById('btnClosePrivacy');
const modalDeletedChunks = document.getElementById('modalDeletedChunks');

// QR Modal
const btnShowQr = document.getElementById('btnShowQr');
const qrModal = document.getElementById('qrModal');
const btnCloseQr = document.getElementById('btnCloseQr');
const qrSvgContainer = document.getElementById('qrSvgContainer');
const qrUrlDisplay = document.getElementById('qrUrlDisplay');
const btnCopyStudentUrl = document.getElementById('btnCopyStudentUrl');

// Capsule Modal
const btnOpenCapsule = document.getElementById('btnOpenCapsule');
const capsuleModal = document.getElementById('capsuleModal');
const capsuleTabsControl = document.getElementById('capsuleTabsControl');
const btnCloseCapsule = document.getElementById('btnCloseCapsule');
const capsuleBody = document.getElementById('capsuleBody');
const btnDownloadCapsule = document.getElementById('btnDownloadCapsule');

const MODE_DESCRIPTIONS = {
  paused: '🟡 Pausa temporal para atención en pizarra. Las dudas se acumulan en el Radar.',
  active: '🟢 En vivo: respuestas breves (2–3 líneas) + frase lista para levantar la mano.',
  full_ia: '🟣 Post-Clase / Full IA: tutoría profunda paso a paso conectada a slides e historial.'
};

async function initTeacher() {
  await fetchState();
  bindEvents();
  setInterval(fetchState, 3000);
}

function bindEvents() {
  btnToggleMic.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
  });

  // Selector Fuente de Audio: Micrófono Sala vs Virtual (Zoom/Meet)
  audioSourceControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRecording) {
        alert('Detén la transmisión actual antes de cambiar de fuente de audio.');
        return;
      }
      audioSourceMode = btn.getAttribute('data-source');
      audioSourceControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active-source'));
      btn.classList.add('active-source');
      micStatusText.textContent = audioSourceMode === 'virtual'
        ? 'Listo para capturar audio de Zoom/Meet'
        : 'Micrófono en espera';
    });
  });

  btnSimulateOneMin.addEventListener('click', toggleSimulatedLecture);

  // Selector Segmented de 3 Modos
  chatModeControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      setActiveModeUI(mode);
      updateTeacherSettings(mode);
    });
  });

  checkComplement.addEventListener('change', () => updateTeacherSettings());
  checkDigressions.addEventListener('change', () => updateTeacherSettings());

  btnResetLecture.addEventListener('click', async () => {
    if (confirm('¿Deseas reiniciar la transcripción y el radar de la clase activa?')) {
      await fetch('/api/live/reset', { method: 'POST' });
      lectureSeconds = 0;
      micTimerDisplay.textContent = '00:00';
      feedList.innerHTML = '';
      feedList.appendChild(feedEmptyState);
      feedEmptyState.style.display = 'block';
      fetchState();
    }
  });

  btnCloseClass.addEventListener('click', handleEndClassOneClick);
  if (btnEndClassQuick) {
    btnEndClassQuick.addEventListener('click', handleEndClassOneClick);
  }

  // Atajo Tecla P para activar/desactivar Modo Pizarra al instante
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'p' || e.key === 'P') {
      const activeBtn = chatModeControl.querySelector('.seg-btn.active');
      const current = activeBtn ? activeBtn.getAttribute('data-mode') : 'active';
      const next = current === 'paused' ? 'active' : 'paused';
      setActiveModeUI(next);
      updateTeacherSettings(next);
    }
  });

  btnDownloadTaGuide.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/live/capsule');
      const data = await res.json();
      if (data.capsule) {
        downloadMarkdownFile(`Pauta_Auxiliar_${data.capsule.courseCode}.md`, data.capsule.taGuideMarkdown);
      }
    } catch (e) {
      alert('No se pudo exportar la pauta: ' + e.message);
    }
  });

  teacherCourseSelect.addEventListener('change', async (e) => {
    const courseId = e.target.value;
    await fetch('/api/courses/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId })
    });
    lectureSeconds = 0;
    micTimerDisplay.textContent = '00:00';
    feedList.innerHTML = '';
    feedList.appendChild(feedEmptyState);
    feedEmptyState.style.display = 'block';
    fetchState();
  });

  // Alert Banner Actions
  btnAlertResolve.addEventListener('click', () => {
    if (latestAlertClusterId) handleClusterAction(latestAlertClusterId, 'resolved');
  });
  btnAlertForTa.addEventListener('click', () => {
    if (latestAlertClusterId) handleClusterAction(latestAlertClusterId, 'for_ta');
  });

  // Modales
  btnShowQr.addEventListener('click', async () => {
    const studentUrl = `${window.location.origin}/estudiante`;
    qrUrlDisplay.textContent = studentUrl;
    qrModal.classList.add('active');
    try {
      const svgText = await fetch(`/api/qr?url=${encodeURIComponent(studentUrl)}`).then(r => r.text());
      qrSvgContainer.innerHTML = svgText;
    } catch (_) {
      qrSvgContainer.innerHTML = `<div style="padding:1rem;color:#0F172A;font-size:0.8rem;">${studentUrl}</div>`;
    }
  });
  btnCloseQr.addEventListener('click', () => qrModal.classList.remove('active'));
  btnCopyStudentUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(qrUrlDisplay.textContent);
      btnCopyStudentUrl.textContent = '✓ Enlace copiado al portapapeles';
      setTimeout(() => { btnCopyStudentUrl.textContent = '📋 Copiar Enlace de la Clase'; }, 2000);
    } catch (_) {}
  });

  btnOpenCapsule.addEventListener('click', async () => {
    const res = await fetch('/api/live/capsule');
    const data = await res.json();
    if (data.capsule) {
      latestCapsuleData = data.capsule;
      renderCapsuleModal(data.capsule);
      capsuleModal.classList.add('active');
    }
  });
  if (capsuleTabsControl) {
    capsuleTabsControl.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCapsuleTab = btn.getAttribute('data-tab');
        capsuleTabsControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active-source'));
        btn.classList.add('active-source');
        if (latestCapsuleData) renderCapsuleModal(latestCapsuleData);
      });
    });
  }
  btnCloseCapsule.addEventListener('click', () => capsuleModal.classList.remove('active'));
  btnDownloadCapsule.addEventListener('click', () => {
    if (!latestCapsuleData) return;
    if (activeCapsuleTab === 'pauta') {
      downloadMarkdownFile(`Pauta_Auxiliar_${latestCapsuleData.courseCode}.md`, latestCapsuleData.taGuideMarkdown);
    } else {
      downloadMarkdownFile(`Apunte_Vivo_${latestCapsuleData.courseCode}.md`, latestCapsuleData.markdownExport);
    }
  });

  btnOpenPrivacy.addEventListener('click', () => privacyModal.classList.add('active'));
  btnClosePrivacy.addEventListener('click', () => privacyModal.classList.remove('active'));
}

function setActiveModeUI(mode) {
  chatModeControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
  });
  modeDescText.textContent = MODE_DESCRIPTIONS[mode] || MODE_DESCRIPTIONS.active;
}

async function handleEndClassOneClick() {
  if (isRecording) stopRecording();
  if (isSimulating) stopSimulation();
  btnCloseClass.disabled = true;
  if (btnEndClassQuick) btnEndClassQuick.disabled = true;
  if (btnEndClassQuick) btnEndClassQuick.textContent = '⏳ Activando Full IA...';
  try {
    const res = await fetch('/api/teacher/close-class', { method: 'POST' });
    const data = await res.json();
    await fetchState();
    if (data.capsule) {
      latestCapsuleData = data.capsule;
      activeCapsuleTab = 'apunte';
      renderCapsuleModal(data.capsule);
      capsuleModal.classList.add('active');
    }
  } catch (e) {
    alert('Error finalizando clase: ' + e.message);
  } finally {
    btnCloseClass.disabled = false;
    if (btnEndClassQuick) {
      btnEndClassQuick.disabled = false;
      btnEndClassQuick.textContent = '🏁 Terminar Clase';
    }
  }
}

async function updateTeacherSettings(forcedMode = null) {
  const activeBtn = chatModeControl.querySelector('.seg-btn.active');
  const currentMode = forcedMode || (activeBtn ? activeBtn.getAttribute('data-mode') : 'active');
  const payload = {
    chatState: currentMode,
    allowComplement: checkComplement.checked,
    hideDigressions: checkDigressions.checked
  };
  await fetch('/api/teacher/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function handleClusterAction(clusterId, status) {
  await fetch('/api/teacher/cluster-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clusterId, status })
  });
  fetchState();
}

async function fetchState() {
  try {
    const res = await fetch('/api/live/state');
    const state = await res.json();
    const course = state.course;

    teacherCourseTitle.textContent = `${course.code}: ${course.name}`;
    teacherCourseSelect.value = course.id;

    // Sincronizar switches y modos
    setActiveModeUI(state.teacherSettings.chatState || 'active');
    checkComplement.checked = state.teacherSettings.allowComplement;
    checkDigressions.checked = state.teacherSettings.hideDigressions;

    // Métricas Read.ai
    statWpm.textContent = `${state.pace.currentWpm} PPM`;
    statWords.textContent = state.pace.totalWords;
    statLostCount.textContent = state.lostCountTotal;
    paceBadge.textContent = state.pace.currentWpm > 0
      ? (state.pace.paceStatus === 'rapido' ? '⚠️ Rápido' : '✓ Óptimo')
      : 'En espera';

    // Slides de U-Cursos & slide activa detectada
    renderUCursosSlides(course.ucursosSync, state.entries);

    // Capítulos
    renderChapters(state.chapters);

    // Radar Clustering + Banner Superior de Pizarra
    renderTopicClusters(state.topicClusters || []);
    updateBoardAlertBanner(state.topicClusters || [], state.lostCountTotal);

    // Telemetría Tokenomics y Privacidad Efímera
    const tk = state.tokenomics || {};
    const deletedCount = tk.ephemeralChunksDeleted || 0;
    const savedTok = tk.prefixTokensSaved || 0;
    const onPremUsd = (tk.onPremCostUsd || 0).toFixed(4);
    const cloudUsd = (tk.cloudCostUsd || 0).toFixed(4);
    telemetryPrivacyCount.textContent = `🛡️ ${deletedCount} chunks audio borrados (<1s)`;
    telemetryTokenSaved.textContent = `⚡ Prefix/Cache: ${savedTok.toLocaleString()} tok ahorrados (${tk.cacheHits || 0} hits)`;
    telemetryGpuVsCloud.textContent = `🖥️ GPU U: $${onPremUsd} vs Cloud $${cloudUsd}`;
    privacyPillText.textContent = `Efímero (${deletedCount} borrados) • Anónimo`;
    if (modalDeletedChunks) modalDeletedChunks.textContent = deletedCount;

    // Feed
    if (state.entries && state.entries.length > 0) {
      if (feedEmptyState.parentNode === feedList) feedEmptyState.style.display = 'none';
      renderFeedEntries(state.entries);
    }
  } catch (err) {
    console.warn('Error sincronizando estado del profesor:', err);
  }
}

function renderUCursosSlides(ucursosSync, entries = []) {
  if (!ucursosDeckLabel || !ucursosSlidesList) return;
  if (!ucursosSync || !ucursosSync.slides || ucursosSync.slides.length === 0) {
    ucursosDeckLabel.textContent = 'Sin PPT cargada — Modo Pizarra Libre (Contexto Plano)';
    ucursosSlidesList.innerHTML = '';
    return;
  }

  ucursosDeckLabel.textContent = ucursosSync.deckTitle;
  const lastWithSlide = [...entries].reverse().find(e => e.slideRef && e.slideRef.id);
  const activeSlideId = lastWithSlide ? lastWithSlide.slideRef.id : null;

  ucursosSlidesList.innerHTML = '';
  ucursosSync.slides.forEach(sl => {
    const countForSlide = entries.filter(e => e.slideRef && e.slideRef.id === sl.id).length;
    const row = document.createElement('div');
    row.className = `slide-pill-item ${activeSlideId === sl.id ? 'is-active' : ''}`;
    row.innerHTML = `
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <strong>S${sl.number}</strong> · ${sl.title}
      </span>
      <span class="tabular-nums" style="font-family:var(--font-mono); font-size:0.68rem; white-space:nowrap; flex-shrink:0;">${countForSlide > 0 ? `${countForSlide} seg` : '—'}</span>
    `;
    ucursosSlidesList.appendChild(row);
  });
}

function renderChapters(chapters = []) {
  chaptersList.innerHTML = '';
  chapters.forEach(ch => {
    const item = document.createElement('div');
    item.style.padding = '5px 8px';
    item.style.background = 'var(--surface-2)';
    item.style.borderRadius = 'var(--radius-xs)';
    item.style.borderLeft = '2px solid #38BDF8';
    item.innerHTML = `
      <span class="tabular-nums" style="font-family: var(--font-mono); color: #38BDF8; font-weight: 700;">[${ch.minute}]</span>
      <span style="font-weight: 600;">${ch.title}</span>
    `;
    chaptersList.appendChild(item);
  });
}

function updateBoardAlertBanner(clusters = [], lostTotal = 0) {
  const isCleared = (s) => s === 'resolved' || s === 'auto_resolved';
  const hotCluster = clusters.find(c => !isCleared(c.status) && (c.count >= 2 || c.escalatedCount >= 1 || c.lostCount >= 2));
  if (!hotCluster && lostTotal < 2) {
    boardAlertBanner.classList.add('hidden');
    latestAlertClusterId = null;
    return;
  }

  const target = hotCluster || clusters.find(c => !isCleared(c.status));
  if (!target) {
    boardAlertBanner.classList.add('hidden');
    latestAlertClusterId = null;
    return;
  }

  latestAlertClusterId = target.id;
  boardAlertText.textContent = `Tópico "${target.label}" (${target.count} señales / ${target.lostCount} "Me perdí") — ${target.suggestion}`;
  boardAlertBanner.classList.remove('hidden');
}

function renderTopicClusters(clusters = []) {
  const totalSignals = clusters.reduce((acc, c) => acc + c.count, 0);
  radarTotalBadge.textContent = `${totalSignals} señales`;

  if (!clusters || clusters.length === 0) {
    clustersList.innerHTML = `<div style="font-size: 0.76rem; color: var(--text-muted);">Las preguntas repetidas y avisos de "Me perdí" se agruparán automáticamente por tópico aquí.</div>`;
    return;
  }

  clustersList.innerHTML = '';
  clusters.forEach(c => {
    const isResolved = c.status === 'resolved' || c.status === 'auto_resolved';
    const card = document.createElement('div');
    card.className = `cluster-card ${isResolved ? 'is-resolved' : c.status === 'for_ta' ? 'is-ta' : ''}`;

    const lastQ = c.questions && c.questions.length > 0 ? c.questions[c.questions.length - 1] : null;
    const statusBadge = c.status === 'auto_resolved'
      ? `<span style="color:#6EE7B7;">✓ Retomado por el profe [${c.resolvedAt || ''}]</span>`
      : c.status === 'resolved'
      ? `<span style="color:#6EE7B7;">✓ Aclarado</span>`
      : c.status === 'for_ta'
      ? `<span style="color:#C4B5FD;">📌 Para Ayudantía</span>`
      : `<span style="color:#FCD34D;">🔥 ×${c.count} señales</span>`;

    const extraPulses = [
      c.fastCount > 0 ? `🐢 ${c.fastCount} ritmo` : '',
      c.exampleCount > 0 ? `💡 ${c.exampleCount} ejemplo` : ''
    ].filter(Boolean).join(' • ');

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:0.74rem; font-weight:700;">
        <span>${c.label}</span>
        <span class="tabular-nums">${statusBadge}</span>
      </div>
      <div style="font-size:0.71rem; color:var(--text-muted); line-height:1.35;">${c.suggestion}</div>
      ${extraPulses ? `<div style="font-size:0.69rem; color:#93C5FD;">${extraPulses}</div>` : ''}
      ${lastQ ? `<div style="font-size:0.71rem; color:#CBD5E1; font-style:italic;">Última señal: "${lastQ}"</div>` : ''}
      <div style="display:flex; gap:5px; margin-top:2px;">
        <button type="button" class="btn btn-outline btn-xs" data-act="resolved">✓ Aclarado</button>
        <button type="button" class="btn btn-outline btn-xs" data-act="for_ta">📌 Ayudantía</button>
      </div>
    `;

    card.querySelector('[data-act="resolved"]').addEventListener('click', () => handleClusterAction(c.id, 'resolved'));
    card.querySelector('[data-act="for_ta"]').addEventListener('click', () => handleClusterAction(c.id, 'for_ta'));
    clustersList.appendChild(card);
  });
}

function renderFeedEntries(entries) {
  feedList.innerHTML = '';
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.id = `entry-${entry.id}`;

    let tagClass = 'tag-concept';
    let tagText = 'Concepto';
    if (entry.category === 'formula') { tagClass = 'tag-formula'; tagText = 'Fórmula'; }
    else if (entry.category === 'importancia') { tagClass = 'tag-emphasis'; tagText = 'Énfasis Control'; }
    else if (entry.category === 'digresion') { tagClass = 'tag-digression'; tagText = 'Digresión'; }

    const slideBadge = entry.slideRef
      ? `<span class="tag-badge tag-slide">Lám. ${entry.slideRef.number}</span>`
      : '';

    item.innerHTML = `
      <div class="feed-meta">
        <div>
          <span class="feed-time">[${entry.timestamp}]</span>
          <span style="color: var(--text-muted); font-size: 0.72rem; margin-left: 4px;">${entry.speaker}</span>
        </div>
        <div style="display:flex; gap:4px; align-items:center;">
          ${slideBadge}
          <span class="tag-badge ${tagClass}">${tagText}</span>
        </div>
      </div>
      <div class="feed-text" style="font-size: 0.85rem;">${entry.text}</div>
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

function renderCapsuleModal(capsule) {
  let html = '';

  if (activeCapsuleTab === 'pauta') {
    if (!capsule.taFocusPoints || capsule.taFocusPoints.length === 0) {
      capsuleBody.innerHTML = `<div style="color:var(--text-muted);">No hay puntos ciegos ni dudas acumuladas aún para la pauta de ayudantía.</div>`;
      return;
    }
    html = capsule.taFocusPoints.map((tp, idx) => `
      <div style="background: var(--surface-2); border: 1px solid var(--border-subtle); border-left: 3px solid var(--purple); border-radius: var(--radius-sm); padding: 10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="color:#DDD6FE;">${idx + 1}. ${tp.topic}</strong>
          <span class="tabular-nums" style="font-size:0.74rem; color:#FCD34D;">${tp.totalSignals} señales • ${tp.lostCount} "Me perdí"</span>
        </div>
        <div style="font-size:0.76rem; color:#6EE7B7; margin-top:3px;">
          Estado en clase: ${tp.status === 'auto_resolved' ? `✓ Retomado oralmente por el profesor [${tp.resolvedAt || ''}]` : tp.status === 'resolved' ? '✓ Aclarado en pizarra' : tp.status === 'for_ta' ? '📌 Priorizado para Ayudantía' : 'Pendiente para reforzar'}
        </div>
        <div style="font-size:0.8rem; color:var(--text); margin-top:4px;"><strong>Sugerencia Auxiliar:</strong> ${tp.suggestion}</div>
        ${tp.sampleQuestions && tp.sampleQuestions.length > 0 ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:5px;"><strong>Dudas anónimas de alumnos:</strong><ul style="margin:3px 0 0 18px;">${tp.sampleQuestions.map(q => `<li>"${q}"</li>`).join('')}</ul></div>` : ''}
      </div>
    `).join('');
    capsuleBody.innerHTML = html;
    return;
  }

  if (capsule.teacherEmphasis && capsule.teacherEmphasis.length > 0) {
    html += `
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-sm); padding: 10px 12px;">
        <strong style="color:#FCD34D;">📌 Avisos y Énfasis del Profesor ("Ojo para el Control")</strong>
        <ul style="margin: 6px 0 0 18px; color:#F1F5F9;">
          ${capsule.teacherEmphasis.map(e => `<li><span class="feed-time">[${e.timestamp}]</span> ${e.text}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  (capsule.slideBlocks || []).forEach(sb => {
    if (sb.spokenEntries.length === 0 && capsule.totalEntries > 0) return;
    html += `
      <div style="background: var(--surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 12px;">
        <div style="font-weight:700; color:#DDD6FE; margin-bottom:4px;">📑 Lámina ${sb.slideNumber}: ${sb.title}</div>
        <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:6px; border-left:2px solid var(--border-default); padding-left:8px;">
          ${sb.bulletPoints.map(bp => `• ${bp}`).join('<br>')}
        </div>
        ${sb.spokenEntries.length > 0
          ? `<div style="font-size:0.82rem;"><strong>Explicación oral en sala:</strong><ul style="margin:4px 0 0 18px;">${sb.spokenEntries.map(se => `<li><span class="feed-time">[${se.timestamp}]</span> ${se.text}</li>`).join('')}</ul></div>`
          : `<div style="font-size:0.76rem; color:var(--text-dim);">Aún sin intervenciones asociadas a esta lámina.</div>`
        }
      </div>
    `;
  });

  if (capsule.unmappedEntries && capsule.unmappedEntries.length > 0) {
    html += `
      <div style="background: var(--surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 12px;">
        <strong style="color:#93C5FD;">📝 Explicaciones de Pizarra Libre (Sin Slide)</strong>
        <ul style="margin: 6px 0 0 18px;">
          ${capsule.unmappedEntries.map(ue => `<li><span class="feed-time">[${ue.timestamp}]</span> ${ue.text}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (capsule.taFocusPoints && capsule.taFocusPoints.length > 0) {
    html += `
      <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: var(--radius-sm); padding: 10px 12px;">
        <strong style="color:#C4B5FD;">📋 Puntos de Refuerzo para Auxiliar (Ayudantía)</strong>
        <ul style="margin: 6px 0 0 18px;">
          ${capsule.taFocusPoints.map(tp => `<li><strong>${tp.topic}</strong> (${tp.totalSignals} señales): ${tp.suggestion}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  capsuleBody.innerHTML = html || `<div style="color:var(--text-muted);">Aún no hay intervenciones registradas hoy.</div>`;
}

function downloadMarkdownFile(filename, textContent) {
  const blob = new Blob([textContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --------------------------------------------------------------------------
// GRABACIÓN DE AUDIO: MICRÓFONO PRESENCIAL vs AUDIO DE PESTAÑA VIRTUAL (ZOOM/MEET)
// --------------------------------------------------------------------------

async function startRecording() {
  try {
    micStatusText.textContent = '⏳ Activando fuente de audio...';
    micStatusText.style.color = '#FCD34D';

    if (audioSourceMode === 'virtual') {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error('No seleccionaste "Compartir audio de la pestaña/sistema" al elegir la ventana de Zoom/Meet.');
      }
      // Detener video si no lo necesitamos, conservando la pista de audio limpio sin ruido ambiente
      displayStream.getVideoTracks().forEach(t => t.stop());
      mediaStream = new MediaStream(audioTracks);
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    sourceNode.connect(analyserNode);

    isRecording = true;
    btnToggleMic.classList.add('recording');
    micIcon.textContent = '⏹';
    micStatusText.textContent = audioSourceMode === 'virtual'
      ? '🔴 Capturando audio limpio de Clase Virtual...'
      : '🔴 ¡Habla ahora! Transmitiendo en vivo...';
    micStatusText.style.color = '#EF4444';

    startVuMeter();

    timerInterval = setInterval(() => {
      lectureSeconds++;
      const m = Math.floor(lectureSeconds / 60);
      const s = Math.floor(lectureSeconds % 60);
      micTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);

    // Iniciar primer bloque de inmediato (0s) y rotar cada 5.0s sin ningún hueco ni descarte
    startSingleRecorderChunk();
    chunkCycleInterval = setInterval(() => {
      if (!isRecording || !mediaStream) return;
      if (activeRecorder && activeRecorder.state === 'recording') {
        try { activeRecorder.stop(); } catch (_) {}
      }
      startSingleRecorderChunk();
    }, 5000);

  } catch (err) {
    micStatusText.textContent = 'Micrófono en espera';
    micStatusText.style.color = '#94A3B8';
    alert('No se pudo activar el audio: ' + err.message);
  }
}

function stopRecording() {
  isRecording = false;
  btnToggleMic.classList.remove('recording');
  micIcon.textContent = '🎙️';
  micStatusText.textContent = audioSourceMode === 'virtual'
    ? 'Audio virtual en espera'
    : 'Micrófono en espera';
  micStatusText.style.color = '#94A3B8';

  if (chunkCycleInterval) {
    clearInterval(chunkCycleInterval);
    chunkCycleInterval = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (vuAnimationId) {
    cancelAnimationFrame(vuAnimationId);
    vuAnimationId = null;
  }

  if (activeRecorder && activeRecorder.state === 'recording') {
    const recToFinish = activeRecorder;
    activeRecorder = null;
    recToFinish.addEventListener('stop', () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
    }, { once: true });
    try { recToFinish.stop(); } catch (_) {}
  } else {
    activeRecorder = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  vuBar.style.width = '0%';
}

function getBestAudioMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function startSingleRecorderChunk() {
  if (!isRecording || !mediaStream) return;

  const mime = getBestAudioMimeType();
  const rec = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
  activeRecorder = rec;

  const chunks = [];
  const chunkStartSecond = lectureSeconds;

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  rec.onstop = () => {
    if (chunks.length === 0) return;
    const blob = new Blob(chunks, { type: mime || 'audio/webm' });
    if (blob.size < 500) return;

    uploadQueue = uploadQueue
      .then(() => sendChunkToServer(blob, chunkStartSecond))
      .catch(err => console.warn('Error en cola de audio:', err));
  };

  rec.start(250);
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

    vuAnimationId = requestAnimationFrame(update);
  }
  update();
}

// --------------------------------------------------------------------------
// MODO SIMULACIÓN AUTOMÁTICA
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
  btnSimulateOneMin.textContent = '⏹ Detener Demo';
  btnSimulateOneMin.classList.add('btn-danger');
  micStatusText.textContent = '⚡ Simulación de clase activa...';
  micStatusText.style.color = '#38BDF8';

  let simSec = 0;
  async function step() {
    if (!isSimulating) return;
    try {
      const res = await fetch('/api/simulator/step-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startSecond: simSec, durationSeconds: 7 })
      });
      const data = await res.json();
      simSec = data.nextSeconds || (simSec + 7);
      const m = Math.floor(simSec / 60);
      const s = Math.floor(simSec % 60);
      micTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      fetchState();
      if (simSec >= 56) {
        stopSimulation();
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
  btnSimulateOneMin.textContent = '⚡ Simular Demo';
  btnSimulateOneMin.classList.remove('btn-danger');
  micStatusText.textContent = 'Micrófono en espera';
  micStatusText.style.color = '#94A3B8';
  if (simulationInterval) clearInterval(simulationInterval);
}

window.addEventListener('DOMContentLoaded', initTeacher);
