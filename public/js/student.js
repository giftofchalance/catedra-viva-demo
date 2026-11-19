/**
 * Script del Estudiante en el Aula (Cátedra Viva V3)
 */

let currentCourse = null;
let currentSettings = { chatState: 'active', allowComplement: true, hideDigressions: false };
let currentEntries = [];
let fontScale = 1;
let latestStudentCapsule = null;
let activeTranscriptFilter = 'all'; // 'all' | 'importancia' | 'formula'
let lastKnownChatState = 'active';

// DOM Elements
const studentCourseTitle = document.getElementById('studentCourseTitle');
const studentCourseCode = document.getElementById('studentCourseCode');
const liveConnBadge = document.getElementById('liveConnBadge');
const liveConnText = document.getElementById('liveConnText');
const studentModeBadge = document.getElementById('studentModeBadge');
const ucursosStatusTag = document.getElementById('ucursosStatusTag');

const bridgeDetails = document.getElementById('bridgeDetails');
const bridgeSummaryText = document.getElementById('bridgeSummaryText');
const bridgeBody = document.getElementById('bridgeBody');
const checkFilterDigressions = document.getElementById('checkFilterDigressions');
const transcriptFilterControl = document.getElementById('transcriptFilterControl');
const studentFeed = document.getElementById('studentFeed');
const studentEmptyState = document.getElementById('studentEmptyState');
const btnLostSignal = document.getElementById('btnLostSignal');
const btnPulseFast = document.getElementById('btnPulseFast');
const btnPulseExample = document.getElementById('btnPulseExample');
const modeToastBanner = document.getElementById('modeToastBanner');
const whiteboardBanner = document.getElementById('whiteboardBanner');
const quickPromptChips = document.getElementById('quickPromptChips');
const chatMessages = document.getElementById('chatMessages');
const studentChatForm = document.getElementById('studentChatForm');
const studentChatInput = document.getElementById('studentChatInput');

// Mobile Tabs
const tabBtnTranscript = document.getElementById('tabBtnTranscript');
const tabBtnChat = document.getElementById('tabBtnChat');
const panelTranscript = document.getElementById('panelTranscript');
const panelChat = document.getElementById('panelChat');

// Font Controls
const btnFontDown = document.getElementById('btnFontDown');
const btnFontUp = document.getElementById('btnFontUp');

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
    { label: 'Gasto Público', q: '¿Qué ocurre con el ingreso y la tasa de interés si el gobierno sube G?' },
    { label: 'Multiplicador', q: '¿Cómo calculo el multiplicador keynesiano si c = 0.8?' }
  ],
  probabilidades: [
    { label: 'Teorema de Bayes', q: '¿Cómo se define y cuándo se aplica el Teorema de Bayes?' },
    { label: 'Independencia', q: '¿Cuál es la diferencia entre eventos disjuntos y eventos independientes?' },
    { label: 'Ejercicio Bayes', q: 'Si un test médico tiene sensibilidad 95% y prevalencia 1%, ¿cuál es P(enfermo | +)?' }
  ],
  finanzas: [
    { label: 'Beta y CAPM', q: '¿Qué riesgo mide la beta bajo el CAPM y qué pasa con el riesgo idiosincrático?' },
    { label: 'WACC y Riesgo', q: '¿Para qué se usa el WACC al valorizar una empresa?' },
    { label: 'VAN vs TIR', q: '¿Por qué una TIR alta no siempre crea más valor que un buen VAN?' }
  ]
};

async function initStudent() {
  bindUIEvents();
  await syncState();
  setInterval(syncState, 3000);
}

