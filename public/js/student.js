/**
 * Script del Estudiante V4:
 * - Sincronización SSE + diff incremental sin destruir selección ni scroll
 * - Memoria conversacional persistida en sessionStorage (envía últimos 2 turnos)
 * - Quote-Reply limpio sobre respuestas previas o fragmentos del profesor
 * - Navegación móvil 1-pulgar + diferenciación real En Vivo vs Post-Clase
 */

import {
  icon,
  hydrateSvgIcons,
  escapeHtml,
  formatMarkdownSafe,
  showToast,
  connectLiveStateSync
} from './icons.js';

let currentCourse = null;
let currentSettings = { chatState: 'active', allowComplement: true };
let currentEntries = [];
let currentClassClosed = false;
let currentIsActive = false;
let latestStudentCapsule = null;
let activeTranscriptFilter = 'all';
let lastKnownChatState = null;
let lastKnownClassClosed = null;

// Memoria conversacional, Dudas en Standby y Quote activa
let activeQuotedContext = null; // { type: 'assistant' | 'transcript', refId, label, text }
let conversationTurns = []; // [{ role: 'user' | 'assistant', text, quoteLabel, meta }]
let standbyDoubts = []; // [{ id, text, timestamp, anchorEntryId, anchorText, quotedContext }]

// Mapa de render incremental para el feed del profesor
let renderedFeedSignature = '';
let renderedEntryCache = new Map();

// DOM
const studentCourseTitle = document.getElementById('studentCourseTitle');
const studentCourseCode = document.getElementById('studentCourseCode');
const liveConnBadge = document.getElementById('liveConnBadge');
const liveConnText = document.getElementById('liveConnText');
const studentModeBadge = document.getElementById('studentModeBadge');
const ucursosStatusTag = document.getElementById('ucursosStatusTag');

const bridgeDetails = document.getElementById('bridgeDetails');
const bridgeSummaryText = document.getElementById('bridgeSummaryText');
const bridgeBody = document.getElementById('bridgeBody');
const transcriptFilterControl = document.getElementById('transcriptFilterControl');
const studentFeed = document.getElementById('studentFeed');
const studentEmptyState = document.getElementById('studentEmptyState');

const livePulseStrip = document.getElementById('livePulseStrip');
const postClassTranscriptBanner = document.getElementById('postClassTranscriptBanner');
const btnOpenPostClassCapsule = document.getElementById('btnOpenPostClassCapsule');
const btnLostSignal = document.getElementById('btnLostSignal');
const btnPulseFast = document.getElementById('btnPulseFast');
const btnPulseExample = document.getElementById('btnPulseExample');

const modeToastBanner = document.getElementById('modeToastBanner');
const whiteboardBanner = document.getElementById('whiteboardBanner');
const standbyDrawer = document.getElementById('standbyDrawer');
const standbySummaryText = document.getElementById('standbySummaryText');
const standbyStatusPill = document.getElementById('standbyStatusPill');
const standbyList = document.getElementById('standbyList');
const quickPromptChips = document.getElementById('quickPromptChips');
const chatMessages = document.getElementById('chatMessages');
const quoteComposerBar = document.getElementById('quoteComposerBar');
const quoteComposerText = document.getElementById('quoteComposerText');
const btnClearQuote = document.getElementById('btnClearQuote');
const studentChatForm = document.getElementById('studentChatForm');
const studentChatInput = document.getElementById('studentChatInput');
const btnSaveStandby = document.getElementById('btnSaveStandby');
const btnSendChatLabel = document.getElementById('btnSendChatLabel');

// Mobile bottom nav
const mobNavTranscript = document.getElementById('mobNavTranscript');
const mobNavChat = document.getElementById('mobNavChat');
const mobNavLost = document.getElementById('mobNavLost');
const panelTranscript = document.getElementById('panelTranscript');
const panelChat = document.getElementById('panelChat');

// Modals
const btnStudentCapsule = document.getElementById('btnStudentCapsule');
const studentCapsuleModal = document.getElementById('studentCapsuleModal');
const studentCapsuleBody = document.getElementById('studentCapsuleBody');
const btnStudentCloseCapsule = document.getElementById('btnStudentCloseCapsule');
const btnStudentDownloadCapsule = document.getElementById('btnStudentDownloadCapsule');
const btnStudentPrivacy = document.getElementById('btnStudentPrivacy');
const studentPrivacyModal = document.getElementById('studentPrivacyModal');
const btnStudentClosePrivacy = document.getElementById('btnStudentClosePrivacy');

const QUICK_PROMPTS = {
  macro: [
    { label: 'Curva IS', q: '¿Qué representa la curva IS y por qué tiene pendiente negativa?' },
    { label: 'Política Fiscal', q: '¿Qué ocurre con Y y r si aumenta el gasto público?' },
    { label: 'Multiplicador', q: '¿Cómo influye la propensión marginal a consumir en el multiplicador?' }
  ],
  probabilidades: [
    { label: 'Teorema de Bayes', q: '¿Cómo se define y cuándo se aplica el Teorema de Bayes?' },
    { label: 'Disjuntos vs Independientes', q: '¿Cuál es la diferencia entre eventos disjuntos e independientes?' },
    { label: 'Ejercicio Bayes', q: 'Con sensibilidad 95% y prevalencia 1%, ¿cómo planteo P(enfermo | +)?' }
  ],
  finanzas: [
    { label: 'Beta y CAPM', q: '¿Qué riesgo mide la beta bajo el CAPM y qué pasa con el riesgo idiosincrático?' },
    { label: 'WACC', q: '¿Para qué se usa el WACC al valorizar una empresa?' },
    { label: 'VAN vs TIR', q: '¿Por qué una TIR alta no siempre crea más valor que un buen VAN?' }
  ]
};

