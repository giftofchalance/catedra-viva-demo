/**
 * Gestor del Chat en Vivo con IA (Cátedra Viva)
 * 
 * Lógica Pedagógica:
 * - Envía la pregunta del estudiante junto con el texto revelado por TranscriptSource hasta ese momento.
 * - Detecta y resalta visualmente los 3 casos:
 *   1. Respuesta de clase (tema en la transcripción).
 *   2. Respuesta general del curso con DISCLAIMER explícito destacado (tema fuera de la clase).
 *   3. Rechazo formal (pregunta no relacionada con el curso).
 */

export class ChatManager {
  /**
   * @param {Object} options
   * @param {import('./transcriptSource.js').TranscriptSource} options.transcriptSource
   * @param {HTMLElement} options.chatMessagesEl
   * @param {HTMLFormElement} options.chatFormEl
   * @param {HTMLTextAreaElement} options.chatInputEl
   */
  constructor({ transcriptSource, chatMessagesEl, chatFormEl, chatInputEl }) {
    this.transcriptSource = transcriptSource;
    this.messagesContainer = chatMessagesEl;
    this.form = chatFormEl;
    this.input = chatInputEl;
    this.isLoading = false;

    this.init();
  }

  init() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleUserSubmit();
    });

    // Permitir enviar con Enter (y Shift+Enter para salto de línea)
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleUserSubmit();
      }
    });

    // Enlazar botones de consulta rápida (las 4 preguntas de prueba)
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-prompt');
        if (text) {
          this.input.value = text;
          this.handleUserSubmit();
        }
      });
    });

    const clearBtn = document.getElementById('btnClearChat');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearChat());
    }
  }

  async handleUserSubmit() {
    const question = this.input.value.trim();
    if (!question || this.isLoading) return;

    this.input.value = '';
    this.appendUserMessage(question);

    // Obtener el estado actual estrictamente desde la interfaz TranscriptSource
    const revealedTranscript = this.transcriptSource.getRevealedText();
    const currentTimeFormatted = this.transcriptSource.getCurrentTimestamp();

    this.showTypingIndicator();
    this.isLoading = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          revealedTranscript,
          currentTimeFormatted
        })
      });

      const data = await response.json();
      this.removeTypingIndicator();

      if (response.ok && data.answer) {
        this.appendAssistantMessage(data.answer);
      } else {
        const errorMsg = data.details || data.error || 'No se pudo obtener respuesta del modelo de lenguaje.';
        this.appendErrorMessage(errorMsg, question);
      }
    } catch (err) {
      this.removeTypingIndicator();
      console.error('Error enviando mensaje al chat:', err);
      this.appendErrorMessage('No se pudo establecer conexión con el servidor local.', question);
    } finally {
      this.isLoading = false;
    }
  }

  appendErrorMessage(errorText, retryQuestion) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'message-row assistant error';
    row.innerHTML = `
      <div class="message-bubble error-bubble">
        <div class="error-notice-card">
          <div class="error-notice-header">
            <span style="font-size: 1.1rem;">⚠️</span>
            <strong>Estado de la API del LLM:</strong>
          </div>
          <p class="error-notice-body">${this.escapeHtml(errorText)}</p>
          <div class="error-notice-actions">
            <button class="btn btn-outline btn-sm btn-retry-prompt" data-retry="${this.escapeHtml(retryQuestion)}">
              🔄 Reintentar Pregunta
            </button>
          </div>
        </div>
      </div>
      <span class="message-meta">${time} • Sistema</span>
    `;
    this.messagesContainer.appendChild(row);
    this.scrollToBottom();

    const retryBtn = row.querySelector('.btn-retry-prompt');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.input.value = retryBtn.getAttribute('data-retry');
        this.handleUserSubmit();
      });
    }
  }

  appendUserMessage(text) {
    const welcomeCard = document.getElementById('chatWelcomeCard');
    if (welcomeCard) {
      welcomeCard.classList.add('hidden');
    }

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'message-row user';
    row.innerHTML = `
      <div class="message-bubble">${this.escapeHtml(text)}</div>
      <span class="message-meta">${time} • Tú</span>
    `;
    this.messagesContainer.appendChild(row);
    this.scrollToBottom();
  }

  appendAssistantMessage(markdownText) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'message-row assistant';

    const renderedHtml = this.renderAssistantContent(markdownText);

    row.innerHTML = `
      <div class="message-bubble">${renderedHtml}</div>
      <span class="message-meta">${time} • Tutor IA</span>
    `;
    this.messagesContainer.appendChild(row);
    this.renderMath(row);
    this.scrollToBottom();
    setTimeout(() => this.scrollToBottom(), 80);
  }

  /**
   * Renderiza fórmulas matemáticas con KaTeX si está disponible
   */
  renderMath(element) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(element, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      } catch (err) {
        console.warn('Error al renderizar KaTeX:', err);
      }
    }
  }

  /**
   * Renderiza el contenido del asistente destacando visualmente los disclaimers y rechazos.
   */
  renderAssistantContent(text) {
    const cleanText = text.trim();

    // Caso 1: Rechazo fuera del curso
    if (cleanText.toLowerCase().includes('esa pregunta no está relacionada con este curso') && cleanText.length < 120) {
      return `
        <div class="rejected-banner">
          <span>⛔</span>
          <span>Esa pregunta no está relacionada con este curso.</span>
        </div>
      `;
    }

    // Caso 2: Pregunta con disclaimer obligatorio
    const disclaimerRegex = /(?:> ⚠️ \*\*Aviso:\*\* )?([Ee]sto no lo dijo el profesor en esta clase[^\n\.]*[\.\n]?)/i;
    let hasDisclaimer = disclaimerRegex.test(cleanText);
    let bodyText = cleanText;

    let disclaimerHtml = '';
    if (hasDisclaimer) {
      disclaimerHtml = `
        <div class="disclaimer-banner">
          <span class="disclaimer-icon">⚠️</span>
          <div>
            <strong>Aviso de Alcance:</strong> Esto no lo dijo el profesor en esta clase, es una explicación general — probablemente lo explique con más detalle más adelante.
          </div>
        </div>
      `;
      bodyText = bodyText.replace(disclaimerRegex, '').replace(/^>\s*⚠️.*$/m, '').trim();
    }

    // Convertir markdown básico a HTML protegiendo bloques matemáticos
    const formattedBody = this.markdownToHtml(bodyText);

    return disclaimerHtml + formattedBody;
  }

  markdownToHtml(md) {
    const mathTokens = [];
    // Proteger fórmulas en bloque $$...$$
    let text = md.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      mathTokens.push(match);
      return `___MATH_BLOCK_${mathTokens.length - 1}___`;
    });
    // Proteger fórmulas en línea $...$
    text = text.replace(/\$([^\$\n]+?)\$/g, (match) => {
      mathTokens.push(match);
      return `___MATH_INLINE_${mathTokens.length - 1}___`;
    });

    // Títulos
    text = text.replace(/^### (.*$)/gim, '<h5>$1</h5>');
    text = text.replace(/^## (.*$)/gim, '<h4>$1</h4>');
    text = text.replace(/^# (.*$)/gim, '<h3>$1</h3>');

    // Negrita e itálica
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Listas con viñetas
    text = text.replace(/^\s*\*\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Listas numeradas
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

    // Párrafos dobles
    let html = text.split(/\n\n+/).map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<li') || p.startsWith('<div')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // Restaurar fórmulas matemáticas intactas para KaTeX
    mathTokens.forEach((token, i) => {
      html = html.replace(`___MATH_BLOCK_${i}___`, token);
      html = html.replace(`___MATH_INLINE_${i}___`, token);
    });

    return html;
  }

  showTypingIndicator() {
    this.removeTypingIndicator();
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span style="font-size: 0.75rem; color: #64748B; margin-left: 4px;">Pensando respuesta contextual...</span>
    `;
    this.messagesContainer.appendChild(indicator);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  clearChat() {
    this.messagesContainer.innerHTML = `
      <div class="chat-welcome-card" id="chatWelcomeCard">
        <div class="welcome-header">
          <span class="welcome-badge">🤖 Tutor IA Conectado</span>
          <span class="welcome-time">IN4123</span>
        </div>
        <p>Historial reiniciado. Escribe cualquier duda conceptual o consulta el programa.</p>
      </div>
    `;
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