function bindUIEvents() {
  tabBtnTranscript.addEventListener('click', () => {
    tabBtnTranscript.classList.add('active');
    tabBtnChat.classList.remove('active');
    panelTranscript.classList.remove('is-hidden-mobile');
    panelChat.classList.add('is-hidden-mobile');
  });

  tabBtnChat.addEventListener('click', () => {
    tabBtnChat.classList.add('active');
    tabBtnTranscript.classList.remove('active');
    panelChat.classList.remove('is-hidden-mobile');
    panelTranscript.classList.add('is-hidden-mobile');
  });

  checkFilterDigressions.addEventListener('change', renderTranscript);

  if (transcriptFilterControl) {
    transcriptFilterControl.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTranscriptFilter = btn.getAttribute('data-filter');
        transcriptFilterControl.querySelectorAll('[data-filter]').forEach(b => {
          b.style.borderColor = 'var(--border-default)';
        });
        btn.style.borderColor = 'var(--primary)';
        renderTranscript();
      });
    });
  }

  async function sendStudentPulse(type, btnEl, defaultText, sentText) {
    const lastEntry = currentEntries[currentEntries.length - 1];
    const timestamp = lastEntry ? lastEntry.timestamp : '00:00';
    btnEl.disabled = true;
    btnEl.textContent = sentText;
    try {
      await fetch('/api/live/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, timestamp })
      });
    } catch (_) {}
    setTimeout(() => {
      btnEl.disabled = false;
      btnEl.textContent = defaultText;
    }, 3000);
  }

  btnLostSignal.addEventListener('click', () =>
    sendStudentPulse('lost', btnLostSignal, '⚡ Me perdí', '✓ Aviso enviado')
  );
  if (btnPulseFast) {
    btnPulseFast.addEventListener('click', () =>
      sendStudentPulse('fast', btnPulseFast, '🐢 Muy rápido', '✓ Ritmo avisado')
    );
  }
  if (btnPulseExample) {
    btnPulseExample.addEventListener('click', () =>
      sendStudentPulse('example', btnPulseExample, '💡 Pedir ejemplo', '✓ Pedido enviado')
    );
  }

  btnFontUp.addEventListener('click', () => {
    fontScale = Math.min(1.25, fontScale + 0.08);
    document.documentElement.style.setProperty('--font-scale', fontScale);
  });
  btnFontDown.addEventListener('click', () => {
    fontScale = Math.max(0.85, fontScale - 0.08);
    document.documentElement.style.setProperty('--font-scale', fontScale);
  });

  studentChatForm.addEventListener('submit', (e) => handleChatSubmit(e));

  btnStudentCapsule.addEventListener('click', async () => {
    const res = await fetch('/api/live/capsule');
    const data = await res.json();
    if (data.capsule) {
      latestStudentCapsule = data.capsule;
      renderStudentCapsuleModal(data.capsule);
      studentCapsuleModal.classList.add('active');
    }
  });
  btnStudentCloseCapsule.addEventListener('click', () => studentCapsuleModal.classList.remove('active'));
  btnStudentDownloadCapsule.addEventListener('click', () => {
    if (!latestStudentCapsule) return;
    const blob = new Blob([latestStudentCapsule.markdownExport], { type: 'text/markdown;charset=utf-8' });
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

async function syncState() {
  try {
    const res = await fetch('/api/live/state');
    const state = await res.json();
    currentSettings = state.teacherSettings;
    currentEntries = state.entries || [];

    if (!currentCourse || currentCourse.id !== state.course.id) {
      currentCourse = state.course;
      studentCourseTitle.textContent = currentCourse.name;
      studentCourseCode.textContent = `${currentCourse.code} • ${currentCourse.instructor}`;
      ucursosStatusTag.textContent = currentCourse.ucursosSync?.deckTitle
        ? `📑 ${currentCourse.ucursosSync.slides.length} slides sincronizadas`
        : 'Pizarra Libre';
      renderBridge(currentCourse);
      renderQuickChips(currentCourse.id);
    }

    updateConnectionAndModeUI(state.isActive, currentSettings.chatState || 'active');
    renderTranscript();
  } catch (err) {
    console.warn('Error sincronizando estado del estudiante:', err);
  }
}

function updateConnectionAndModeUI(isLive, chatState) {
  // Badge de conexión superior
  liveConnBadge.className = 'conn-pill';
  if (chatState === 'paused') {
    liveConnBadge.classList.add('warn');
    liveConnText.textContent = 'Modo Pizarra Activo';
  } else if (chatState === 'full_ia') {
    liveConnBadge.classList.add('full-ia');
    liveConnText.textContent = 'Post-Clase • Full IA';
  } else if (isLive) {
    liveConnBadge.classList.add('live');
    liveConnText.textContent = 'Profesor transmitiendo en vivo';
  } else {
    liveConnBadge.classList.add('waiting');
    liveConnText.textContent = 'En espera del profesor';
  }

  // Badge del modo del Co-Piloto
  studentModeBadge.className = 'conn-pill';
  studentModeBadge.style.padding = '3px 8px';
  studentModeBadge.style.fontSize = '0.7rem';

  if (chatState === 'paused') {
    studentModeBadge.classList.add('warn');
    studentModeBadge.textContent = '🟡 Modo Pizarra (Pausado)';
    whiteboardBanner.style.display = 'flex';
    studentChatInput.placeholder = 'Chat pausado (las dudas igual van al Radar)...';
  } else if (chatState === 'full_ia') {
    studentModeBadge.classList.add('full-ia');
    studentModeBadge.textContent = '🟣 Modo Full IA (Estudio Profundo)';
    whiteboardBanner.style.display = 'none';
    studentChatInput.placeholder = 'Modo Full IA: pide demostraciones o ejemplos completos...';
  } else {
    studentModeBadge.textContent = '🟢 Seguimiento (2–3 líneas + Voz Alta)';
    whiteboardBanner.style.display = 'none';
    studentChatInput.placeholder = 'Escribe tu duda rápida sobre la clase...';
  }

  // Toast suave si el profesor cambió de modo durante la sesión
  if (modeToastBanner && lastKnownChatState !== chatState) {
    if (chatState === 'full_ia') {
      modeToastBanner.textContent = '🟣 Clase finalizada / Full IA habilitado — ya puedes pedir desarrollos y demostraciones completas.';
      modeToastBanner.style.display = 'block';
    } else if (chatState === 'active' && lastKnownChatState === 'paused') {
      modeToastBanner.textContent = '🟢 El profesor reactivó el chat en Modo Seguimiento.';
      modeToastBanner.style.display = 'block';
      setTimeout(() => { modeToastBanner.style.display = 'none'; }, 4000);
    } else {
      modeToastBanner.style.display = 'none';
    }
    lastKnownChatState = chatState;
  }
}

function renderBridge(course) {
  const lastClass = course.historicalClasses ? course.historicalClasses[course.historicalClasses.length - 1] : null;
  if (!lastClass) {
    bridgeDetails.style.display = 'none';
    return;
  }
  bridgeDetails.style.display = 'block';
  bridgeSummaryText.textContent = `📚 Puente: ${lastClass.title}`;
  bridgeBody.innerHTML = `
    <p><strong>Lo que quedó de la clase anterior:</strong> ${lastClass.summary}</p>
    <div style="color: #6EE7B7; font-family: var(--font-mono); margin-top: 4px;">
      ${(lastClass.keyFormulas || []).map(f => `$${f}$`).join(' • ')}
    </div>
  `;
  if (window.renderMathInElement) {
    window.renderMathInElement(bridgeBody, { delimiters: [{ left: '$', right: '$', display: false }] });
  }
}

function renderQuickChips(courseId) {
  quickPromptChips.innerHTML = '';
  const list = QUICK_PROMPTS[courseId] || QUICK_PROMPTS.macro;
  list.forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-btn';
    chip.textContent = item.label;
    chip.addEventListener('click', () => {
      studentChatInput.value = item.q;
      tabBtnChat.click();
      studentChatInput.focus();
    });
    quickPromptChips.appendChild(chip);
  });
}