async function initStudent() {
  hydrateSvgIcons();
  bindUIEvents();
  await syncState();
  connectLiveStateSync(syncState);
}

function switchMobileTab(target) {
  if (target === 'transcript') {
    mobNavTranscript.classList.add('active');
    mobNavChat.classList.remove('active');
    panelTranscript.classList.remove('is-hidden-mobile');
    panelChat.classList.add('is-hidden-mobile');
  } else {
    mobNavChat.classList.add('active');
    mobNavTranscript.classList.remove('active');
    panelChat.classList.remove('is-hidden-mobile');
    panelTranscript.classList.add('is-hidden-mobile');
  }
}

async function sendStudentPulse(type, btnEl = null) {
  const lastEntry = currentEntries[currentEntries.length - 1];
  const timestamp = lastEntry ? lastEntry.timestamp : '00:00';
  if (btnEl) btnEl.disabled = true;

  try {
    await fetch('/api/live/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, timestamp })
    });
    const labels = {
      lost: 'Aviso "Me perdí" enviado anónimamente al Radar',
      fast: 'Señal de ritmo enviada al profesor',
      example: 'Pedido de ejemplo enviado al Radar'
    };
    showToast(labels[type] || 'Señal enviada', 'success');
  } catch (_) {
    showToast('No se pudo enviar la señal', 'warn');
  }

  if (btnEl) {
    setTimeout(() => { btnEl.disabled = false; }, 2500);
  }
}

