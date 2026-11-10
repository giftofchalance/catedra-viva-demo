/**
 * Script del Estudiante en el Aula (Cátedra Viva V2)
 */

let currentCourse = null;
let currentSettings = { chatState: 'active', allowComplement: true, hideDigressions: false };
let currentEntries = [];
let fontScale = 1;

// DOM Elements
const studentCourseTitle = document.getElementById('studentCourseTitle');
const studentCourseCode = document.getElementById('studentCourseCode');
const bridgeDetails = document.getElementById('bridgeDetails');
const bridgeSummaryText = document.getElementById('bridgeSummaryText');
const bridgeBody = document.getElementById('bridgeBody');
const checkFilterDigressions = document.getElementById('checkFilterDigressions');
const studentFeed = document.getElementById('studentFeed');
const studentEmptyState = document.getElementById('studentEmptyState');
const btnLostSignal = document.getElementById('btnLostSignal');
const whiteboardBanner = document.getElementById('whiteboardBanner');
const quickPromptChips = document.getElementById('quickPromptChips');
const chatMessages = document.getElementById('chatMessages');
const studentChatForm = document.getElementById('studentChatForm');
const studentChatInput = document.getElementById('studentChatInput');
const btnSendChat = document.getElementById('btnSendChat');

// Mobile Tabs
const tabBtnTranscript = document.getElementById('tabBtnTranscript');
const tabBtnChat = document.getElementById('tabBtnChat');
const panelTranscript = document.getElementById('panelTranscript');
const panelChat = document.getElementById('panelChat');

// Font Controls
const btnFontDown = document.getElementById('btnFontDown');
const btnFontUp = document.getElementById('btnFontUp');

// Preguntas de prueba por curso
const QUICK_PROMPTS = {
  macro: [
    { label: 'Curva IS', q: '¿Qué representa la curva IS y por qué tiene pendiente negativa?' },
    { label: 'Gasto Público', q: '¿Qué ocurre con el ingreso y la tasa de interés si el gobierno sube G?' },
    { label: 'Multiplicador', q: '¿Cómo calculo el multiplicador keynesiano si c = 0.8?' }
  ],
  probabilidades: [
    { label: 'Teorema de Bayes', q: '¿Cómo se define y cuándo se aplica el Teorema de Bayes?' },
    { label: 'Independencia', q: '¿Cuál es la diferencia entre eventos disjuntos y eventos independientes?' },
    { label: 'Ejercicio Bayes', q: 'Si un test médico tiene sensibilidad 95% y la enfermedad prevalece en 1%, ¿cuál es la probabilidad de estar enfermo dado que dio positivo?' }
  ],
  finanzas: [
    { label: 'Tasas y Días', q: '¿Cuál es la diferencia entre la convención 30/360 y Actual/365 según la clase?' },
    { label: 'Contratos FRAs', q: '¿Qué es un Forward Rate Agreement y cómo se determina su tasa?' },
    { label: 'Swaps de Tasa', q: '¿Cómo funciona un swap de tasa de interés (IRS) entre tasa fija y flotante?' }
  ]
};

async function initStudent() {
  bindUIEvents();
  await syncState();
  setInterval(syncState, 3500);
}

function bindUIEvents() {
  // Pestañas móvil
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

  // Filtro de digresiones
  checkFilterDigressions.addEventListener('change', () => {
    renderTranscript();
  });

  // Aviso "Me perdí"
  btnLostSignal.addEventListener('click', async () => {
    const lastEntry = currentEntries[currentEntries.length - 1];
    const timestamp = lastEntry ? lastEntry.timestamp : '00:00';
    btnLostSignal.disabled = true;
    btnLostSignal.textContent = '✓ Aviso enviado al profesor';

    try {
      await fetch('/api/live/lost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp })
      });
    } catch (_) {}

    setTimeout(() => {
      btnLostSignal.disabled = false;
      btnLostSignal.textContent = '⚡ Me perdí en este minuto (Avisar al profesor)';
    }, 4000);
  });

  // Controles de tamaño de letra
  btnFontUp.addEventListener('click', () => {
    fontScale = Math.min(1.3, fontScale + 0.1);
    document.documentElement.style.setProperty('--font-scale', fontScale);
  });
  btnFontDown.addEventListener('click', () => {
    fontScale = Math.max(0.85, fontScale - 0.1);
    document.documentElement.style.setProperty('--font-scale', fontScale);
  });

  // Envío de chat
  studentChatForm.addEventListener('submit', handleChatSubmit);
}