function renderTranscript() {
  const hideDig = checkFilterDigressions.checked;
  const filtered = currentEntries.filter(e => {
    if (hideDig && e.category === 'digresion') return false;
    if (activeTranscriptFilter !== 'all' && e.category !== activeTranscriptFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    studentFeed.innerHTML = '';
    if (currentEntries.length > 0) {
      studentFeed.innerHTML = `<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted); font-size:0.82rem;">No hay fragmentos marcados con este filtro todavía. Pulsa <strong>Todo</strong> para ver toda la clase.</div>`;
    } else {
      studentFeed.appendChild(studentEmptyState);
      studentEmptyState.style.display = 'block';
    }
    return;
  }

  studentEmptyState.style.display = 'none';
  studentFeed.innerHTML = '';

  filtered.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'feed-item';
    card.id = `entry-${entry.id}`;

    let tagClass = 'tag-concept';
    let tagText = 'Concepto';
    if (entry.category === 'formula') { tagClass = 'tag-formula'; tagText = 'Fórmula'; }
    else if (entry.category === 'importancia') { tagClass = 'tag-emphasis'; tagText = 'Ojo Control'; }
    else if (entry.category === 'digresion') { tagClass = 'tag-digression'; tagText = 'Digresión'; }

    const slideBadge = entry.slideRef
      ? `<button type="button" class="tag-badge tag-slide slide-open-btn" data-slide="${entry.slideRef.number}" style="cursor:pointer;">📑 Lám. ${entry.slideRef.number}</button>`
      : '';

    card.innerHTML = `
      <div class="feed-meta">
        <div>
          <span class="feed-time">[${entry.timestamp}]</span>
          <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 4px;">${entry.speaker}</span>
        </div>
        <div style="display:flex; gap:4px; align-items:center;">
          ${slideBadge}
          <span class="tag-badge ${tagClass}">${tagText}</span>
        </div>
      </div>
      <div style="font-size: 0.85rem; line-height: 1.45;">${entry.text}</div>
    `;

    const slideBtn = card.querySelector('.slide-open-btn');
    if (slideBtn) {
      slideBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openCapsuleAtSlide(parseInt(slideBtn.getAttribute('data-slide'), 10));
      });
    }

    card.addEventListener('click', () => {
      studentChatInput.value = `En el minuto [${entry.timestamp}], el profe dijo: "${entry.text}". ¿Qué significa esto brevemente?`;
      tabBtnChat.click();
      studentChatInput.focus();
    });

    studentFeed.appendChild(card);
  });

  if (window.renderMathInElement) {
    window.renderMathInElement(studentFeed, { delimiters: [{ left: '$', right: '$', display: false }] });
  }
}