function bindUIEvents() {
  mobNavTranscript.addEventListener('click', () => switchMobileTab('transcript'));
  mobNavChat.addEventListener('click', () => switchMobileTab('chat'));
  mobNavLost.addEventListener('click', () => sendStudentPulse('lost', mobNavLost));

  btnLostSignal.addEventListener('click', () => sendStudentPulse('lost', btnLostSignal));
  btnPulseFast.addEventListener('click', () => sendStudentPulse('fast', btnPulseFast));
  btnPulseExample.addEventListener('click', () => sendStudentPulse('example', btnPulseExample));

  transcriptFilterControl?.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTranscriptFilter = btn.getAttribute('data-filter');
      transcriptFilterControl.querySelectorAll('[data-filter]').forEach(b => {
        b.style.borderColor = 'var(--border-default)';
      });
      btn.style.borderColor = 'var(--primary)';
      renderedFeedSignature = '';
      renderTranscript();
    });
  });

  btnClearQuote.addEventListener('click', clearQuotedContext);
  studentChatForm.addEventListener('submit', (e) => handleChatSubmit(e));
  btnSaveStandby?.addEventListener('click', handleManualStandbyClick);

  const openCapsule = async () => {
    const res = await fetch('/api/live/capsule');
    const data = await res.json();
    if (data.capsule) {
      latestStudentCapsule = data.capsule;
      renderStudentCapsuleModal(data.capsule);
      studentCapsuleModal.classList.add('active');
    }
  };

  btnStudentCapsule.addEventListener('click', openCapsule);
  btnOpenPostClassCapsule?.addEventListener('click', openCapsule);
  btnStudentCloseCapsule.addEventListener('click', () => studentCapsuleModal.classList.remove('active'));
  btnStudentDownloadCapsule.addEventListener('click', () => {
    if (!latestStudentCapsule) return;
    let exportMd = latestStudentCapsule.markdownExport || '';
    if (standbyDoubts.length > 0) {
      const notesMd = standbyDoubts
        .map(d => `- **[${d.timestamp}]** ${d.text}${d.quotedContext ? ` *(citando: ${d.quotedContext.label})*` : ''}`)
        .join('\n');
      exportMd += `\n\n## Mis Dudas Anotadas Durante la Clase\n${notesMd}\n`;
    }
    const blob = new Blob([exportMd], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Apunte_Vivo_${latestStudentCapsule.courseCode}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  btnStudentPrivacy.addEventListener('click', () => studentPrivacyModal.classList.add('active'));
  btnStudentClosePrivacy.addEventListener('click', () => studentPrivacyModal.classList.remove('active'));
}

function setQuotedContext(quoteObj) {
  activeQuotedContext = quoteObj;
  const preview = (quoteObj.text || '').replace(/\s+/g, ' ').trim();
  const shortPreview = preview.length > 72 ? `${preview.slice(0, 69)}...` : preview;
  quoteComposerText.textContent = `Citando ${quoteObj.label}: "${shortPreview}"`;
  quoteComposerBar.classList.add('active');
  switchMobileTab('chat');
  studentChatInput.focus();
}

function clearQuotedContext() {
  activeQuotedContext = null;
  quoteComposerBar.classList.remove('active');
  quoteComposerText.textContent = '';
}

function getStorageKey(courseId) {
  return `catedra_v4_chat_${courseId}`;
}

function saveConversationHistory() {
  if (!currentCourse) return;
  try {
    sessionStorage.setItem(getStorageKey(currentCourse.id), JSON.stringify(conversationTurns.slice(-16)));
  } catch (_) {}
}

function restoreConversationHistory(courseId) {
  conversationTurns = [];
  chatMessages.querySelectorAll('[data-dynamic="true"]').forEach(n => n.remove());

  try {
    const saved = sessionStorage.getItem(getStorageKey(courseId));
    if (saved) {
      const items = JSON.parse(saved);
      if (Array.isArray(items) && items.length > 0) {
        conversationTurns = items;
        items.forEach(item => {
          if (item.role === 'user') {
            appendUserMessage(item.text, item.quoteLabel || null, false);
          } else {
            appendAssistantMessage(item.text, item.complement || null, {
              ...(item.meta || {}),
              skipPersist: true
            });
          }
        });
        quickPromptChips.style.display = 'none';
      }
    }
  } catch (_) {}
}

function getStandbyStorageKey(courseId) {
  return `catedra_v4_standby_${courseId}`;
}

function saveStandbyDoubts() {
  if (!currentCourse) return;
  try {
    sessionStorage.setItem(getStandbyStorageKey(currentCourse.id), JSON.stringify(standbyDoubts.slice(-25)));
  } catch (_) {}
}

function restoreStandbyDoubts(courseId) {
  standbyDoubts = [];
  try {
    const saved = sessionStorage.getItem(getStandbyStorageKey(courseId));
    if (saved) {
      const items = JSON.parse(saved);
      if (Array.isArray(items)) {
        standbyDoubts = items.filter(it => it && it.id && it.text);
      }
    }
  } catch (_) {}
  renderStandbyDrawer();
}

function addStandbyDoubt({ text, timestamp = '00:00', anchorEntryId = null, anchorText = null, quotedContext = null }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  const item = {
    id: `SB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: cleanText,
    timestamp,
    anchorEntryId,
    anchorText,
    quotedContext: quotedContext ? { ...quotedContext } : null
  };

  standbyDoubts.push(item);
  saveStandbyDoubts();
  renderStandbyDrawer();
  if (standbyDrawer) standbyDrawer.open = true;
  return item;
}

function renderStandbyDrawer() {
  if (!standbyDrawer || !standbyList) return;

  if (standbyDoubts.length === 0) {
    standbyDrawer.style.display = 'none';
    standbyList.innerHTML = '';
    return;
  }

  standbyDrawer.style.display = 'block';
  standbySummaryText.textContent = `Dudas anotadas (${standbyDoubts.length})`;

  const canResolveNow = currentClassClosed || currentSettings.chatState !== 'paused';
  standbyStatusPill.className = `standby-pill ${canResolveNow ? 'is-ready' : 'is-waiting'}`;
  standbyStatusPill.textContent = canResolveNow ? 'Listas para resolver' : 'En espera · Pizarra';

  standbyList.innerHTML = '';
  standbyDoubts.forEach(item => {
    const row = document.createElement('div');
    row.className = `standby-item ${canResolveNow ? 'is-ready' : ''}`;
    const quoteChip = item.quotedContext?.label
      ? `<span style="font-size:11px; color:var(--cite-color);">Sobre ${escapeHtml(item.quotedContext.label)}</span>`
      : '';

    row.innerHTML = `
      <div class="standby-item-meta">
        <button type="button" class="standby-time-btn" title="${item.anchorEntryId ? 'Ir a este minuto en la transcripción' : 'Minuto anotado'}">[${escapeHtml(item.timestamp || '00:00')}]</button>
        ${quoteChip}
      </div>
      <div class="standby-item-text">${escapeHtml(item.text)}</div>
      <div class="standby-item-actions">
        <button type="button" class="btn ${canResolveNow ? 'btn-primary' : 'btn-outline'} btn-xs btn-resolve-standby" ${canResolveNow ? '' : 'disabled'}>
          ${icon('send', 11)} <span>${canResolveNow ? 'Resolver ahora' : 'Esperando chat'}</span>
        </button>
        <button type="button" class="btn btn-ghost btn-xs btn-dismiss-standby">
          ${icon('check', 11)} <span>Ya entendí</span>
        </button>
      </div>
    `;

    row.querySelector('.standby-time-btn')?.addEventListener('click', () => {
      if (item.anchorEntryId) {
        highlightTranscriptSource(`entry-${item.anchorEntryId}`);
      }
    });

    const resolveBtn = row.querySelector('.btn-resolve-standby');
    resolveBtn?.addEventListener('click', () => resolveStandbyDoubt(item.id, resolveBtn));

    row.querySelector('.btn-dismiss-standby')?.addEventListener('click', () => {
      standbyDoubts = standbyDoubts.filter(d => d.id !== item.id);
      saveStandbyDoubts();
      renderStandbyDrawer();
      showToast('Duda descartada', 'info');
    });

    standbyList.appendChild(row);
  });
}

async function resolveStandbyDoubt(id, btnEl = null) {
  const item = standbyDoubts.find(d => d.id === id);
  if (!item) return;

  const canResolveNow = currentClassClosed || currentSettings.chatState !== 'paused';
  if (!canResolveNow) {
    showToast('El profesor aún está en Modo Pizarra.', 'warn');
    return;
  }

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = `${icon('clock', 11)} <span>Resolviendo...</span>`;
  }

  let contextForTutor = item.quotedContext || null;
  if (!contextForTutor && item.anchorText) {
    contextForTutor = {
      type: 'transcript',
      refId: item.anchorEntryId || null,
      label: `min ${item.timestamp || '00:00'}`,
      text: item.anchorText
    };
  }

  const resolvedOk = await handleChatSubmit(null, item.text, false, {
    overrideTime: item.timestamp || '00:00',
    overrideQuote: contextForTutor,
    appendUserBubble: true,
    fromStandby: true
  });

  if (resolvedOk) {
    standbyDoubts = standbyDoubts.filter(d => d.id !== id);
    saveStandbyDoubts();
    renderStandbyDrawer();
  } else {
    renderStandbyDrawer();
  }
}

function handleManualStandbyClick() {
  const q = studentChatInput.value.trim();
  if (!q) {
    showToast('Escribe una duda primero para anotarla en standby', 'warn');
    studentChatInput.focus();
    return;
  }

  const lastEntry = currentEntries[currentEntries.length - 1];
  const timestamp = lastEntry ? lastEntry.timestamp : '00:00';
  addStandbyDoubt({
    text: q,
    timestamp,
    anchorEntryId: lastEntry?.id || null,
    anchorText: lastEntry?.text || null,
    quotedContext: activeQuotedContext
  });

  studentChatInput.value = '';
  clearQuotedContext();
  showToast(`Duda anotada para después [${timestamp}]`, 'success');
}

async function syncState() {
  try {
    const res = await fetch('/api/live/state');
    const state = await res.json();
    currentSettings = state.teacherSettings || { chatState: 'active', allowComplement: true };
    currentEntries = state.entries || [];
    currentClassClosed = Boolean(state.classClosed);
    currentIsActive = Boolean(state.isActive);

    const courseChanged = !currentCourse || currentCourse.id !== state.course.id;
    const materialsChanged = Boolean(currentCourse) && (
      (currentCourse.ucursosSync?.slides?.length || 0) !== (state.course.ucursosSync?.slides?.length || 0) ||
      (currentCourse.ucursosSync?.deckTitle || '') !== (state.course.ucursosSync?.deckTitle || '') ||
      (currentCourse.materials?.length || 0) !== (state.course.materials?.length || 0)
    );

    if (courseChanged) {
      currentCourse = state.course;
      renderedFeedSignature = '';
      renderedEntryCache.clear();
      studentCourseTitle.textContent = currentCourse.name;
      studentCourseCode.textContent = `${currentCourse.code} · ${currentCourse.instructor}`;
      ucursosStatusTag.textContent = currentCourse.ucursosSync?.slides?.length
        ? `${currentCourse.ucursosSync.slides.length} láminas`
        : 'Pizarra Libre';
      renderBridge(currentCourse);
      renderQuickChips(currentCourse);
      restoreConversationHistory(currentCourse.id);
      restoreStandbyDoubts(currentCourse.id);
    } else if (materialsChanged) {
      currentCourse = state.course;
      renderedFeedSignature = '';
      ucursosStatusTag.textContent = currentCourse.ucursosSync?.slides?.length
        ? `${currentCourse.ucursosSync.slides.length} láminas`
        : 'Pizarra Libre';
    }

    updateConnectionAndModeUI(currentIsActive, currentSettings.chatState || 'active', currentClassClosed);
    renderTranscript();
  } catch (err) {
    console.warn('Error sincronizando estado del estudiante:', err);
  }
}

function updateConnectionAndModeUI(isLive, chatState, classClosed) {
  liveConnBadge.className = 'conn-pill';
  studentModeBadge.className = 'conn-pill';
  const compactTopbar = window.innerWidth <= 520;
  const isPausedLive = !classClosed && chatState === 'paused';

  if (btnSendChatLabel) {
    btnSendChatLabel.textContent = isPausedLive ? 'Anotar' : 'Preguntar';
  }
  if (btnSaveStandby) {
    btnSaveStandby.style.display = isPausedLive ? 'none' : 'inline-flex';
  }

  if (classClosed) {
    liveConnBadge.classList.add('full-ia');
    liveConnText.textContent = compactTopbar ? 'Post-Clase' : 'Post-Clase · Full IA';
    studentModeBadge.classList.add('full-ia');
    studentModeBadge.textContent = 'Full IA · Post-Clase';
    whiteboardBanner.style.display = 'none';
    studentChatInput.placeholder = 'Estudio Post-Clase: pregunta o cita cualquier paso...';
    livePulseStrip.style.display = 'none';
    postClassTranscriptBanner.style.display = 'flex';
  } else if (chatState === 'paused') {
    liveConnBadge.classList.add('warn');
    liveConnText.textContent = compactTopbar ? 'Pizarra' : 'En vivo · Pizarra';
    studentModeBadge.classList.add('warn');
    studentModeBadge.textContent = 'Pizarra (Pausado)';
    whiteboardBanner.style.display = 'flex';
    studentChatInput.placeholder = 'Anota tu duda para después (también suma al Radar)...';
    livePulseStrip.style.display = 'grid';
    postClassTranscriptBanner.style.display = 'none';
  } else if (chatState === 'full_ia') {
    liveConnBadge.classList.add('full-ia');
    liveConnText.textContent = compactTopbar ? 'Full IA' : (isLive ? 'En vivo · Full IA' : 'Full IA');
    studentModeBadge.classList.add('full-ia');
    studentModeBadge.textContent = 'Full IA · Completo';
    whiteboardBanner.style.display = 'none';
    studentChatInput.placeholder = 'Full IA habilitado: pide explicaciones completas...';
    livePulseStrip.style.display = 'grid';
    postClassTranscriptBanner.style.display = 'none';
  } else if (isLive) {
    liveConnBadge.classList.add('live');
    liveConnText.textContent = compactTopbar ? 'En vivo' : 'En vivo · Seguimiento';
    studentModeBadge.textContent = 'Seguimiento · Breve';
    whiteboardBanner.style.display = 'none';
    studentChatInput.placeholder = 'Pregunta rápida sobre la clase o cualquier duda...';
    livePulseStrip.style.display = 'grid';
    postClassTranscriptBanner.style.display = 'none';
  } else {
    liveConnBadge.classList.add('waiting');
    liveConnText.textContent = 'En espera';
    studentModeBadge.textContent = 'Seguimiento · Breve';
    whiteboardBanner.style.display = 'none';
    studentChatInput.placeholder = 'Escribe tu duda sobre el ramo...';
    livePulseStrip.style.display = 'grid';
    postClassTranscriptBanner.style.display = 'none';
  }

  renderStandbyDrawer();

  const unlockedFromPaused = lastKnownChatState === 'paused' && !lastKnownClassClosed && (classClosed || chatState !== 'paused');
  if (unlockedFromPaused && standbyDoubts.length > 0 && standbyDrawer) {
    standbyDrawer.open = true;
  }

  const standbyHint = (unlockedFromPaused && standbyDoubts.length > 0)
    ? ` Tienes ${standbyDoubts.length} duda(s) anotada(s) listas para resolver.`
    : '';

  if (lastKnownChatState !== null && (lastKnownChatState !== chatState || lastKnownClassClosed !== classClosed)) {
    if (classClosed && !lastKnownClassClosed) {
      modeToastBanner.textContent = `Clase finalizada. Ya puedes usar Full IA para estudiar en detalle o abrir el Apunte Vivo.${standbyHint}`;
      modeToastBanner.style.display = 'block';
    } else if (chatState === 'full_ia' && lastKnownChatState !== 'full_ia') {
      modeToastBanner.textContent = `El profesor habilitó Full IA en la sala para explicaciones completas.${standbyHint}`;
      modeToastBanner.style.display = 'block';
      setTimeout(() => { modeToastBanner.style.display = 'none'; }, standbyDoubts.length > 0 ? 7000 : 4500);
    } else if (chatState === 'active' && lastKnownChatState === 'paused') {
      modeToastBanner.textContent = `Chat reactivado en Modo Seguimiento.${standbyHint}`;
      modeToastBanner.style.display = 'block';
      setTimeout(() => { modeToastBanner.style.display = 'none'; }, standbyDoubts.length > 0 ? 7000 : 3500);
    } else {
      modeToastBanner.style.display = 'none';
    }
  }
  lastKnownChatState = chatState;
  lastKnownClassClosed = classClosed;
}

function renderBridge(course) {
  const lastClass = course.historicalClasses?.length
    ? course.historicalClasses[course.historicalClasses.length - 1]
    : null;
  const firstMat = course.materials?.length ? course.materials[0] : null;

  if (!lastClass && !firstMat) {
    bridgeDetails.style.display = 'none';
    return;
  }
  bridgeDetails.style.display = 'block';
  bridgeSummaryText.textContent = lastClass
    ? `Puente: ${lastClass.title}`
    : `Material: ${firstMat.title}`;

  let html = '';
  if (lastClass) {
    html += `<p>${escapeHtml(lastClass.summary)}</p>`;
    if (lastClass.keyFormulas?.length) {
      html += `<div style="color: #6EE7B7; font-family: var(--font-mono); margin-top: 6px;">${lastClass.keyFormulas.map(f => `$${escapeHtml(f)}$`).join(' · ')}</div>`;
    }
  }
  if (firstMat) {
    html += `<p style="margin-top:6px;"><strong>${escapeHtml(firstMat.title)}:</strong> ${escapeHtml(firstMat.content)}</p>`;
  }
  bridgeBody.innerHTML = html;

  if (window.renderMathInElement) {
    window.renderMathInElement(bridgeBody, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
  }
}

function renderQuickChips(course) {
  quickPromptChips.innerHTML = '';
  quickPromptChips.style.display = conversationTurns.length > 0 ? 'none' : 'flex';

  const list = QUICK_PROMPTS[course.id] || (course.ucursosSync?.slides || []).slice(0, 3).map(s => ({
    label: s.title,
    q: `Explícame en breve qué cubre "${s.title}"`
  }));

  list.forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-btn';
    chip.textContent = item.label;
    chip.addEventListener('click', () => {
      studentChatInput.value = item.q;
      studentChatInput.focus();
    });
    quickPromptChips.appendChild(chip);
  });
}

function createTranscriptCard(entry) {
  const card = document.createElement('div');
  card.className = 'feed-item';
  card.id = `entry-${entry.id}`;
  updateTranscriptCard(card, entry);
  return card;
}

function updateTranscriptCard(card, entry) {
  let tagClass = 'tag-concept';
  let tagText = 'Concepto';
  if (entry.category === 'formula') { tagClass = 'tag-formula'; tagText = 'Fórmula'; }
  else if (entry.category === 'importancia') { tagClass = 'tag-emphasis'; tagText = 'Ojo Control'; }
  else if (entry.category === 'ejemplo') { tagClass = 'tag-example'; tagText = 'Ejemplo'; }

  const slideBadge = entry.slideRef
    ? `<button type="button" class="tag-badge tag-slide slide-open-btn" data-slide="${entry.slideRef.number}">Lám. ${entry.slideRef.number}</button>`
    : '';

  card.innerHTML = `
    <div class="feed-meta">
      <div>
        <span class="feed-time">[${escapeHtml(entry.timestamp)}]</span>
        <span style="color: var(--text-muted); margin-left: 5px;">${escapeHtml(entry.speaker)}</span>
      </div>
      <div style="display:flex; gap:4px; align-items:center;">
        ${slideBadge}
        <span class="tag-badge ${tagClass}">${tagText}</span>
      </div>
    </div>
    <div style="font-size: 13px; line-height: 1.5; color: var(--text);">${escapeHtml(entry.text)}</div>
  `;

  const slideBtn = card.querySelector('.slide-open-btn');
  if (slideBtn) {
    slideBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openCapsuleAtSlide(parseInt(slideBtn.getAttribute('data-slide'), 10));
    });
  }

  card.onclick = () => {
    setQuotedContext({
      type: 'transcript',
      refId: entry.id,
      label: `Min ${entry.timestamp}`,
      text: entry.text
    });
  };
}

function renderTranscript() {
  const filtered = currentEntries.filter(e => activeTranscriptFilter === 'all' || e.category === activeTranscriptFilter);
  const sig = `${activeTranscriptFilter}|${filtered.map(e => `${e.id}:${e.text.length}:${e.category}:${e.slideRef?.id || ''}`).join(',')}`;
  if (sig === renderedFeedSignature) return;
  renderedFeedSignature = sig;

  const isNearBottom = (studentFeed.scrollHeight - studentFeed.scrollTop - studentFeed.clientHeight) < 80;

  if (filtered.length === 0) {
    studentFeed.querySelectorAll('.feed-item, .empty-filter-note').forEach(el => el.remove());
    renderedEntryCache.clear();
    if (currentEntries.length > 0) {
      const note = document.createElement('div');
      note.className = 'empty-filter-note';
      note.style.cssText = 'text-align:center; padding:2.5rem 1rem; color:var(--text-muted); font-size:13px;';
      note.innerHTML = 'No hay segmentos con este filtro todavía. Pulsa <strong>Todo</strong> para ver la clase completa.';
      studentEmptyState.style.display = 'none';
      studentFeed.appendChild(note);
    } else {
      studentEmptyState.style.display = 'block';
    }
    return;
  }

  studentEmptyState.style.display = 'none';
  studentFeed.querySelectorAll('.empty-filter-note').forEach(el => el.remove());

  const desiredIds = new Set(filtered.map(e => e.id));
  studentFeed.querySelectorAll('.feed-item').forEach(el => {
    const id = el.id.replace('entry-', '');
    if (!desiredIds.has(id)) {
      el.remove();
      renderedEntryCache.delete(id);
    }
  });

  let addedNew = false;
  filtered.forEach(entry => {
    const entryHash = `${entry.text}|${entry.category}|${entry.slideRef?.id || ''}`;
    let card = document.getElementById(`entry-${entry.id}`);
    if (!card) {
      card = createTranscriptCard(entry);
      studentFeed.appendChild(card);
      renderedEntryCache.set(entry.id, entryHash);
      addedNew = true;
    } else if (renderedEntryCache.get(entry.id) !== entryHash) {
      updateTranscriptCard(card, entry);
      renderedEntryCache.set(entry.id, entryHash);
    }
  });

  if (addedNew && window.renderMathInElement) {
    window.renderMathInElement(studentFeed, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
  }
  if (addedNew && isNearBottom) {
    studentFeed.scrollTop = studentFeed.scrollHeight;
  }
}

async function handleChatSubmit(e, customQuestion = null, bypassCache = false, extraOpts = {}) {
  if (e) e.preventDefault();
  const q = (customQuestion || studentChatInput.value).trim();
  if (!q) return false;

  const lastEntry = currentEntries[currentEntries.length - 1];
  const currentTime = extraOpts.overrideTime || (lastEntry ? lastEntry.timestamp : '00:00');
  const quoteToSend = extraOpts.overrideQuote !== undefined
    ? extraOpts.overrideQuote
    : (customQuestion ? null : activeQuotedContext);
  const quoteLabel = quoteToSend ? quoteToSend.label : null;

  const isPausedLive = !currentClassClosed && currentSettings.chatState === 'paused';
  if (isPausedLive && !extraOpts.fromStandby) {
    if (!customQuestion) {
      studentChatInput.value = '';
      clearQuotedContext();
    }
    addStandbyDoubt({
      text: q,
      timestamp: currentTime,
      anchorEntryId: lastEntry?.id || null,
      anchorText: lastEntry?.text || null,
      quotedContext: quoteToSend
    });
    showToast(`Duda anotada en standby [${currentTime}] y enviada al Radar`, 'success');
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, currentTimeFormatted: currentTime, quotedContext: quoteToSend })
    }).catch(() => {});
    return false;
  }

  if (!customQuestion || extraOpts.appendUserBubble) {
    if (!customQuestion) {
      studentChatInput.value = '';
      clearQuotedContext();
    }
    appendUserMessage(q, quoteLabel, true);
  }

  quickPromptChips.style.display = 'none';
  const loadingBubble = appendAssistantLoading(bypassCache);

  // Enviar máximo últimos 4 mensajes previos (2 turnos) para mantener contexto sin inflar TPM
  const historyToSend = conversationTurns.slice(0, -1).slice(-4).map(t => ({
    role: t.role,
    text: t.text
  }));

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        currentTimeFormatted: currentTime,
        bypassCache,
        quotedContext: quoteToSend,
        chatHistory: historyToSend
      })
    });

    const data = await res.json();
    loadingBubble.remove();

    if (data.status === 'paused') {
      if (!extraOpts.fromStandby) {
        addStandbyDoubt({
          text: q,
          timestamp: currentTime,
          anchorEntryId: lastEntry?.id || null,
          anchorText: lastEntry?.text || null,
          quotedContext: quoteToSend
        });
        showToast(`Modo Pizarra activo: duda guardada en standby [${currentTime}]`, 'warn');
      }
      return false;
    } else if (res.ok) {
      appendAssistantMessage(data.answer, data.complement, {
        chatMode: data.chatMode,
        questionType: data.questionType,
        canForwardToTeacher: data.canForwardToTeacher,
        voicePrompt: data.voicePrompt,
        fromCache: data.fromCache,
        clusterCount: data.clusterCount,
        clusterLabel: data.clusterLabel,
        questionId: data.questionId,
        originalQuestion: q,
        currentTime
      });
      return true;
    } else {
      appendAssistantMessage(`Error: ${data.error || 'No se pudo obtener respuesta.'}`, null, { skipPersist: true });
      return false;
    }
  } catch (_) {
    loadingBubble.remove();
    appendAssistantMessage('Error de conexión con la sala.', null, { skipPersist: true });
    return false;
  }
}

function appendUserMessage(text, quoteLabel = null, shouldPersist = true) {
  const row = document.createElement('div');
  row.className = 'msg-row msg-user';
  row.setAttribute('data-dynamic', 'true');
  row.innerHTML = `${quoteLabel ? `<div class="msg-user-quote">Sobre ${escapeHtml(quoteLabel)}</div>` : ''}<div>${escapeHtml(text)}</div>`;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (shouldPersist) {
    conversationTurns.push({ role: 'user', text, quoteLabel });
    saveConversationHistory();
  }
}

function appendAssistantLoading(bypassCache = false) {
  const row = document.createElement('div');
  row.className = 'msg-row msg-assistant';
  row.innerHTML = `
    <div class="msg-meta">
      <span style="font-weight: 700; color: #C4B5FD;">CO-PILOTO DE AULA</span>
      <span>${bypassCache ? 'Buscando otro enfoque...' : 'Conectando fuentes...'}</span>
    </div>
    <div style="color: var(--text-muted); font-size: 13px; display:flex; align-items:center; gap:6px;">
      <span class="dot-pulse"></span>
      <span>Revisando clase en vivo y material del curso...</span>
    </div>
  `;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
}

function formatAnswerWithCitations(text) {
  let html = formatMarkdownSafe(text);

  html = html.replace(/\[VIVO-(\d+)\]/g, (_, p1) => {
    const idx = parseInt(p1, 10) - 1;
    const entry = currentEntries[idx];
    const label = entry ? `min ${escapeHtml(entry.timestamp)}` : `min ${p1}`;
    return `<button type="button" class="cite-chip" data-target="entry-VIVO-${p1}">Min ${label.replace('min ', '')}</button>`;
  });

  html = html.replace(/\[SLIDE-(\d+)\]/g, (_, p1) => {
    return `<button type="button" class="cite-chip" data-target="slide-${p1}">Lám. ${p1}</button>`;
  });

  html = html.replace(/\[HIST-([A-Z0-9]+)\]/g, () => {
    return `<button type="button" class="cite-chip" data-target="bridgeDetails">Clase Anterior</button>`;
  });

  html = html.replace(/\[MAT-([A-Z0-9]+)\]/g, () => {
    return `<button type="button" class="cite-chip" data-target="bridgeDetails">Material</button>`;
  });

  return html;
}

function appendAssistantMessage(answerText, complementText = null, options = {}) {
  const {
    isPaused = false,
    chatMode = 'active',
    questionType = 'grounded',
    canForwardToTeacher = false,
    voicePrompt = null,
    fromCache = false,
    clusterCount = 0,
    clusterLabel = '',
    questionId = null,
    originalQuestion = '',
    currentTime = '00:00',
    skipPersist = false
  } = options;

  const row = document.createElement('div');
  row.className = 'msg-row msg-assistant';
  row.setAttribute('data-dynamic', 'true');

  if (questionType === 'off_topic') row.style.borderLeft = '3px solid var(--danger)';
  else if (questionType === 'unseen_academic') row.style.borderLeft = '3px solid var(--warning)';
  else if (chatMode === 'full_ia') row.style.borderLeft = '3px solid var(--purple)';

  const formattedHtml = formatAnswerWithCitations(answerText);

  const complementHtml = (complementText && questionType !== 'off_topic')
    ? `<div class="complement-note"><strong>Contexto adicional:</strong> ${formatMarkdownSafe(complementText)}</div>`
    : '';

  const voicePromptHtml = (voicePrompt && questionType !== 'off_topic')
    ? `<div class="voice-prompt-box">
         <div class="voice-prompt-header">
           <span class="voice-prompt-label">${icon('mic', 13)} Para preguntar en sala / Zoom</span>
           <button type="button" class="btn btn-ghost btn-xs btn-copy-voice">${icon('copy', 12)} <span>Copiar</span></button>
         </div>
         <div class="voice-prompt-text">"${escapeHtml(voicePrompt)}"</div>
       </div>`
    : '';

  const peerHint = (clusterCount >= 2 && questionType !== 'off_topic')
    ? `<div style="margin-top:6px; font-size:12px; color:#FCD34D;">${clusterCount} compañeros están preguntando sobre "${escapeHtml(clusterLabel)}".</div>`
    : '';

  const actions = [];
  if (!isPaused && questionType !== 'off_topic') {
    actions.push(`<button type="button" class="btn btn-ghost btn-xs btn-quote-reply">${icon('quote', 12)} <span>Citar</span></button>`);
  }
  if (canForwardToTeacher && questionType !== 'off_topic' && !isPaused && !currentClassClosed) {
    actions.push(`<button type="button" class="btn btn-ghost btn-xs btn-forward-teacher" style="color:#FCD34D;">${icon('radar', 12)} <span>Al Radar</span></button>`);
  }
  if (fromCache && originalQuestion && !isPaused) {
    actions.push(`<button type="button" class="btn btn-ghost btn-xs btn-alt-angle" style="color:var(--cite-color);">${icon('refresh', 12)} <span>Otro ángulo</span></button>`);
  }
  const actionsHtml = actions.length > 0 ? `<div class="msg-actions-bar">${actions.join('')}</div>` : '';

  const headerColor = isPaused
    ? '#FCD34D'
    : (questionType === 'off_topic'
      ? '#FCA5A5'
      : questionType === 'unseen_academic'
      ? '#FCD34D'
      : chatMode === 'full_ia'
      ? '#DDD6FE'
      : '#6EE7B7');
  const headerTitle = isPaused
    ? 'MODO PIZARRA'
    : (questionType === 'off_topic'
      ? 'ALCANCE'
      : questionType === 'unseen_academic'
      ? (chatMode === 'full_ia' ? 'AÚN NO VISTO · FULL IA' : 'AÚN NO VISTO HOY')
      : chatMode === 'full_ia'
      ? 'TUTOR FULL IA'
      : 'CO-PILOTO EN VIVO');
  const cachePill = fromCache ? `<span style="font-size:11px; color:var(--cite-color); font-weight:600;">· Caché</span>` : '';

  row.innerHTML = `
    <div class="msg-meta">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-weight:700; color:${headerColor};">${headerTitle}</span>
        ${cachePill}
      </div>
      <span class="tabular-nums">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div style="font-size: 14px; line-height: 1.55;">${formattedHtml}</div>
    ${complementHtml}
    ${voicePromptHtml}
    ${peerHint}
    ${actionsHtml}
  `;

  row.querySelectorAll('.cite-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target && target.startsWith('slide-')) {
        openCapsuleAtSlide(parseInt(target.replace('slide-', ''), 10));
      } else if (target === 'bridgeDetails') {
        switchMobileTab('transcript');
        bridgeDetails.open = true;
        bridgeDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        highlightTranscriptSource(target);
      }
    });
  });

  row.querySelector('.btn-copy-voice')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(voicePrompt);
      showToast('Pregunta copiada para Zoom/Meet', 'success');
    } catch (_) {}
  });

  row.querySelector('.btn-quote-reply')?.addEventListener('click', () => {
    setQuotedContext({
      type: 'assistant',
      refId: questionId,
      label: 'Respuesta del Tutor',
      text: answerText
    });
  });

  const forwardBtn = row.querySelector('.btn-forward-teacher');
  forwardBtn?.addEventListener('click', async () => {
    forwardBtn.disabled = true;
    try {
      await fetch('/api/live/forward-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: originalQuestion, timestamp: currentTime, questionId })
      });
      forwardBtn.innerHTML = `${icon('check', 12)} <span>En el Radar</span>`;
      showToast('Duda enviada al Radar anónimo del profesor', 'success');
    } catch (_) {
      forwardBtn.disabled = false;
    }
  });

  const altBtn = row.querySelector('.btn-alt-angle');
  altBtn?.addEventListener('click', () => {
    altBtn.disabled = true;
    handleChatSubmit(null, originalQuestion, true);
  });

  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (window.renderMathInElement) {
    window.renderMathInElement(row, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  }

  if (!skipPersist) {
    conversationTurns.push({
      role: 'assistant',
      text: answerText,
      complement: complementText,
      meta: { isPaused, chatMode, questionType, canForwardToTeacher, voicePrompt, fromCache, clusterCount, clusterLabel, questionId, originalQuestion, currentTime }
    });
    saveConversationHistory();
  }
}

function highlightTranscriptSource(targetId) {
  switchMobileTab('transcript');
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-flash');
    setTimeout(() => el.classList.remove('highlight-flash'), 1800);
  }
}

async function openCapsuleAtSlide(slideNumber) {
  const res = await fetch('/api/live/capsule');
  const data = await res.json();
  if (data.capsule) {
    latestStudentCapsule = data.capsule;
    renderStudentCapsuleModal(data.capsule, slideNumber);
    studentCapsuleModal.classList.add('active');
    const targetCard = document.getElementById(`capsule-slide-${slideNumber}`);
    if (targetCard) {
      setTimeout(() => targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
  }
}

function renderStudentCapsuleModal(capsule, focusSlideNumber = null) {
  let html = '';

  if (capsule.teacherEmphasis?.length) {
    html += `
      <div style="background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--warning); border-radius: 6px; padding: 10px 12px;">
        <strong style="color:#FCD34D;">Avisos del Profesor (Ojo Control)</strong>
        <ul style="margin: 6px 0 0 18px; color:var(--text);">
          ${capsule.teacherEmphasis.map(e => `<li><span class="feed-time">[${escapeHtml(e.timestamp)}]</span> ${escapeHtml(e.text)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  (capsule.slideBlocks || []).forEach(sb => {
    const isFocused = focusSlideNumber === sb.slideNumber;
    if (!isFocused && sb.spokenEntries.length === 0 && capsule.totalEntries > 0) return;
    html += `
      <div id="capsule-slide-${sb.slideNumber}" style="background: var(--surface-2); border: 1px solid ${isFocused ? '#8B5CF6' : 'var(--border-subtle)'}; border-radius: 6px; padding: 10px 12px;">
        <div style="font-weight:700; color:#DDD6FE; margin-bottom:4px;">Lámina ${sb.slideNumber}: ${escapeHtml(sb.title)}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px; border-left:2px solid var(--border-default); padding-left:8px;">
          ${(sb.bulletPoints || []).map(bp => `• ${escapeHtml(bp)}`).join('<br>')}
        </div>
        ${sb.spokenEntries.length > 0
          ? `<div style="font-size:13px;"><strong>Explicación oral:</strong><ul style="margin:4px 0 0 18px;">${sb.spokenEntries.map(se => `<li><span class="feed-time">[${escapeHtml(se.timestamp)}]</span> ${escapeHtml(se.text)}</li>`).join('')}</ul></div>`
          : `<div style="font-size:12px; color:var(--text-dim);">Aún sin intervenciones asociadas a esta lámina.</div>`
        }
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

  studentCapsuleBody.innerHTML = html || `<div style="color:var(--text-muted);">Aún no hay apuntes registrados en la sesión de hoy.</div>`;
}

window.addEventListener('DOMContentLoaded', initStudent);
