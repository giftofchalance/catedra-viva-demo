/**
 * Script del Panel Docente V4:
 * - Revelación progresiva para 3 arquetipos docentes
 * - Grabación con overlap acústico de 1.0s para evitar palabras cortadas
 * - Render incremental del feed vía SSE sin secuestrar el scroll
 * - Creación dinámica de cursos agnósticos y toasts no bloqueantes
 */

import {
  icon,
  hydrateSvgIcons,
  escapeHtml,
  showToast,
  connectLiveStateSync
} from './icons.js';

let isRecording = false;
let isPausedRecording = false;
let audioSourceMode = 'mic';
let mediaStream = null;
let audioContext = null;
let analyserNode = null;
let vuAnimationId = null;
let chunkCycleInterval = null;
let timerInterval = null;
let lectureSeconds = 0;
let isSimulating = false;
let simulationInterval = null;
let activeRecorders = new Set();
let uploadQueue = Promise.resolve();

let latestAlertClusterId = null;
let latestCapsuleData = null;
let activeCapsuleTab = 'apunte';
let resetConfirmArmed = false;

let renderedFeedSignature = '';
let renderedEntryCache = new Map();

// DOM
const teacherCourseSelect = document.getElementById('teacherCourseSelect');
const btnOpenNewCourse = document.getElementById('btnOpenNewCourse');
const newCourseModal = document.getElementById('newCourseModal');
const btnCloseNewCourse = document.getElementById('btnCloseNewCourse');
const newCourseForm = document.getElementById('newCourseForm');

const audioSourceControl = document.getElementById('audioSourceControl');
const micStatusText = document.getElementById('micStatusText');
const micTimerDisplay = document.getElementById('micTimerDisplay');
const vuBar = document.getElementById('vuBar');

const heroControlsIdle = document.getElementById('heroControlsIdle');
const heroControlsLive = document.getElementById('heroControlsLive');
const btnStartClass = document.getElementById('btnStartClass');
const btnPauseMic = document.getElementById('btnPauseMic');
const btnEndClass = document.getElementById('btnEndClass');
const btnEndClassIdle = document.getElementById('btnEndClassIdle');

const chatModeControl = document.getElementById('chatModeControl');
const modeDescText = document.getElementById('modeDescText');
const checkComplement = document.getElementById('checkComplement');

const radarHeroBox = document.getElementById('radarHeroBox');
const radarHeroPill = document.getElementById('radarHeroPill');
const radarHeroContent = document.getElementById('radarHeroContent');
const radarHeroActions = document.getElementById('radarHeroActions');
const btnAlertResolve = document.getElementById('btnAlertResolve');
const btnAlertForTa = document.getElementById('btnAlertForTa');

const workspaceTabsControl = document.getElementById('workspaceTabsControl');
const workTabFeed = document.getElementById('workTabFeed');
const workTabSlides = document.getElementById('workTabSlides');
const workTabTa = document.getElementById('workTabTa');

const btnSimulateOneMin = document.getElementById('btnSimulateOneMin');
const btnResetLecture = document.getElementById('btnResetLecture');
const feedList = document.getElementById('feedList');
const feedEmptyState = document.getElementById('feedEmptyState');

const ucursosDeckLabel = document.getElementById('ucursosDeckLabel');
const ucursosSlidesList = document.getElementById('ucursosSlidesList');
const chaptersList = document.getElementById('chaptersList');
const addMaterialForm = document.getElementById('addMaterialForm');

const statWpm = document.getElementById('statWpm');
const statWords = document.getElementById('statWords');
const statLostCount = document.getElementById('statLostCount');
const clustersList = document.getElementById('clustersList');
const radarTotalBadge = document.getElementById('radarTotalBadge');
const btnDownloadTaGuide = document.getElementById('btnDownloadTaGuide');

// Modales
const btnShowQr = document.getElementById('btnShowQr');
const qrModal = document.getElementById('qrModal');
const btnCloseQr = document.getElementById('btnCloseQr');
const qrSvgContainer = document.getElementById('qrSvgContainer');
const qrUrlDisplay = document.getElementById('qrUrlDisplay');
const btnCopyStudentUrl = document.getElementById('btnCopyStudentUrl');

const btnOpenCapsule = document.getElementById('btnOpenCapsule');
const capsuleModal = document.getElementById('capsuleModal');
const capsuleTabsControl = document.getElementById('capsuleTabsControl');
const btnCloseCapsule = document.getElementById('btnCloseCapsule');
const capsuleBody = document.getElementById('capsuleBody');
const btnDownloadCapsule = document.getElementById('btnDownloadCapsule');

const btnOpenPrivacy = document.getElementById('btnOpenPrivacy');
const privacyModal = document.getElementById('privacyModal');
const btnClosePrivacy = document.getElementById('btnClosePrivacy');
const modalDeletedChunks = document.getElementById('modalDeletedChunks');
const modalTokenomicsLine = document.getElementById('modalTokenomicsLine');