async function handleChatSubmit(e, customQuestion = null, bypassCache = false) {
  if (e) e.preventDefault();
  const q = (customQuestion || studentChatInput.value).trim();
  if (!q) return;

  if (!customQuestion) {
    studentChatInput.value = '';
    appendUserMessage(q);
  }

  const lastEntry = currentEntries[currentEntries.length - 1];
  const currentTime = lastEntry ? lastEntry.timestamp : '00:00';
  const loadingBubble = appendAssistantLoading(bypassCache);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, currentTimeFormatted: currentTime, bypassCache })
    });

    const data = await res.json();
    loadingBubble.remove();

    if (data.status === 'paused') {
      appendAssistantMessage(data.answer, null, { isPaused: true, originalQuestion: q, currentTime });
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
    } else {
      appendAssistantMessage(`⚠️ Error: ${data.error || 'No se pudo obtener respuesta.'}`);
    }
  } catch (err) {
    loadingBubble.remove();
    appendAssistantMessage(`⚠️ Error de conexión con el aula.`);
  }
}

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row msg-user';
  row.textContent = text;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendAssistantLoading(bypassCache = false) {
  const row = document.createElement('div');
  row.className = 'msg-row msg-assistant';
  row.innerHTML = `
    <div class="msg-meta">
      <span style="font-weight: 700; color: #C4B5FD;">CO-PILOTO DE AULA</span>
      <span>• ${bypassCache ? 'Buscando enfoque alternativo...' : 'Verificando fuentes...'}</span>
    </div>
    <div style="color: var(--text-muted); font-size: 0.82rem;">
      <span class="dot-pulse"></span> Anclando con lo dicho en clase y láminas U-Cursos...
    </div>
  `;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
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
    currentTime = '00:00'
  } = options;

  const row = document.createElement('div');
  row.className = 'msg-row msg-assistant';

  if (questionType === 'off_topic') {
    row.style.borderLeft = '3px solid #EF4444';
    row.style.background = 'rgba(239, 68, 68, 0.08)';
  } else if (chatMode === 'full_ia') {
    row.style.borderLeft = '3px solid #8B5CF6';
  }

  const formattedHtml = formatAnswerWithCitations(answerText);

  let complementHtml = '';
  if (complementText && questionType !== 'off_topic') {
    complementHtml = `
      <div class="complement-box">
        <div class="complement-header">
          <span>🤖 Complemento IA</span>
          <span style="font-size: 0.68rem; opacity: 0.8;">• Contexto adicional al curso</span>
        </div>
        <div style="font-size: 0.82rem; color: #E2E8F0;">
          ${formatMarkdownSimple(complementText)}
        </div>
      </div>
    `;
  }

  let voicePromptHtml = '';
  if (voicePrompt && questionType !== 'off_topic') {
    voicePromptHtml = `
      <div class="voice-prompt-box">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
          <div class="voice-prompt-label" style="margin-bottom:0;">🙋‍♂️ Para levantar la mano o pegar en Zoom/Meet:</div>
          <button type="button" class="btn btn-outline btn-xs btn-copy-voice" style="padding:2px 7px; font-size:0.68rem;">
            📋 Copiar para Zoom
          </button>
        </div>
        <div class="voice-prompt-text">"${voicePrompt}"</div>
      </div>
    `;
  }

  let clusterBadgeHtml = '';
  if (clusterCount >= 2 && questionType !== 'off_topic') {
    clusterBadgeHtml = `
      <div class="cluster-nudge-badge tabular-nums">
        🔥 ${clusterCount} compañeros están preguntando sobre "${clusterLabel}". ¡Vale la pena levantar la mano!
      </div>
    `;
  }

  let actionBarHtml = '';
  const actions = [];
  if (canForwardToTeacher && questionType !== 'off_topic' && !isPaused) {
    actions.push(`
      <button type="button" class="btn btn-outline btn-xs btn-forward-teacher" style="border-color: rgba(245, 158, 11, 0.45); color: #FCD34D;">
        📡 Enviar al Radar del Profe / Auxiliar (Anónimo)
      </button>
    `);
  }
  if (fromCache && originalQuestion && !isPaused) {
    actions.push(`
      <button type="button" class="btn btn-outline btn-xs btn-alt-angle" style="border-color: rgba(56, 189, 248, 0.4); color: #38BDF8;">
        🔄 Explicar desde otro ángulo
      </button>
    `);
  }
  if (actions.length > 0) {
    actionBarHtml = `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">${actions.join('')}</div>`;
  }

  const headerColor = isPaused ? '#FCD34D' : (questionType === 'off_topic' ? '#F87171' : chatMode === 'full_ia' ? '#C4B5FD' : '#6EE7B7');
  const headerTitle = isPaused ? 'MODO PIZARRA' : (questionType === 'off_topic' ? 'FILTRO ACADÉMICO' : chatMode === 'full_ia' ? 'TUTOR FULL IA' : 'CO-PILOTO EN VIVO');
  const cachePill = fromCache ? `<span style="font-size:0.65rem; background:rgba(56,189,248,0.14); color:#38BDF8; padding:1px 6px; border-radius:4px;">⚡ Instantáneo (0 tok)</span>` : '';

  row.innerHTML = `
    <div class="msg-meta">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-weight: 700; color: ${headerColor};">${headerTitle}</span>
        ${cachePill}
      </div>
      <span class="tabular-nums">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="assistant-content" style="font-size: 0.87rem; line-height: 1.5;">
      ${formattedHtml}
    </div>
    ${complementHtml}
    ${voicePromptHtml}
    ${clusterBadgeHtml}
    ${actionBarHtml}
  `;

  row.querySelectorAll('.cite-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target && target.startsWith('slide-')) {
        openCapsuleAtSlide(parseInt(target.replace('slide-', ''), 10));
      } else {
        highlightTranscriptSource(target);
      }
    });
  });

  const copyVoiceBtn = row.querySelector('.btn-copy-voice');
  if (copyVoiceBtn && voicePrompt) {
    copyVoiceBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(voicePrompt);
        copyVoiceBtn.textContent = '✓ Copiada para Zoom/Meet';
        setTimeout(() => { copyVoiceBtn.textContent = '📋 Copiar para Zoom'; }, 2000);
      } catch (_) {}
    });
  }

  const forwardBtn = row.querySelector('.btn-forward-teacher');
  if (forwardBtn) {
    forwardBtn.addEventListener('click', async () => {
      forwardBtn.disabled = true;
      forwardBtn.textContent = '✓ Duda enviada al Radar Profe/Auxiliar';
      try {
        await fetch('/api/live/forward-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: originalQuestion, timestamp: currentTime, questionId })
        });
      } catch (_) {}
    });
  }

  const altBtn = row.querySelector('.btn-alt-angle');
  if (altBtn) {
    altBtn.addEventListener('click', () => {
      altBtn.disabled = true;
      altBtn.textContent = '⏳ Generando enfoque distinto...';
      handleChatSubmit(null, originalQuestion, true);
    });
  }

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
}