async function syncState() {
  try {
    const res = await fetch('/api/live/state');
    const state = await res.json();
    currentSettings = state.teacherSettings;
    currentEntries = state.entries || [];

    // Ramo
    if (!currentCourse || currentCourse.id !== state.course.id) {
      currentCourse = state.course;
      studentCourseTitle.textContent = currentCourse.name;
      studentCourseCode.textContent = `${currentCourse.code} • ${currentCourse.instructor}`;
      renderBridge(currentCourse);
      renderQuickChips(currentCourse.id);
    }

    // Modo Pizarra
    if (currentSettings.chatState === 'paused') {
      whiteboardBanner.style.display = 'flex';
      studentChatInput.placeholder = 'Chat pausado por Modo Pizarra (atención a la clase)...';
    } else {
      whiteboardBanner.style.display = 'none';
      studentChatInput.placeholder = 'Haz una pregunta sobre la clase o un ejercicio...';
    }

    // Renderizar transcripción
    renderTranscript();

  } catch (err) {
    console.warn('Error sincronizando estado del estudiante:', err);
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
    <div style="color: #6EE7B7; font-family: var(--font-mono); margin-top: 0.3rem;">
      ${(lastClass.keyFormulas || []).map(f => `$${f}$`).join(' • ')}
    </div>
  `;
  if (window.renderMathInElement) {
    window.renderMathInElement(bridgeBody, { delimiters: [{ left: '$', right: '$', display: false }] });
  }
}

function renderQuickChips(courseId) {
  quickPromptChips.innerHTML = '';
  const list = QUICK_PROMPTS[courseId] || QUICK_PROMPTS['macro'];
  list.forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-btn';
    chip.textContent = item.label;
    chip.addEventListener('click', () => {
      studentChatInput.value = item.q;
      // En móvil, cambiar a pestaña de chat
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
    return true;
  });

  if (filtered.length === 0) {
    studentFeed.innerHTML = '';
    studentFeed.appendChild(studentEmptyState);
    studentEmptyState.style.display = 'block';
    return;
  }

  studentEmptyState.style.display = 'none';
  studentFeed.innerHTML = '';

  filtered.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'feed-item';
    card.id = `entry-${entry.id}`;

    let tagClass = 'tag-concept';
    let tagText = '📐 Concepto';
    if (entry.category === 'formula') { tagClass = 'tag-formula'; tagText = '🧮 Fórmula'; }
    else if (entry.category === 'importancia') { tagClass = 'tag-emphasis'; tagText = '📌 Importante'; }
    else if (entry.category === 'digresion') { tagClass = 'tag-digression'; tagText = '💬 Digresión'; }

    card.innerHTML = `
      <div class="feed-meta">
        <div>
          <span class="feed-time">[${entry.timestamp}]</span>
          <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 0.35rem;">${entry.speaker}</span>
        </div>
        <span class="tag-badge ${tagClass}">${tagText}</span>
      </div>
      <div style="font-size: 0.88rem; line-height: 1.45;">${entry.text}</div>
    `;

    // Clic para rebobinar y preguntar sobre esta frase
    card.addEventListener('click', () => {
      const q = `El profesor dijo en el minuto [${entry.timestamp}]: "${entry.text}". ¿Podrías explicar más en detalle qué significa esto en el contexto del ramo?`;
      studentChatInput.value = q;
      tabBtnChat.click();
      studentChatInput.focus();
    });

    studentFeed.appendChild(card);
  });

  if (window.renderMathInElement) {
    window.renderMathInElement(studentFeed, { delimiters: [{ left: '$', right: '$', display: false }] });
  }
}

// --------------------------------------------------------------------------
// CHATBOT SOCRÁTICO
// --------------------------------------------------------------------------

async function handleChatSubmit(e) {
  e.preventDefault();
  const q = studentChatInput.value.trim();
  if (!q) return;

  studentChatInput.value = '';
  appendUserMessage(q);

  const lastEntry = currentEntries[currentEntries.length - 1];
  const currentTime = lastEntry ? lastEntry.timestamp : '00:00';

  // Burbuja de espera
  const loadingBubble = appendAssistantLoading();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, currentTimeFormatted: currentTime })
    });

    const data = await res.json();
    loadingBubble.remove();

    if (data.status === 'paused') {
      appendAssistantMessage(data.answer, null, { isPaused: true });
    } else if (res.ok) {
      appendAssistantMessage(data.answer, data.complement, {
        questionType: data.questionType,
        canForwardToTeacher: data.canForwardToTeacher,
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

function appendAssistantLoading() {
  const row = document.createElement('div');
  row.className = 'msg-row msg-assistant';
  row.innerHTML = `
    <div class="msg-meta">
      <span style="font-weight: 700; color: #C4B5FD;">TUTOR PEDAGÓGICO</span>
      <span>• Pensando...</span>
    </div>
    <div style="color: var(--text-muted); font-size: 0.85rem;">
      <span class="dot-pulse"></span> Verificando fuentes de la clase y aplicando andamiaje...
    </div>
  `;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
}

function appendAssistantMessage(answerText, complementText = null, options = {}) {
  const {
    isPaused = false,
    questionType = 'grounded',
    canForwardToTeacher = false,
    originalQuestion = '',
    currentTime = '00:00'
  } = options;

  const row = document.createElement('div');
  row.className = 'msg-row msg-assistant';

  if (questionType === 'off_topic') {
    row.style.borderLeft = '3px solid #EF4444';
    row.style.background = 'rgba(239, 68, 68, 0.08)';
  }

  // Transformar citas [VIVO-X], [HIST-X], [MAT-X] en chips clicables
  const formattedHtml = formatAnswerWithCitations(answerText);

  let complementHtml = '';
  if (complementText && questionType !== 'off_topic') {
    complementHtml = `
      <div class="complement-box">
        <div class="complement-header">
          <span>🤖 Complemento del Tutor</span>
          <span style="font-size: 0.68rem; opacity: 0.8;">• No dicho textualmente por el profesor</span>
        </div>
        <div style="font-size: 0.85rem; color: #E2E8F0;">
          ${formatMarkdownSimple(complementText)}
        </div>
      </div>
    `;
  }

  let forwardButtonHtml = '';
  if (canForwardToTeacher && questionType === 'unseen_academic') {
    forwardButtonHtml = `
      <div style="margin-top: 0.65rem;">
        <button type="button" class="btn btn-outline btn-forward-teacher" style="font-size: 0.78rem; padding: 0.35rem 0.7rem; border-color: rgba(245, 158, 11, 0.5); color: #FCD34D;">
          🙋‍♂️ Enviar esta duda al profesor (Anónimo)
        </button>
      </div>
    `;
  }

  const headerColor = isPaused ? '#FCD34D' : (questionType === 'off_topic' ? '#F87171' : '#6EE7B7');
  const headerTitle = isPaused ? 'MODO PIZARRA' : (questionType === 'off_topic' ? 'FILTRO ACADÉMICO DEL AULA' : 'TUTOR PEDAGÓGICO');

  row.innerHTML = `
    <div class="msg-meta">
      <span style="font-weight: 700; color: ${headerColor};">
        ${headerTitle}
      </span>
      <span>• ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="assistant-content" style="font-size: 0.9rem; line-height: 1.55;">
      ${formattedHtml}
    </div>
    ${complementHtml}
    ${forwardButtonHtml}
  `;

  // Enlazar botón de enviar duda al profesor si aplica
  const forwardBtn = row.querySelector('.btn-forward-teacher');
  if (forwardBtn) {
    forwardBtn.addEventListener('click', async () => {
      forwardBtn.disabled = true;
      forwardBtn.textContent = '✓ Duda enviada a la pantalla del profesor';
      try {
        await fetch('/api/live/forward-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: originalQuestion, timestamp: currentTime })
        });
      } catch (_) {}
    });
  }

  // Enlazar clics de citas tocables
  row.querySelectorAll('.cite-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      highlightTranscriptSource(targetId);
    });
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
}

function formatAnswerWithCitations(text) {
  let html = formatMarkdownSimple(text);

  // Convertir [VIVO-X]
  html = html.replace(/\[VIVO-(\d+)\]/g, (match, p1) => {
    const idx = parseInt(p1, 10) - 1;
    const entry = currentEntries[idx];
    const label = entry ? `min ${entry.timestamp}` : `minuto ${p1}`;
    return `<button type="button" class="cite-chip" data-target="entry-VIVO-${p1}">📍 ${label}</button>`;
  });

  // Convertir [HIST-X]
  html = html.replace(/\[HIST-([A-Z0-9]+)\]/g, (match, p1) => {
    return `<button type="button" class="cite-chip" data-target="bridgeDetails">📚 Clase Anterior</button>`;
  });

  // Convertir [MAT-X]
  html = html.replace(/\[MAT-([A-Z0-9]+)\]/g, (match, p1) => {
    return `<button type="button" class="cite-chip" data-target="bridgeDetails">📄 Guía del Curso</button>`;
  });

  return html;
}

function highlightTranscriptSource(targetId) {
  // En pantallas móviles, cambiar a pestaña de subtítulos
  tabBtnTranscript.click();

  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-flash');
    setTimeout(() => el.classList.remove('highlight-flash'), 2500);
  }
}

function formatMarkdownSimple(text) {
  if (!text) return '';
  let str = text;
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/\*(.*?)\*/g, '<em>$1</em>');
  str = str.replace(/\n\n/g, '<br><br>');
  str = str.replace(/\n/g, '<br>');
  return str;
}

window.addEventListener('DOMContentLoaded', initStudent);