const MODE_DESCRIPTIONS = {
  paused: 'Chat en pausa para atención 100% en pizarra. Las dudas se acumulan en el Radar.',
  active: 'En vivo: respuestas de 2–3 líneas + frase lista para preguntar en sala o Zoom.',
  full_ia: 'Full IA: respuestas completas y derivaciones sin restricción de longitud.'
};

async function initTeacher() {
  hydrateSvgIcons();
  await refreshCoursesDropdown();
  await fetchState();
  bindEvents();
  connectLiveStateSync(fetchState);
}

async function refreshCoursesDropdown(selectedId = null) {
  try {
    const data = await fetch('/api/courses').then(r => r.json());
    const targetId = selectedId || data.activeCourseId;
    teacherCourseSelect.innerHTML = '';
    (data.courses || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.code} — ${c.name}`;
      if (c.id === targetId) opt.selected = true;
      teacherCourseSelect.appendChild(opt);
    });
  } catch (_) {}
}

function bindEvents() {
  btnStartClass.addEventListener('click', startRecording);
  btnPauseMic.addEventListener('click', togglePauseRecording);
  btnEndClass.addEventListener('click', handleEndClassOneClick);
  btnEndClassIdle.addEventListener('click', handleEndClassOneClick);

  audioSourceControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRecording) {
        showToast('Detén la captura actual antes de cambiar de fuente.', 'warn');
        return;
      }
      audioSourceMode = btn.getAttribute('data-source');
      audioSourceControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active-source'));
      btn.classList.add('active-source');
      micStatusText.textContent = audioSourceMode === 'virtual'
        ? 'Listo para capturar audio de Zoom/Meet'
        : 'En espera para iniciar';
    });
  });

  workspaceTabsControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-worktab');
      workspaceTabsControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active-tab'));
      btn.classList.add('active-tab');
      workTabFeed.classList.toggle('active', tab === 'feed');
      workTabSlides.classList.toggle('active', tab === 'slides');
      workTabTa.classList.toggle('active', tab === 'ta');
    });
  });

  chatModeControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      setActiveModeUI(mode);
      updateTeacherSettings(mode);
    });
  });

  checkComplement.addEventListener('change', () => updateTeacherSettings());

  btnSimulateOneMin.addEventListener('click', toggleSimulatedLecture);

  btnResetLecture.addEventListener('click', async () => {
    if (!resetConfirmArmed) {
      resetConfirmArmed = true;
      btnResetLecture.innerHTML = `${icon('alert', 13)}<span>¿Confirmar?</span>`;
      setTimeout(() => {
        resetConfirmArmed = false;
        btnResetLecture.innerHTML = `${icon('trash', 13)}<span>Reiniciar</span>`;
      }, 3000);
      return;
    }
    resetConfirmArmed = false;
    btnResetLecture.innerHTML = `${icon('trash', 13)}<span>Reiniciar</span>`;
    await fetch('/api/live/reset', { method: 'POST' });
    lectureSeconds = 0;
    micTimerDisplay.textContent = '00:00';
    renderedFeedSignature = '';
    renderedEntryCache.clear();
    feedList.querySelectorAll('.feed-item').forEach(el => el.remove());
    feedEmptyState.style.display = 'block';
    showToast('Sesión reiniciada', 'success');
    fetchState();
  });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'p' || e.key === 'P') {
      const activeBtn = chatModeControl.querySelector('.seg-btn.active');
      const current = activeBtn ? activeBtn.getAttribute('data-mode') : 'active';
      const next = current === 'paused' ? 'active' : 'paused';
      setActiveModeUI(next);
      updateTeacherSettings(next);
      showToast(next === 'paused' ? 'Modo Pizarra activado' : 'Seguimiento reactivado');
    }
  });

  btnDownloadTaGuide.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/live/capsule');
      const data = await res.json();
      if (data.capsule) {
        downloadMarkdownFile(`Pauta_Auxiliar_${data.capsule.courseCode}.md`, data.capsule.taGuideMarkdown);
      }
    } catch (_) {
      showToast('No se pudo descargar la pauta', 'warn');
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
    renderedFeedSignature = '';
    renderedEntryCache.clear();
    feedList.querySelectorAll('.feed-item').forEach(el => el.remove());
    feedEmptyState.style.display = 'block';
    fetchState();
  });

  // Nueva asignatura modal
  btnOpenNewCourse.addEventListener('click', () => newCourseModal.classList.add('active'));
  btnCloseNewCourse.addEventListener('click', () => newCourseModal.classList.remove('active'));
  newCourseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      code: document.getElementById('ncCode').value.trim(),
      name: document.getElementById('ncName').value.trim(),
      instructor: document.getElementById('ncInstructor').value.trim() || 'Docente',
      slidesText: document.getElementById('ncSlidesText').value
    };
    const res = await fetch('/api/courses/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.course) {
      await refreshCoursesDropdown(data.course.id);
      newCourseModal.classList.remove('active');
      newCourseForm.reset();
      renderedFeedSignature = '';
      renderedEntryCache.clear();
      feedList.querySelectorAll('.feed-item').forEach(el => el.remove());
      feedEmptyState.style.display = 'block';
      showToast(`Sala creada para ${data.course.code}`, 'success');
      fetchState();
    }
  });

  // Agregar material rápido en sesión
  addMaterialForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('matTitleInput').value.trim();
    const content = document.getElementById('matContentInput').value.trim();
    if (!content) return;
    await fetch('/api/materials/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Material en Sesión', content })
    });
    addMaterialForm.reset();
    showToast('Material agregado al contexto del tutor', 'success');
  });

  btnAlertResolve.addEventListener('click', () => {
    if (latestAlertClusterId) handleClusterAction(latestAlertClusterId, 'resolved');
  });
  btnAlertForTa.addEventListener('click', () => {
    if (latestAlertClusterId) handleClusterAction(latestAlertClusterId, 'for_ta');
  });

  btnShowQr.addEventListener('click', async () => {
    const studentUrl = `${window.location.origin}/estudiante`;
    qrUrlDisplay.textContent = studentUrl;
    qrModal.classList.add('active');
    try {
      const svgText = await fetch(`/api/qr?url=${encodeURIComponent(studentUrl)}`).then(r => r.text());
      qrSvgContainer.innerHTML = svgText;
    } catch (_) {
      qrSvgContainer.textContent = studentUrl;
    }
  });
  btnCloseQr.addEventListener('click', () => qrModal.classList.remove('active'));
  btnCopyStudentUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(qrUrlDisplay.textContent);
      showToast('Enlace copiado para Zoom/Meet', 'success');
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
  capsuleTabsControl.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCapsuleTab = btn.getAttribute('data-tab');
      capsuleTabsControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active-source'));
      btn.classList.add('active-source');
      if (latestCapsuleData) renderCapsuleModal(latestCapsuleData);
    });
  });
  btnCloseCapsule.addEventListener('click', () => capsuleModal.classList.remove('active'));
  btnDownloadCapsule.addEventListener('click', () => {
    if (!latestCapsuleData) return;
    if (activeCapsuleTab === 'pauta') {
      downloadMarkdownFile(`Pauta_Auxiliar_${latestCapsuleData.courseCode}.md`, latestCapsuleData.taGuideMarkdown);
    } else if (activeCapsuleTab === 'insights') {
      const qa = latestCapsuleData.qaLog || { inClassQuestions: [], postClassQuestions: [] };
      const lines = [
        `# Data & Insights Docentes — ${latestCapsuleData.courseCode}: ${latestCapsuleData.courseName}`,
        '',
        `## Dudas Durante la Clase (${qa.inClassQuestions.length})`,
        ...qa.inClassQuestions.map(q => `- **[${q.timestamp}] (${q.topicLabel})** P: ${q.question}\n  - R: ${q.answerSummary}`),
        '',
        `## Estudio Post-Clase Full IA (${qa.postClassQuestions.length})`,
        ...qa.postClassQuestions.map(q => `- **[${q.timestamp}] (${q.topicLabel})** P: ${q.question}\n  - R: ${q.answerSummary}`)
      ].join('\n');
      downloadMarkdownFile(`Data_Insights_${latestCapsuleData.courseCode}.md`, lines);
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
  btnEndClass.disabled = true;
  btnEndClassIdle.disabled = true;
  try {
    const res = await fetch('/api/teacher/close-class', { method: 'POST' });
    const data = await res.json();
    await fetchState();
    showToast('Clase finalizada y Modo Post-Clase Full IA activado', 'success');
    if (data.capsule) {
      latestCapsuleData = data.capsule;
      activeCapsuleTab = 'apunte';
      renderCapsuleModal(data.capsule);
      capsuleModal.classList.add('active');
    }
  } catch (e) {
    showToast('Error al finalizar la clase: ' + e.message, 'warn');
  } finally {
    btnEndClass.disabled = false;
    btnEndClassIdle.disabled = false;
  }
}