function formatAnswerWithCitations(text) {
  let html = formatMarkdownSimple(text);

  html = html.replace(/\[VIVO-(\d+)\]/g, (match, p1) => {
    const idx = parseInt(p1, 10) - 1;
    const entry = currentEntries[idx];
    const label = entry ? `min ${entry.timestamp}` : `minuto ${p1}`;
    return `<button type="button" class="cite-chip" data-target="entry-VIVO-${p1}">📍 ${label}</button>`;
  });

  html = html.replace(/\[SLIDE-(\d+)\]/g, (match, p1) => {
    return `<button type="button" class="cite-chip" data-target="slide-${p1}">📑 Lámina ${p1}</button>`;
  });

  html = html.replace(/\[HIST-([A-Z0-9]+)\]/g, () => {
    return `<button type="button" class="cite-chip" data-target="bridgeDetails">📚 Clase Anterior</button>`;
  });

  html = html.replace(/\[MAT-([A-Z0-9]+)\]/g, () => {
    return `<button type="button" class="cite-chip" data-target="bridgeDetails">📄 Guía del Curso</button>`;
  });

  return html;
}

function highlightTranscriptSource(targetId) {
  tabBtnTranscript.click();
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-flash');
    setTimeout(() => el.classList.remove('highlight-flash'), 2000);
  }
}

