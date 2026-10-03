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
    this.btnExport = document.getElementById('btnExportMarkdown');

    this.allTranscriptEntries = [];
    this.latestSummaryData = null;
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

    if (this.btnExport) {
      this.btnExport.addEventListener('click', () => {
        this.exportMarkdown();
      });
    }

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
        this.latestSummaryData = data;
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

  exportMarkdown() {
    if (!this.latestSummaryData) {
      alert('Por favor espera a que se cargue el resumen de la clase antes de descargarlo.');
      return;
    }

    const data = this.latestSummaryData;
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    let md = `# Cátedra Viva - Guía de Estudio y Apuntes de Clase\n\n`;
    md += `**Materia:** Macroeconomía I / Dinámica Macroeconómica  \n`;
    md += `**Tema:** Modelo IS-LM (Mercado de Bienes y Mercado de Dinero)  \n`;
    md += `**Fecha de sesión:** ${dateStr}  \n`;
    md += `**Generado automáticamente por:** Sistema Cátedra Viva  \n\n`;
    md += `---\n\n`;

    // Resumen ejecutivo
    md += `## 1. Resumen Ejecutivo de la Sesión\n\n`;
    if (typeof data.summary === 'string') {
      md += `${data.summary.trim()}\n\n`;
    } else {
      md += `${JSON.stringify(data.summary)}\n\n`;
    }

    // Conceptos clave
    md += `## 2. Conceptos Clave y Definiciones Pedagógicas\n\n`;
    if (Array.isArray(data.keyConcepts) && data.keyConcepts.length > 0) {
      data.keyConcepts.forEach((c, idx) => {
        md += `### ${idx + 1}. ${c.term || 'Concepto'} [⏱️ ${c.timestamp || '00:00'}]\n`;
        md += `${c.definition || ''}\n\n`;
      });
    } else {
      md += `*No se registraron conceptos clave adicionales.*\n\n`;
    }

    // Preguntas de autoevaluación
    md += `## 3. Preguntas de Autoevaluación y Reflexión\n\n`;
    if (Array.isArray(data.studyQuestions) && data.studyQuestions.length > 0) {
      data.studyQuestions.forEach((q, idx) => {
        md += `**Pregunta ${idx + 1}:** ${q.question || ''}\n\n`;
        if (q.hint) {
          md += `> 💡 **Pista / Guía analítica:** ${q.hint}\n\n`;
        }
      });
    } else {
      md += `*No se registraron preguntas de autoevaluación.*\n\n`;
    }

    // Transcripción indexada
    md += `## 4. Registro y Transcripción Indexada de la Clase\n\n`;
    if (Array.isArray(this.allTranscriptEntries) && this.allTranscriptEntries.length > 0) {
      this.allTranscriptEntries.forEach(entry => {
        md += `- **[${entry.timestamp}]** ${entry.text}\n`;
      });
      md += `\n`;
    } else {
      md += `*Transcripción en vivo sincronizada.*\n\n`;
    }

    md += `---\n*Documento educativo generado por Cátedra Viva bajo principios de privacidad Layer 2.*\n`;

    // Trigger browser download
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Catedra_Viva_Apuntes_ISLM_${now.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

