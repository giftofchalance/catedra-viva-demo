/**
 * Gestor de la Pantalla Post-Clase (Cátedra Viva)
 * 
 * Funcionalidades:
 * - Resumen automático de la clase generado por el LLM.
 * - Lista de conceptos clave extraídos con timestamps.
 * - Preguntas de autoevaluación pedagógicas.
 * - Buscador interactivo libre que responde usando la transcripción completa.
 * - Archivo indexado y filtrable de las 38 intervenciones del docente.
 */

export class PostClassManager {
  constructor() {
    this.summaryContainer = document.getElementById('postSummaryBody');
    this.conceptsContainer = document.getElementById('postConceptsGrid');
    this.questionsContainer = document.getElementById('postQuestionsList');
    this.searchForm = document.getElementById('postSearchForm');
    this.searchInput = document.getElementById('postSearchInput');
    this.searchResult = document.getElementById('postSearchResult');
    this.transcriptArchive = document.getElementById('fullTranscriptArchive');
    this.transcriptFilter = document.getElementById('transcriptFilterInput');
    this.btnRegenerate = document.getElementById('btnRegenerateSummary');

    this.allTranscriptEntries = [];
    this.init();
  }

  init() {
    this.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });

    this.transcriptFilter.addEventListener('input', () => {
      this.filterTranscript();
    });

    this.btnRegenerate.addEventListener('click', () => {
      this.loadSummary(true);
    });

    this.loadTranscriptArchive();
  }

  async loadSummary(forceRefresh = false) {
    this.summaryContainer.innerHTML = `
      <div class="loading-placeholder">
        <div class="spinner"></div>
        <p>${forceRefresh ? 'Regenerando informe con LLM en tiempo real...' : 'Consultando informe pedagógico estructurado...'}</p>
      </div>
    `;

    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh })
      });

      const data = await response.json();
      if (response.ok && data) {
        this.renderSummary(data);
      } else {
        this.summaryContainer.innerHTML = `<p class="text-danger">Error: ${data.error || 'No se pudo cargar el resumen.'}</p>`;
      }
    } catch (err) {
      console.error('Error cargando resumen post-clase:', err);
      this.summaryContainer.innerHTML = `<p class="text-danger">Error de conexión al cargar resumen post-clase.</p>`;
    }
  }

  renderSummary(data) {
    // 1. Resumen ejecutivo
    let summaryHtml = '';
    if (typeof data.summary === 'string') {
      summaryHtml = data.summary.split('\n\n').map(p => `<p style="margin-bottom: 0.75rem; line-height: 1.6; font-size: 0.9rem;">${p.replace(/\n/g, '<br>')}</p>`).join('');
    } else {
      summaryHtml = `<p>${JSON.stringify(data.summary)}</p>`;
    }
    this.summaryContainer.innerHTML = summaryHtml;

    // 2. Conceptos clave
    this.conceptsContainer.innerHTML = '';
    if (Array.isArray(data.keyConcepts)) {
      data.keyConcepts.forEach(c => {
        const card = document.createElement('div');
        card.className = 'concept-card';
        card.innerHTML = `
          <div class="concept-header">
            <span class="concept-term">${this.escapeHtml(c.term || '')}</span>
            <span class="concept-time">⏱️ ${this.escapeHtml(c.timestamp || '')}</span>
          </div>
          <p class="concept-definition">${this.escapeHtml(c.definition || '')}</p>
        `;
        this.conceptsContainer.appendChild(card);
      });
    }

    // 3. Preguntas de autoevaluación
    this.questionsContainer.innerHTML = '';
    if (Array.isArray(data.studyQuestions)) {
      data.studyQuestions.forEach((q, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${idx + 1}.</strong> ${this.escapeHtml(q)}`;
        this.questionsContainer.appendChild(li);
      });
    }

    this.renderMath(this.summaryContainer);
    this.renderMath(this.conceptsContainer);
    this.renderMath(this.questionsContainer);
  }

  renderMath(element) {
    if (window.renderMathInElement && element) {
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
        console.warn('Error al renderizar KaTeX en post-clase:', err);
      }
    }
  }

  async handleSearch() {
    const question = this.searchInput.value.trim();
    if (!question) return;

    this.searchResult.classList.remove('hidden');
    this.searchResult.innerHTML = `
      <div class="loading-placeholder" style="padding: 1rem;">
        <div class="spinner"></div>
        <p>Buscando en la transcripción completa de la clase con LLM...</p>
      </div>
    `;

    try {
      const response = await fetch('/api/post-class-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      const data = await response.json();
      if (response.ok && data.answer) {
        this.searchResult.innerHTML = `
          <h4 style="font-size: 0.9rem; color: #1E40AF; margin-bottom: 0.4rem;">💡 Respuesta basada en la transcripción:</h4>
          <div style="line-height: 1.55; color: #1E293B;">${this.formatMarkdown(data.answer)}</div>
        `;
        this.renderMath(this.searchResult);
      } else {
        this.searchResult.innerHTML = `<p style="color: #EF4444;">Error: ${data.error || 'No se pudo procesar la consulta.'}</p>`;
      }
    } catch (err) {
      console.error('Error en búsqueda post-clase:', err);
      this.searchResult.innerHTML = `<p style="color: #EF4444;">Error de conexión.</p>`;
    }
  }

  async loadTranscriptArchive() {
    try {
      const response = await fetch('/api/transcript');
      const data = await response.json();
      if (response.ok && data.entries) {
        this.allTranscriptEntries = data.entries;
        this.renderTranscriptArchive(data.entries);
      }
    } catch (err) {
      console.error('Error cargando archivo de transcripción:', err);
    }
  }

  renderTranscriptArchive(entries) {
    this.transcriptArchive.innerHTML = '';
    if (entries.length === 0) {
      this.transcriptArchive.innerHTML = '<p class="text-muted" style="padding: 1rem; font-size: 0.8rem;">No se encontraron coincidencias.</p>';
      return;
    }

    entries.forEach(e => {
      const div = document.createElement('div');
      div.className = 'archive-line';
      div.innerHTML = `
        <span class="archive-time">[${e.timestamp}]</span>
        <span class="archive-text">${this.escapeHtml(e.text)}</span>
      `;
      this.transcriptArchive.appendChild(div);
    });
  }

  filterTranscript() {
    const term = this.transcriptFilter.value.toLowerCase().trim();
    if (!term) {
      this.renderTranscriptArchive(this.allTranscriptEntries);
      return;
    }
    const filtered = this.allTranscriptEntries.filter(e => 
      e.text.toLowerCase().includes(term) || e.timestamp.includes(term)
    );
    this.renderTranscriptArchive(filtered);
  }

  formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