async function updateTeacherSettings(forcedMode = null) {
  const activeBtn = chatModeControl.querySelector('.seg-btn.active');
  const currentMode = forcedMode || (activeBtn ? activeBtn.getAttribute('data-mode') : 'active');
  await fetch('/api/teacher/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatState: currentMode,
      allowComplement: checkComplement.checked
    })
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
    const state = await fetch('/api/live/state').then(r => r.json());
    const course = state.course;

    if (teacherCourseSelect.value !== course.id) {
      await refreshCoursesDropdown(course.id);
    }

    setActiveModeUI(state.teacherSettings.chatState || 'active');
    checkComplement.checked = state.teacherSettings.allowComplement;

    statWpm.textContent = `${state.pace.currentWpm} PPM`;
    statWords.textContent = state.pace.totalWords;
    statLostCount.textContent = state.lostCountTotal;

    renderUCursosSlides(course.ucursosSync, state.entries);
    renderChapters(state.chapters);
    renderTopicClusters(state.topicClusters || []);
    updateRadarHero(state.topicClusters || [], state.lostCountTotal);

    const tk = state.tokenomics || {};
    const deletedCount = tk.ephemeralChunksDeleted || 0;
    const savedTok = tk.prefixTokensSaved || 0;
    if (modalDeletedChunks) modalDeletedChunks.textContent = deletedCount;
    if (modalTokenomicsLine) {
      modalTokenomicsLine.textContent = `Prefix/Cache: ${savedTok.toLocaleString()} tok ahorrados (${tk.cacheHits || 0} hits) · GPU U: $${(tk.onPremCostUsd || 0).toFixed(4)} vs Cloud $${(tk.cloudCostUsd || 0).toFixed(4)}`;
    }

    renderFeedEntries(state.entries || []);

    if (!isRecording && (state.entries?.length > 0 || state.classClosed)) {
      btnEndClassIdle.className = 'btn btn-purple';
    } else {
      btnEndClassIdle.className = 'btn btn-outline';
    }
  } catch (err) {
    console.warn('Error sincronizando estado docente:', err);
  }
}