function formatMarkdownSimple(text) {
  if (!text) return '';
  // Proteger bloques de LaTeX ($...$ y $$...$$) para no romper asteriscos/subíndices internos
  const mathTokens = [];
  let safe = text.replace(/\$\$[\s\S]*?\$\$|\$[^\n$]+\$/g, (m) => {
    const idx = mathTokens.length;
    mathTokens.push(m);
    return `@@MATH_${idx}@@`;
  });

  safe = safe
    .replace(/^---+\s*$/gm, '<hr style="border:none; border-top:1px solid var(--border-subtle); margin:10px 0;">')
    .replace(/^###\s+(.*)$/gm, '<div style="font-size:0.95rem; font-weight:700; color:#F8FAFC; margin:10px 0 4px 0;">$1</div>')
    .replace(/^##\s+(.*)$/gm, '<div style="font-size:1.02rem; font-weight:700; color:#93C5FD; margin:12px 0 6px 0;">$1</div>')
    .replace(/^\s*[\*\-]\s+(.*)$/gm, '<div style="padding-left:12px; margin:2px 0;">• $1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\*])\*([^\n\*]+?)\*/g, '$1<em>$2</em>')
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g, '<br>');

  mathTokens.forEach((orig, idx) => {
    safe = safe.replace(`@@MATH_${idx}@@`, orig);
  });

  return safe;
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
      setTimeout(() => {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  }
}

function renderStudentCapsuleModal(capsule, focusSlideNumber = null) {
  let html = '';

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
    const isFocused = focusSlideNumber === sb.slideNumber;
    if (!isFocused && sb.spokenEntries.length === 0 && capsule.totalEntries > 0) return;
    html += `
      <div id="capsule-slide-${sb.slideNumber}" style="background: var(--surface-2); border: 1px solid ${isFocused ? '#8B5CF6' : 'var(--border-subtle)'}; box-shadow: ${isFocused ? '0 0 0 2px rgba(139,92,246,0.28)' : 'none'}; border-radius: var(--radius-sm); padding: 10px 12px;">
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

  studentCapsuleBody.innerHTML = html || `<div style="color:var(--text-muted);">Aún no hay apuntes registrados en la sesión de hoy.</div>`;
}

window.addEventListener('DOMContentLoaded', initStudent);