function updateRadarHero(clusters = [], lostTotal = 0) {
  const isCleared = (s) => s === 'resolved' || s === 'auto_resolved';
  const hotCluster = clusters.find(c => !isCleared(c.status) && (c.count >= 2 || c.escalatedCount >= 1 || c.lostCount >= 2));
  const target = hotCluster || (lostTotal >= 2 ? clusters.find(c => !isCleared(c.status)) : null);

  if (!target) {
    latestAlertClusterId = null;
    radarHeroBox.classList.remove('is-hot');
    radarHeroPill.className = 'conn-pill live';
    radarHeroPill.textContent = 'En sintonía';
    radarHeroContent.textContent = 'Sin cuellos de botella abiertos. Si varios alumnos marcan "Me perdí" o preguntan sobre un mismo punto, aparecerá aquí.';
    radarHeroActions.style.display = 'none';
    return;
  }

  latestAlertClusterId = target.id;
  radarHeroBox.classList.add('is-hot');
  radarHeroPill.className = 'conn-pill warn';
  radarHeroPill.textContent = `${target.count} señales`;
  radarHeroContent.innerHTML = `<strong style="color:var(--text);">${escapeHtml(target.label)}</strong><div style="margin-top:4px; font-size:12px;">${escapeHtml(target.suggestion)}</div>`;
  radarHeroActions.style.display = 'flex';
}

function renderUCursosSlides(ucursosSync, entries = []) {
  if (!ucursosSync || !ucursosSync.slides || ucursosSync.slides.length === 0) {
    ucursosDeckLabel.textContent = 'Sin PPT cargada — Pizarra Libre';
    ucursosSlidesList.innerHTML = '';
    return;
  }

  ucursosDeckLabel.textContent = ucursosSync.deckTitle || 'Material de clase';
  const lastWithSlide = [...entries].reverse().find(e => e.slideRef && e.slideRef.id);
  const activeSlideId = lastWithSlide ? lastWithSlide.slideRef.id : null;

  ucursosSlidesList.innerHTML = '';
  ucursosSync.slides.forEach(sl => {
    const count = entries.filter(e => e.slideRef && e.slideRef.id === sl.id).length;
    const row = document.createElement('div');
    row.className = `slide-pill-item ${activeSlideId === sl.id ? 'is-active' : ''}`;
    row.innerHTML = `
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <strong>L${sl.number}</strong> · ${escapeHtml(sl.title)}
      </span>
      <span class="tabular-nums" style="font-family:var(--font-mono); font-size:11px;">${count > 0 ? `${count} seg` : '—'}</span>
    `;
    ucursosSlidesList.appendChild(row);
  });
}

function renderChapters(chapters = []) {
  chaptersList.innerHTML = '';
  chapters.forEach(ch => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:7px 10px; background:var(--surface-2); border-radius:4px; border-left:2px solid #38BDF8; font-size:13px;';
    item.innerHTML = `<span class="feed-time">[${escapeHtml(ch.minute)}]</span> <span style="font-weight:600; margin-left:4px;">${escapeHtml(ch.title)}</span>`;
    chaptersList.appendChild(item);
  });
}

function renderTopicClusters(clusters = []) {
  const totalSignals = clusters.reduce((acc, c) => acc + c.count, 0);
  radarTotalBadge.textContent = `${totalSignals} señales`;

  if (!clusters || clusters.length === 0) {
    clustersList.innerHTML = `<div style="font-size:13px; color:var(--text-muted);">Las señales anónimas y dudas repetidas aparecerán agrupadas aquí.</div>`;
    return;
  }

  clustersList.innerHTML = '';
  clusters.forEach(c => {
    const isResolved = c.status === 'resolved' || c.status === 'auto_resolved';
    const card = document.createElement('div');
    card.className = `cluster-card ${isResolved ? 'is-resolved' : c.status === 'for_ta' ? 'is-ta' : ''}`;

    const lastQ = c.questions?.length ? c.questions[c.questions.length - 1] : null;
    const statusBadge = c.status === 'auto_resolved'
      ? `<span style="color:#6EE7B7;">Retomado [${escapeHtml(c.resolvedAt || '')}]</span>`
      : c.status === 'resolved'
      ? `<span style="color:#6EE7B7;">Aclarado</span>`
      : c.status === 'for_ta'
      ? `<span style="color:#DDD6FE;">Para Ayudantía</span>`
      : `<span style="color:#FCD34D;">×${c.count} señales</span>`;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:13px; font-weight:700;">
        <span>${escapeHtml(c.label)}</span>
        <span class="tabular-nums" style="font-size:12px;">${statusBadge}</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(c.suggestion)}</div>
      ${lastQ ? `<div style="font-size:12px; color:#CBD5E1; font-style:italic;">"${escapeHtml(lastQ)}"</div>` : ''}
      <div style="display:flex; gap:6px; margin-top:2px;">
        <button type="button" class="btn btn-outline btn-xs" data-act="resolved">Aclarado</button>
        <button type="button" class="btn btn-outline btn-xs" data-act="for_ta">Ayudantía</button>
      </div>
    `;

    card.querySelector('[data-act="resolved"]').addEventListener('click', () => handleClusterAction(c.id, 'resolved'));
    card.querySelector('[data-act="for_ta"]').addEventListener('click', () => handleClusterAction(c.id, 'for_ta'));
    clustersList.appendChild(card);
  });
}

function buildFeedItemElement(entry) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.id = `t-entry-${entry.id}`;
  updateFeedItemElement(item, entry);
  return item;
}

function updateFeedItemElement(item, entry) {
  let tagClass = 'tag-concept';
  let tagText = 'Concepto';
  if (entry.category === 'formula') { tagClass = 'tag-formula'; tagText = 'Fórmula'; }
  else if (entry.category === 'importancia') { tagClass = 'tag-emphasis'; tagText = 'Ojo Control'; }
  else if (entry.category === 'ejemplo') { tagClass = 'tag-example'; tagText = 'Ejemplo'; }

  const slideBadge = entry.slideRef ? `<span class="tag-badge tag-slide">Lám. ${entry.slideRef.number}</span>` : '';

  item.innerHTML = `
    <div class="feed-meta">
      <div>
        <span class="feed-time">[${escapeHtml(entry.timestamp)}]</span>
        <span style="color:var(--text-muted); margin-left:5px;">${escapeHtml(entry.speaker)}</span>
      </div>
      <div style="display:flex; gap:4px; align-items:center;">
        ${slideBadge}
        <span class="tag-badge ${tagClass}">${tagText}</span>
      </div>
    </div>
    <div style="font-size:13px; line-height:1.5;">${escapeHtml(entry.text)}</div>
  `;
}

function renderFeedEntries(entries) {
  const sig = entries.map(e => `${e.id}:${e.text.length}:${e.category}:${e.slideRef?.id || ''}`).join('|');
  if (sig === renderedFeedSignature) return;
  renderedFeedSignature = sig;

  const isNearBottom = (feedList.scrollHeight - feedList.scrollTop - feedList.clientHeight) < 90;

  if (entries.length === 0) {
    feedList.querySelectorAll('.feed-item').forEach(el => el.remove());
    renderedEntryCache.clear();
    feedEmptyState.style.display = 'block';
    return;
  }

  feedEmptyState.style.display = 'none';
  const desiredIds = new Set(entries.map(e => e.id));
  feedList.querySelectorAll('.feed-item').forEach(el => {
    const id = el.id.replace('t-entry-', '');
    if (!desiredIds.has(id)) {
      el.remove();
      renderedEntryCache.delete(id);
    }
  });

  let addedNew = false;
  entries.forEach(entry => {
    const entryHash = `${entry.text}|${entry.category}|${entry.slideRef?.id || ''}`;
    let el = document.getElementById(`t-entry-${entry.id}`);
    if (!el) {
      el = buildFeedItemElement(entry);
      feedList.appendChild(el);
      renderedEntryCache.set(entry.id, entryHash);
      addedNew = true;
    } else if (renderedEntryCache.get(entry.id) !== entryHash) {
      updateFeedItemElement(el, entry);
      renderedEntryCache.set(entry.id, entryHash);
    }
  });

  if (addedNew && window.renderMathInElement) {
    window.renderMathInElement(feedList, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
  }
  if (addedNew && isNearBottom) {
    feedList.scrollTop = feedList.scrollHeight;
  }
}

function renderCapsuleModal(capsule) {
  let html = '';

  if (activeCapsuleTab === 'insights') {
    const qa = capsule.qaLog || { totalValid: 0, inClassQuestions: [], postClassQuestions: [] };
    const longi = capsule.longitudinalInsights;

    const boldSafe = (str = '') => escapeHtml(str).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    let insHtml = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        <div style="background: var(--surface-2); border-left:3px solid var(--success); border-radius:6px; padding:10px 12px;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Consultas Durante la Clase</div>
          <div class="tabular-nums" style="font-size:20px; font-weight:800; color:#6EE7B7;">${qa.inClassQuestions.length} ${qa.inClassQuestions.length === 1 ? 'duda' : 'dudas'}</div>
          <div style="font-size:12px; color:var(--text-muted);">Guardadas anónimamente</div>
        </div>
        <div style="background: var(--surface-2); border-left:3px solid var(--purple); border-radius:6px; padding:10px 12px;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Estudio Post-Clase (Full IA)</div>
          <div class="tabular-nums" style="font-size:20px; font-weight:800; color:#DDD6FE;">${qa.postClassQuestions.length} ${qa.postClassQuestions.length === 1 ? 'consulta' : 'consultas'}</div>
          <div style="font-size:12px; color:var(--text-muted);">Tras cerrar la sesión</div>
        </div>
      </div>
    `;

    insHtml += `
      <div style="background: var(--surface-2); border-radius:6px; padding:10px 12px;">
        <strong style="color:#93C5FD;">Preguntas y Respuestas Recopiladas</strong>
        ${qa.totalValid === 0
          ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Aún no hay preguntas académicas registradas hoy.</div>`
          : `<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
              ${[
                ...qa.postClassQuestions.map(q => ({ ...q, badge: 'Post-Clase Full IA', bCol: '#DDD6FE' })),
                ...qa.inClassQuestions.map(q => ({ ...q, badge: q.chatMode === 'full_ia' ? 'En Vivo (Full IA)' : 'En Vivo', bCol: q.chatMode === 'full_ia' ? '#DDD6FE' : '#6EE7B7' }))
              ].map(q => `
                <div style="background:var(--bg); border-radius:6px; padding:8px 10px;">
                  <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
                    <span style="color:${q.bCol}; font-weight:700;">${q.badge} · ${escapeHtml(q.topicLabel)}</span>
                    <span class="tabular-nums" style="color:var(--text-muted);">[${escapeHtml(q.timestamp)}]</span>
                  </div>
                  <div style="font-weight:600; color:var(--text); font-size:13px;">P: "${escapeHtml(q.question)}"</div>
                  <div style="color:var(--text-muted); font-size:12px; margin-top:3px;">R: ${q.answerSummary ? boldSafe(q.answerSummary) : '(Modo Pizarra — enviada al Radar)'}</div>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    `;

    if (longi?.topBottlenecks) {
      insHtml += `
        <div style="background: rgba(59, 130, 246, 0.08); border-radius:6px; padding:10px 12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
            <strong style="color:#93C5FD;">Comparativa Longitudinal Inter-Semestral (Opcional)</strong>
            <span style="font-size:11px; color:var(--text-muted);">Base: ${(longi.semestersAnalyzed || []).map(escapeHtml).join(' + ')}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
            ${longi.topBottlenecks.map(b => `
              <div style="background:var(--surface); border-radius:6px; padding:8px 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:700;">
                  <span>${escapeHtml(b.topic)}</span>
                  <span class="tabular-nums" style="color:#FCD34D; font-size:12px;">En vivo: ${b.inClassPct}% · Post: ${b.postClassPct}%</span>
                </div>
                <div style="font-size:12px; color:#CBD5E1; margin-top:3px;">${escapeHtml(b.strategyTested)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    capsuleBody.innerHTML = insHtml;
    return;
  }

  if (activeCapsuleTab === 'pauta') {
    if (!capsule.taFocusPoints?.length) {
      capsuleBody.innerHTML = `<div style="color:var(--text-muted);">No hay puntos de refuerzo acumulados aún.</div>`;
      return;
    }
    capsuleBody.innerHTML = capsule.taFocusPoints.map((tp, idx) => `
      <div style="background: var(--surface-2); border-left: 3px solid var(--purple); border-radius: 6px; padding: 10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="color:#DDD6FE;">${idx + 1}. ${escapeHtml(tp.topic)}</strong>
          <span class="tabular-nums" style="font-size:12px; color:#FCD34D;">${tp.totalSignals} señales · ${tp.lostCount} "Me perdí"</span>
        </div>
        <div style="font-size:12px; color:#6EE7B7; margin-top:3px;">
          Estado: ${tp.status === 'auto_resolved' ? `Retomado oralmente [${escapeHtml(tp.resolvedAt || '')}]` : tp.status === 'resolved' ? 'Aclarado en pizarra' : tp.status === 'for_ta' ? 'Priorizado para Ayudantía' : 'Pendiente'}
        </div>
        <div style="font-size:13px; margin-top:4px;"><strong>Sugerencia:</strong> ${escapeHtml(tp.suggestion)}</div>
        ${tp.sampleQuestions?.length ? `<ul style="margin:4px 0 0 18px; font-size:12px; color:var(--text-muted);">${tp.sampleQuestions.map(q => `<li>"${escapeHtml(q)}"</li>`).join('')}</ul>` : ''}
      </div>
    `).join('');
    return;
  }

  if (capsule.teacherEmphasis?.length) {
    html += `
      <div style="background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--warning); border-radius: 6px; padding: 10px 12px;">
        <strong style="color:#FCD34D;">Avisos y Énfasis ("Ojo para el Control")</strong>
        <ul style="margin: 6px 0 0 18px;">
          ${capsule.teacherEmphasis.map(e => `<li><span class="feed-time">[${escapeHtml(e.timestamp)}]</span> ${escapeHtml(e.text)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  (capsule.slideBlocks || []).forEach(sb => {
    if (sb.spokenEntries.length === 0 && capsule.totalEntries > 0) return;
    html += `
      <div style="background: var(--surface-2); border-radius: 6px; padding: 10px 12px;">
        <div style="font-weight:700; color:#DDD6FE; margin-bottom:4px;">Lámina ${sb.slideNumber}: ${escapeHtml(sb.title)}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px; border-left:2px solid var(--border-default); padding-left:8px;">
          ${(sb.bulletPoints || []).map(bp => `• ${escapeHtml(bp)}`).join('<br>')}
        </div>
        ${sb.spokenEntries.length
          ? `<ul style="margin:4px 0 0 18px; font-size:13px;">${sb.spokenEntries.map(se => `<li><span class="feed-time">[${escapeHtml(se.timestamp)}]</span> ${escapeHtml(se.text)}</li>`).join('')}</ul>`
          : `<div style="font-size:12px; color:var(--text-dim);">Aún sin intervenciones asociadas.</div>`}
      </div>
    `;
  });

  if (capsule.unmappedEntries?.length) {
    html += `
      <div style="background: var(--surface-2); border-radius: 6px; padding: 10px 12px;">
        <strong style="color:#93C5FD;">Explicaciones de Pizarra Libre</strong>
        <ul style="margin: 6px 0 0 18px;">
          ${capsule.unmappedEntries.map(ue => `<li><span class="feed-time">[${escapeHtml(ue.timestamp)}]</span> ${escapeHtml(ue.text)}</li>`).join('')}
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

// ==========================================================================
// CAPTURA DE AUDIO CON OVERLAP ACÚSTICO DE 1.0s (CERO PALABRAS CORTADAS)
// ==========================================================================

function getBestAudioMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function launchOverlappingRecorder() {
  if (!isRecording || isPausedRecording || !mediaStream) return null;

  const mime = getBestAudioMimeType();
  const rec = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
  activeRecorders.add(rec);

  const chunks = [];
  const chunkStartSecond = lectureSeconds;

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  rec.onstop = () => {
    activeRecorders.delete(rec);
    if (chunks.length === 0) return;
    const blob = new Blob(chunks, { type: mime || 'audio/webm' });
    if (blob.size < 500) return;

    uploadQueue = uploadQueue
      .then(() => sendChunkToServer(blob, chunkStartSecond))
      .catch(err => console.warn('Error en cola de audio:', err));
  };

  rec.start(250);
  return rec;
}

async function startRecording() {
  try {
    micStatusText.textContent = 'Activando fuente de audio...';
    micStatusText.style.color = '#FCD34D';

    if (audioSourceMode === 'virtual') {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error('Debes marcar "Compartir audio de la pestaña" en Zoom/Meet.');
      }
      displayStream.getVideoTracks().forEach(t => t.stop());
      mediaStream = new MediaStream(audioTracks);
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    sourceNode.connect(analyserNode);

    isRecording = true;
    isPausedRecording = false;
    heroControlsIdle.style.display = 'none';
    heroControlsLive.style.display = 'grid';
    btnEndClassIdle.style.display = 'none';
    micStatusText.textContent = audioSourceMode === 'virtual' ? 'En vivo (Zoom/Meet)' : 'En vivo (Micrófono Sala)';
    micStatusText.style.color = '#6EE7B7';

    startVuMeter();
    timerInterval = setInterval(() => {
      if (isPausedRecording) return;
      lectureSeconds += 1;
      const m = Math.floor(lectureSeconds / 60);
      const s = Math.floor(lectureSeconds % 60);
      micTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);

    // Rotación cada 5.0s manteniendo 1.0s de overlap con el grabador previo
    let currentRec = launchOverlappingRecorder();
    chunkCycleInterval = setInterval(() => {
      if (!isRecording || isPausedRecording || !mediaStream) return;
      const finishingRec = currentRec;
      currentRec = launchOverlappingRecorder();
      if (finishingRec && finishingRec.state === 'recording') {
        setTimeout(() => {
          if (finishingRec.state === 'recording') {
            try { finishingRec.stop(); } catch (_) {}
          }
        }, 1000);
      }
    }, 5000);
  } catch (err) {
    micStatusText.textContent = 'En espera para iniciar';
    micStatusText.style.color = 'var(--text-muted)';
    showToast('No se pudo iniciar audio: ' + err.message, 'warn');
  }
}

function togglePauseRecording() {
  if (!isRecording) return;
  isPausedRecording = !isPausedRecording;
  if (isPausedRecording) {
    for (const rec of activeRecorders) {
      if (rec.state === 'recording') try { rec.stop(); } catch (_) {}
    }
    btnPauseMic.innerHTML = `${icon('play', 16)}<span>Reanudar</span>`;
    micStatusText.textContent = 'Captura en pausa';
    micStatusText.style.color = '#FCD34D';
  } else {
    launchOverlappingRecorder();
    btnPauseMic.innerHTML = `${icon('pause', 16)}<span>Pausar Audio</span>`;
    micStatusText.textContent = audioSourceMode === 'virtual' ? 'En vivo (Zoom/Meet)' : 'En vivo (Micrófono Sala)';
    micStatusText.style.color = '#6EE7B7';
  }
}

function stopRecording() {
  isRecording = false;
  isPausedRecording = false;
  heroControlsIdle.style.display = 'flex';
  heroControlsLive.style.display = 'none';
  btnEndClassIdle.style.display = 'inline-flex';
  micStatusText.textContent = 'Clase detenida';
  micStatusText.style.color = 'var(--text-muted)';

  if (chunkCycleInterval) { clearInterval(chunkCycleInterval); chunkCycleInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (vuAnimationId) { cancelAnimationFrame(vuAnimationId); vuAnimationId = null; }

  for (const rec of activeRecorders) {
    if (rec.state === 'recording') try { rec.stop(); } catch (_) {}
  }
  setTimeout(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  }, 300);

  if (audioContext && audioContext.state !== 'closed') audioContext.close();
  vuBar.style.width = '0%';
}

async function sendChunkToServer(audioBlob, currentSeconds) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'chunk.webm');
  formData.append('elapsedSeconds', currentSeconds);
  formData.append('isPrimarySpeaker', 'true');

  try {
    const res = await fetch('/api/live/audio-chunk', { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      if (data.entry) fetchState();
    }
  } catch (err) {
    console.warn('Error enviando chunk:', err);
  }
}

function startVuMeter() {
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
  function update() {
    if (!isRecording) return;
    if (!isPausedRecording) {
      analyserNode.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      vuBar.style.width = `${Math.min(100, Math.round((avg / 128) * 100))}%`;
    }
    vuAnimationId = requestAnimationFrame(update);
  }
  update();
}

function toggleSimulatedLecture() {
  if (isSimulating) stopSimulation();
  else startSimulation();
}

function startSimulation() {
  isSimulating = true;
  btnSimulateOneMin.innerHTML = `${icon('stop', 13)}<span>Detener Demo</span>`;
  btnSimulateOneMin.classList.add('btn-danger');
  micStatusText.textContent = 'Simulación de audio activa';
  micStatusText.style.color = '#38BDF8';

  let simSec = lectureSeconds;
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
      lectureSeconds = simSec;
      const m = Math.floor(simSec / 60);
      const s = Math.floor(simSec % 60);
      micTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      fetchState();
      if (simSec >= 56) stopSimulation();
    } catch (_) {}
  }

  step();
  simulationInterval = setInterval(step, 5500);
}

function stopSimulation() {
  isSimulating = false;
  btnSimulateOneMin.innerHTML = `${icon('play', 13)}<span>Simular Demo</span>`;
  btnSimulateOneMin.classList.remove('btn-danger');
  micStatusText.textContent = 'En espera para iniciar';
  micStatusText.style.color = 'var(--text-muted)';
  if (simulationInterval) clearInterval(simulationInterval);
}

window.addEventListener('DOMContentLoaded', initTeacher);
