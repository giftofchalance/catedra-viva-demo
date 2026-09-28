/**
 * Coordinador Principal de la Aplicación Cliente (Cátedra Viva)
 * 
 * Integra:
 * - SimulatedTranscriptSource (implementación de la interfaz TranscriptSource con sincronización bidireccional de audio real)
 * - ChatManager (chat en vivo acotado con IA y renderizado matemático KaTeX)
 * - PostClassManager (resumen post-clase, conceptos clave y buscador con KaTeX)
 * - DashboardManager (analítica anónima para el profesor)
 * - Modal de Gestión de Alcance Curricular
 */

import { SimulatedTranscriptSource } from './modules/transcriptSource.js';
import { LiveSpeechTranscriptSource } from './modules/liveSpeechTranscriptSource.js';
import { AiAudioTranscriptSource } from './modules/aiAudioTranscriptSource.js';
import { ChatManager } from './modules/chatManager.js';
import { PostClassManager } from './modules/postClassManager.js';
import { DashboardManager } from './modules/dashboardManager.js';

class App {
  constructor() {
    this.transcriptSource = null;
    this.simulatedSource = null;
    this.liveSpeechSource = null;
    this.aiAudioSource = null;
    this.activeSource = 'recorded'; // 'recorded' | 'ai-audio' | 'mic'
    this.chatManager = null;
    this.postClassManager = null;
    this.dashboardManager = null;

    // Elementos del DOM de la cátedra
    this.feedEl = document.getElementById('transcriptFeed');
    this.emptyStateEl = document.getElementById('transcriptEmptyState');
    this.timeDisplayEl = document.getElementById('simTimeDisplay');
    this.progressBarEl = document.getElementById('progressBar');
    this.statusPillEl = document.getElementById('liveStatusPill');
    this.panelHeadingText = document.getElementById('panelHeadingText');
    this.panelSubheadingText = document.getElementById('panelSubheadingText');

    // Selector de modo de audio
    this.btnModeRecorded = document.getElementById('btnModeRecorded');
    this.btnModeAiAudio = document.getElementById('btnModeAiAudio');
    this.btnModeMic = document.getElementById('btnModeMic');

    // Barra de Reproducción Multimedia Unificada (Cátedra Deck)
    this.unifiedPlayerBar = document.getElementById('unifiedPlayerBar');
    this.timelineTrack = document.getElementById('timelineTrack');
    this.simTimeTotal = document.getElementById('simTimeTotal');
    this.aiAudioNotice = document.getElementById('aiAudioNotice');
    this.aiAudioSpin = document.getElementById('aiAudioSpin');
    this.aiAudioNoticeText = document.getElementById('aiAudioNoticeText');

    // Controles del Reproductor Unificado
    this.playBtn = document.getElementById('btnPlayPause');
    this.playIcon = document.getElementById('playIcon');
    this.playText = document.getElementById('playText');
    this.stepBtn = document.getElementById('btnStepNext');
    this.speedBtn = document.getElementById('btnSpeed');
    this.speedLabel = document.getElementById('speedLabel');
    this.revealAllBtn = document.getElementById('btnRevealAll');
    this.resetBtn = document.getElementById('btnReset');
    
    // Reproductor de Audio Real (en segundo plano)
    this.audioEl = document.getElementById('classAudio');

    // Elementos de Micrófono en Vivo (Speech-to-Text)
    this.micLiveCard = document.getElementById('micLiveCard');
    this.micPulseDot = document.getElementById('micPulseDot');
    this.micStatusText = document.getElementById('micStatusText');
    this.micTimeDisplay = document.getElementById('micTimeDisplay');
    this.btnToggleMic = document.getElementById('btnToggleMic');
    this.micBtnIcon = document.getElementById('micBtnIcon');
    this.micBtnText = document.getElementById('micBtnText');
    this.btnClearMicFeed = document.getElementById('btnClearMicFeed');
    this.micInterimPreview = document.getElementById('micInterimPreview');
    this.micInterimText = document.getElementById('micInterimText');

    this.currentSpeed = 1;

    this.init();
  }

  async init() {
    this.setupTabs();
    this.setupModal();

    // 1. Cargar datos de la clase desde el servidor
    try {
      const response = await fetch('/api/transcript');
      const data = await response.json();
      const entries = data.entries || [];

      // 2. Inicializar las tres fuentes de transcripción
      this.simulatedSource = new SimulatedTranscriptSource(entries, { stepIntervalMs: 2500 });
      this.liveSpeechSource = new LiveSpeechTranscriptSource({ lang: 'es-CL' });
      this.aiAudioSource = new AiAudioTranscriptSource({ chunkDurationSeconds: 6 });

      // Fuente activa inicial: Grabada (pre-sincronizada)
      this.transcriptSource = this.simulatedSource;
      this.simulatedSource.enabled = true;
      this.aiAudioSource.enabled = false;

      // Conectar automáticamente el elemento de audio para sincronización bidireccional
      if (this.audioEl) {
        this.simulatedSource.attachAudio(this.audioEl);
        this.aiAudioSource.attachAudio(this.audioEl);
        this.setupAudioListeners();
      }

      // Suscribirse a eventos de la fuente grabada
      this.simulatedSource.subscribe((event, payload) => {
        if (this.activeSource === 'recorded') {
          this.handleTranscriptEvent(event, payload);
        }
      });

      // Suscribirse a eventos de la IA transcribiendo el audio MP3
      this.aiAudioSource.subscribe((event, payload) => {
        if (this.activeSource === 'ai-audio') {
          this.handleAiAudioEvent(event, payload);
        }
      });

      // Suscribirse a eventos de la fuente de micrófono en vivo
      this.liveSpeechSource.subscribe((event, payload) => {
        if (this.activeSource === 'mic') {
          this.handleLiveMicEvent(event, payload);
        }
      });

      // 3. Inicializar el Chat en Vivo (acoplado únicamente a la interfaz de TranscriptSource)
      this.chatManager = new ChatManager({
        transcriptSource: this.transcriptSource,
        chatMessagesEl: document.getElementById('chatMessages'),
        chatFormEl: document.getElementById('chatForm'),
        chatInputEl: document.getElementById('chatInput')
      });

      // 4. Inicializar Post-Clase y Dashboard
      this.postClassManager = new PostClassManager();
      this.dashboardManager = new DashboardManager();

      // 5. Vincular controles de la interfaz y selector de modo
      this.bindControls();
      this.setupModeSwitcher();

    } catch (err) {
      console.error('Error inicializando la aplicación:', err);
      alert('Error conectando con el backend local. Asegúrate de que el servidor Node/Express esté activo.');
    }
  }

  setupAudioListeners() {
    if (!this.audioEl) return;

    this.audioEl.addEventListener('loadedmetadata', () => {
      if (this.simTimeTotal && !isNaN(this.audioEl.duration) && this.audioEl.duration > 0) {
        const mins = Math.floor(this.audioEl.duration / 60);
        const secs = Math.floor(this.audioEl.duration % 60);
        this.simTimeTotal.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    });

    this.audioEl.addEventListener('play', () => {
      if (this.playIcon) this.playIcon.textContent = '⏸';
      if (this.playBtn) this.playBtn.classList.add('playing');
    });

    this.audioEl.addEventListener('pause', () => {
      if (this.playIcon) this.playIcon.textContent = '▶';
      if (this.playBtn) this.playBtn.classList.remove('playing');
    });

    this.audioEl.addEventListener('ended', () => {
      if (this.playIcon) this.playIcon.textContent = '▶';
      if (this.playBtn) this.playBtn.classList.remove('playing');
    });
  }

  /**
   * Navegación por pestañas de la SPA
   */
  setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    const panels = document.querySelectorAll('.view-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');

        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const activePanel = document.getElementById(`view-${targetId}`);
        if (activePanel) {
          activePanel.classList.add('active');
        }

        // Carga diferida según la vista activa
        if (targetId === 'post' && this.postClassManager) {
          this.postClassManager.loadSummary(false);
        } else if (targetId === 'dashboard' && this.dashboardManager) {
          this.dashboardManager.loadStats();
        }
      });
    });
  }

  /**
   * Vincula los botones de control de la simulación
   */
  bindControls() {
    this.playBtn.addEventListener('click', () => {
      this.transcriptSource.togglePlay();
    });

    this.stepBtn.addEventListener('click', () => {
      this.transcriptSource.revealNext();
    });

    this.speedBtn.addEventListener('click', () => {
      if (this.currentSpeed === 1) this.currentSpeed = 1.5;
      else if (this.currentSpeed === 1.5) this.currentSpeed = 2;
      else this.currentSpeed = 1;

      this.speedLabel.textContent = `${this.currentSpeed}x`;
      this.transcriptSource.setSpeed(this.currentSpeed);
    });

    this.revealAllBtn.addEventListener('click', () => {
      this.transcriptSource.revealAll();
    });

    this.resetBtn.addEventListener('click', () => {
      this.transcriptSource.reset();
    });

    // Scrubber Interactivo de la barra de reproducción
    if (this.timelineTrack) {
      this.timelineTrack.addEventListener('click', (e) => {
        const rect = this.timelineTrack.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const duration = (this.audioEl && this.audioEl.duration && !isNaN(this.audioEl.duration))
          ? this.audioEl.duration
          : 306;
        const targetSeconds = Math.floor(pct * duration);

        if (this.audioEl) {
          this.audioEl.currentTime = targetSeconds;
        }
        if (this.transcriptSource && typeof this.transcriptSource.syncToSeconds === 'function') {
          this.transcriptSource.syncToSeconds(targetSeconds);
        }
      });
    }
  }

  /**
   * Configura el selector de modo (Audio Grabado vs IA Transcribiendo MP3 vs Micrófono STT)
   */
  setupModeSwitcher() {
    if (this.btnModeRecorded) {
      this.btnModeRecorded.addEventListener('click', () => this.switchMode('recorded'));
    }
    if (this.btnModeAiAudio) {
      this.btnModeAiAudio.addEventListener('click', () => this.switchMode('ai-audio'));
    }
    if (this.btnModeMic) {
      this.btnModeMic.addEventListener('click', () => this.switchMode('mic'));
    }
    if (this.btnToggleMic) {
      this.btnToggleMic.addEventListener('click', () => {
        this.liveSpeechSource.togglePlay();
      });
    }
    if (this.btnClearMicFeed) {
      this.btnClearMicFeed.addEventListener('click', () => {
        this.liveSpeechSource.reset();
      });
    }
  }

  /**
   * Cambia dinámicamente entre las tres fuentes de transcripción:
   * 1. 'recorded' (Audio con transcripción pre-sincronizada)
   * 2. 'ai-audio' (Gemini cortando fragmentos de 15s del MP3 en tiempo real)
   * 3. 'mic' (Voz hablada capturada por micrófono STT)
   */
  switchMode(targetMode) {
    if (this.activeSource === targetMode) return;
    this.activeSource = targetMode;

    if (targetMode === 'mic') {
      // 1. Desactivar audio MP3 y fuentes de archivo
      this.simulatedSource.enabled = false;
      this.aiAudioSource.enabled = false;
      if (this.audioEl && !this.audioEl.paused) {
        this.audioEl.pause();
      }
      if (this.simulatedSource.isPlaying) {
        this.simulatedSource.pause();
      }

      // Conectar LiveSpeech al chat
      this.transcriptSource = this.liveSpeechSource;
      if (this.chatManager) {
        this.chatManager.transcriptSource = this.liveSpeechSource;
      }

      // Actualizar botones de modo
      this.btnModeMic.classList.add('active');
      this.btnModeRecorded.classList.remove('active');
      if (this.btnModeAiAudio) this.btnModeAiAudio.classList.remove('active');

      // Ocultar controles de audio y mostrar controles de micrófono
      if (this.unifiedPlayerBar) this.unifiedPlayerBar.style.display = 'none';
      if (this.aiAudioNotice) this.aiAudioNotice.style.display = 'none';
      if (this.micLiveCard) this.micLiveCard.style.display = 'flex';

      // Actualizar títulos
      if (this.panelHeadingText) {
        this.panelHeadingText.textContent = 'Cátedra en Vivo: Micrófono (Speech-to-Text)';
      }
      if (this.panelSubheadingText) {
        this.panelSubheadingText.textContent = 'Transcribiendo en tiempo real la voz del docente en la sala';
      }

      // Renderizar feed del micrófono
      this.feedEl.innerHTML = '';
      const micEntries = this.liveSpeechSource.getRevealedEntries();
      if (micEntries.length === 0) {
        this.feedEl.innerHTML = `
          <div class="transcript-empty-state">
            <div class="empty-icon">🎙️</div>
            <h3>Micrófono listo para escuchar</h3>
            <p>Haz clic en <strong>"🎙️ Comenzar a Hablar"</strong> y dicta tu clase. La IA transcribirá tus palabras y las usará en el chat.</p>
          </div>
        `;
      } else {
        micEntries.forEach(entry => this.appendTranscriptLine(entry, false));
      }

    } else if (targetMode === 'ai-audio') {
      // 2. Modo IA Transcribiendo MP3 en Vivo con Gemini
      this.liveSpeechSource.stopListening();
      this.simulatedSource.enabled = false;
      if (this.simulatedSource.isPlaying) {
        this.simulatedSource.pause();
      }
      this.aiAudioSource.enabled = true;

      // Conectar AiAudio al chat
      this.transcriptSource = this.aiAudioSource;
      if (this.chatManager) {
        this.chatManager.transcriptSource = this.aiAudioSource;
      }

      // Actualizar botones de modo
      if (this.btnModeAiAudio) this.btnModeAiAudio.classList.add('active');
      this.btnModeRecorded.classList.remove('active');
      this.btnModeMic.classList.remove('active');

      // Mostrar barra unificada y aviso IA, ocultar micrófono
      if (this.unifiedPlayerBar) this.unifiedPlayerBar.style.display = 'flex';
      if (this.micLiveCard) this.micLiveCard.style.display = 'none';
      if (this.aiAudioNotice) this.aiAudioNotice.style.display = 'flex';
      if (this.revealAllBtn) this.revealAllBtn.style.display = 'none';

      // Actualizar títulos
      if (this.panelHeadingText) {
        this.panelHeadingText.textContent = 'Cátedra en Vivo: Gemini Transcribiendo MP3 (6s)';
      }
      if (this.panelSubheadingText) {
        this.panelSubheadingText.textContent = 'IA cortando trozos de 6s de lo que el profesor acaba de decir en el audio';
      }

      // Renderizar feed de la transcripción IA
      this.feedEl.innerHTML = '';
      const aiEntries = this.aiAudioSource.getRevealedEntries();
      if (aiEntries.length === 0) {
        this.feedEl.innerHTML = `
          <div class="transcript-empty-state">
            <div class="empty-icon">🤖</div>
            <h3>Gemini listo para transcribir el audio en tiempo real</h3>
            <p>Haz clic en <strong>"▶"</strong> para iniciar. A medida que el profesor habla, cada 6 segundos la IA tomará ese pedacito de audio y transcribirá exactamente lo recién dicho.</p>
          </div>
        `;
      } else {
        aiEntries.forEach(entry => this.appendTranscriptLine(entry, false));
      }

      this.updatePlaybackUI(this.aiAudioSource.getState());
      this.updateTimeAndProgress(this.aiAudioSource.getState());

    } else {
      // 3. Modo Grabado Pre-sincronizado (Demostración instantánea)
      this.liveSpeechSource.stopListening();
      this.aiAudioSource.enabled = false;
      this.simulatedSource.enabled = true;

      // Conectar fuente simulada
      this.transcriptSource = this.simulatedSource;
      if (this.chatManager) {
        this.chatManager.transcriptSource = this.simulatedSource;
      }

      // Actualizar botones de modo
      this.btnModeRecorded.classList.add('active');
      if (this.btnModeAiAudio) this.btnModeAiAudio.classList.remove('active');
      this.btnModeMic.classList.remove('active');

      // Mostrar barra unificada y ocultar otros
      if (this.unifiedPlayerBar) this.unifiedPlayerBar.style.display = 'flex';
      if (this.micLiveCard) this.micLiveCard.style.display = 'none';
      if (this.aiAudioNotice) this.aiAudioNotice.style.display = 'none';
      if (this.revealAllBtn) this.revealAllBtn.style.display = 'inline-flex';

      // Actualizar tags de audio
      if (this.audioStatusText) {
        this.audioStatusText.textContent = 'Sincronizado';
      }

      // Restaurar títulos
      if (this.panelHeadingText) {
        this.panelHeadingText.textContent = 'Transcripción de Cátedra: Modelo IS-LM';
      }
      if (this.panelSubheadingText) {
        this.panelSubheadingText.textContent = 'Prof. Roberto Celis • Audio pre-sincronizado';
      }

      // Renderizar feed de la clase grabada
      this.feedEl.innerHTML = '';
      const recordedEntries = this.simulatedSource.getRevealedEntries();
      if (recordedEntries.length === 0) {
        this.feedEl.appendChild(this.emptyStateEl);
        this.emptyStateEl.style.display = 'block';
      } else {
        recordedEntries.forEach(entry => this.appendTranscriptLine(entry, false));
      }

      this.updatePlaybackUI(this.simulatedSource.getState());
      this.updateTimeAndProgress(this.simulatedSource.getState());
    }
  }

  /**
   * Manejador de eventos para el modo IA Transcribiendo MP3 en Vivo
   */
  handleAiAudioEvent(event, data) {
    const state = data?.state || this.aiAudioSource.getState();

    switch (event) {
      case 'listeningBuffer': {
        if (this.aiAudioNotice && this.aiAudioNoticeText && !this.aiAudioNotice.classList.contains('transcribing')) {
          this.aiAudioNotice.style.display = 'flex';
          this.aiAudioNoticeText.textContent = data.message || '🎧 Escuchando audio... transcribiendo los primeros 6s al llegar a 00:00:06';
        }
        break;
      }

      case 'transcriptionPending': {
        if (this.aiAudioNotice && this.aiAudioNoticeText) {
          this.aiAudioNotice.style.display = 'flex';
          this.aiAudioNotice.classList.add('transcribing');
          if (this.aiAudioSpin) this.aiAudioSpin.classList.add('active');
          this.aiAudioNoticeText.textContent = data.message || '🤖 Gemini transcribiendo lo que el profesor acaba de decir...';
        }
        break;
      }

      case 'lineRevealed': {
        const entry = data.entry;
        if (entry) {
          const empty = this.feedEl.querySelector('.transcript-empty-state');
          if (empty) empty.remove();
          this.appendTranscriptLine(entry);
        }
        if (this.aiAudioNotice && this.aiAudioNoticeText) {
          this.aiAudioNotice.classList.remove('transcribing');
          if (this.aiAudioSpin) this.aiAudioSpin.classList.remove('active');
          this.aiAudioNoticeText.textContent = `✅ Fragmento [${entry.timestamp}] transcrito en vivo por Gemini con éxito.`;
        }
        this.updateTimeAndProgress(state);
        break;
      }

      case 'transcriptionError': {
        if (this.aiAudioNotice && this.aiAudioNoticeText) {
          this.aiAudioNotice.classList.remove('transcribing');
          if (this.aiAudioSpin) this.aiAudioSpin.classList.remove('active');
          this.aiAudioNoticeText.textContent = `⚠️ Error transcribiendo fragmento: ${data.error || 'reintentando en siguiente intervalo...'}`;
        }
        break;
      }

      case 'clockTick': {
        this.updateTimeAndProgress(state);
        break;
      }

      case 'stateChange': {
        this.updatePlaybackUI(state);
        this.updateTimeAndProgress(state);
        break;
      }

      case 'complete': {
        this.statusPillEl.className = 'live-pill';
        this.statusPillEl.style.backgroundColor = '#DCFCE7';
        this.statusPillEl.style.color = '#15803D';
        this.statusPillEl.innerHTML = '🏁 CLASE FINALIZADA';
        this.updatePlaybackUI(state);
        break;
      }

      case 'reset': {
        this.feedEl.innerHTML = `
          <div class="transcript-empty-state">
            <div class="empty-icon">🤖</div>
            <h3>Gemini listo para transcribir el audio en tiempo real</h3>
            <p>Haz clic en <strong>"▶ Iniciar"</strong> o reproduce el audio abajo. A medida que el profesor habla, cada 6 segundos la IA tomará ese pedacito de audio y transcribirá exactamente lo recién dicho.</p>
          </div>
        `;
        if (this.aiAudioNotice && this.aiAudioNoticeText) {
          this.aiAudioNotice.style.display = 'flex';
          this.aiAudioNotice.classList.remove('transcribing');
          if (this.aiAudioSpin) this.aiAudioSpin.classList.remove('active');
          this.aiAudioNoticeText.textContent = 'Reproduce el audio para que Gemini corte fragmentos de 6s y los transcriba en tiempo real.';
        }
        this.statusPillEl.className = 'live-pill';
        this.statusPillEl.style.backgroundColor = '#FEE2E2';
        this.statusPillEl.style.color = '#B91C1C';
        this.statusPillEl.innerHTML = '<span class="pulse-ring"></span><span class="status-text">EN VIVO</span>';
        this.updatePlaybackUI(state);
        this.updateTimeAndProgress(state);
        break;
      }
    }
  }

  /**
   * Manejador de eventos exclusivo para el micrófono en vivo
   */
  handleLiveMicEvent(event, data) {
    const state = data?.state || this.liveSpeechSource.getState();

    switch (event) {
      case 'lineRevealed': {
        const entry = data.entry;
        if (entry) {
          // Si el estado vacío está visible, limpiarlo
          const empty = this.feedEl.querySelector('.transcript-empty-state');
          if (empty) empty.remove();
          this.appendTranscriptLine(entry);
        }
        if (this.micInterimPreview) {
          this.micInterimPreview.style.display = 'none';
        }
        this.updateMicUI(state);
        break;
      }

      case 'interimSpeech': {
        if (this.micInterimPreview && this.micInterimText) {
          this.micInterimPreview.style.display = 'flex';
          this.micInterimText.textContent = `"${data.interimText}"`;
        }
        break;
      }

      case 'clockTick': {
        if (this.micTimeDisplay) {
          this.micTimeDisplay.textContent = state.currentTimestamp;
        }
        break;
      }

      case 'stateChange': {
        this.updateMicUI(state);
        break;
      }

      case 'reset': {
        this.feedEl.innerHTML = `
          <div class="transcript-empty-state">
            <div class="empty-icon">🎙️</div>
            <h3>Micrófono listo para escuchar</h3>
            <p>Haz clic en <strong>"🎙️ Comenzar a Hablar"</strong> y dicta tu clase.</p>
          </div>
        `;
        if (this.micInterimPreview) {
          this.micInterimPreview.style.display = 'none';
        }
        this.updateMicUI(state);
        break;
      }
    }
  }

  updateMicUI(state) {
    if (!state) return;

    if (this.micTimeDisplay) {
      this.micTimeDisplay.textContent = state.currentTimestamp;
    }

    if (state.isPlaying) {
      if (this.micPulseDot) this.micPulseDot.classList.add('recording');
      if (this.micStatusText) this.micStatusText.textContent = 'Escuchando tu voz...';
      if (this.micBtnIcon) this.micBtnIcon.textContent = '⏹️';
      if (this.micBtnText) this.micBtnText.textContent = 'Pausar Micrófono';
      if (this.btnToggleMic) {
        this.btnToggleMic.classList.replace('btn-primary', 'btn-secondary');
      }
    } else {
      if (this.micPulseDot) this.micPulseDot.classList.remove('recording');
      if (this.micStatusText) this.micStatusText.textContent = 'Micrófono en Pausa';
      if (this.micBtnIcon) this.micBtnIcon.textContent = '🎙️';
      if (this.micBtnText) this.micBtnText.textContent = state.currentIndex > 0 ? 'Reanudar Micrófono' : 'Comenzar a Hablar';
      if (this.btnToggleMic) {
        this.btnToggleMic.classList.replace('btn-secondary', 'btn-primary');
      }
    }
  }

  /**
   * Manejador central de eventos emitidos por TranscriptSource
   */
  handleTranscriptEvent(event, data) {
    const state = data?.state || (data?.currentIndex !== undefined ? data : this.transcriptSource.getState());

    switch (event) {
      case 'lineRevealed': {
        const entry = data.entry;
        if (entry) {
          this.appendTranscriptLine(entry);
        }
        this.updateTimeAndProgress(state);
        break;
      }

      case 'syncJump': {
        const { oldIndex, targetIndex, revealedEntries } = data;
        // Si retrocedió en la barra de tiempo del audio, re-renderizar hasta esa posición
        if (targetIndex < oldIndex) {
          this.feedEl.innerHTML = '';
          if (revealedEntries.length === 0) {
            this.feedEl.appendChild(this.emptyStateEl);
            this.emptyStateEl.style.display = 'block';
          } else {
            revealedEntries.forEach(entry => this.appendTranscriptLine(entry, false));
          }
        } else {
          // Si avanzó hacia adelante, agregar las líneas pendientes
          for (let i = oldIndex; i < targetIndex; i++) {
            if (this.transcriptSource.entries[i]) {
              this.appendTranscriptLine(this.transcriptSource.entries[i]);
            }
          }
        }
        this.updateTimeAndProgress(state);
        break;
      }

      case 'clockTick': {
        // Solo actualiza reloj y barra de progreso sin tocar el DOM del texto
        this.updateTimeAndProgress(state);
        break;
      }

      case 'stateChange': {
        this.updatePlaybackUI(state);
        this.updateTimeAndProgress(state);
        break;
      }

      case 'complete': {
        this.statusPillEl.className = 'live-pill';
        this.statusPillEl.style.backgroundColor = '#DCFCE7';
        this.statusPillEl.style.color = '#15803D';
        this.statusPillEl.innerHTML = '🏁 CLASE FINALIZADA';
        this.updatePlaybackUI(state);
        break;
      }

      case 'reset': {
        this.feedEl.innerHTML = '';
        this.feedEl.appendChild(this.emptyStateEl);
        this.emptyStateEl.style.display = 'block';
        this.statusPillEl.className = 'live-pill';
        this.statusPillEl.style.backgroundColor = '#FEE2E2';
        this.statusPillEl.style.color = '#B91C1C';
        this.statusPillEl.innerHTML = '<span class="pulse-ring"></span><span class="status-text">EN VIVO</span>';
        this.updatePlaybackUI(state);
        this.updateTimeAndProgress(state);
        break;
      }
    }
  }

  appendTranscriptLine(entry, scroll = true) {
    if (this.emptyStateEl) {
      this.emptyStateEl.style.display = 'none';
    }

    // Evitar duplicar elementos ya existentes en el DOM
    if (document.getElementById(`transcript-item-${entry.id}`)) {
      return;
    }

    // Remover resaltado previo
    const existing = this.feedEl.querySelectorAll('.transcript-item.highlight-new');
    existing.forEach(el => el.classList.remove('highlight-new'));

    // Crear bloque visual del profesor
    const item = document.createElement('div');
    item.className = 'transcript-item highlight-new';
    item.id = `transcript-item-${entry.id}`;
    item.innerHTML = `
      <div class="transcript-meta">
        <span class="speaker-badge">👨‍🏫 ${this.escapeHtml(entry.speaker)}</span>
        <span class="timestamp-badge">⏱️ ${this.escapeHtml(entry.timestamp)}</span>
      </div>
      <div class="transcript-text">${this.escapeHtml(entry.text)}</div>
    `;

    this.feedEl.appendChild(item);
    if (scroll) {
      // Solo auto-desplazar el feed si el usuario está cerca del fondo (no jala la pantalla completa)
      const isNearBottom = (this.feedEl.scrollHeight - this.feedEl.scrollTop - this.feedEl.clientHeight) < 180;
      if (isNearBottom) {
        this.feedEl.scrollTo({ top: this.feedEl.scrollHeight, behavior: 'smooth' });
      }
    }
  }

  updateTimeAndProgress(state) {
    if (!state) return;
    if (this.timeDisplayEl) {
      this.timeDisplayEl.textContent = state.currentTimestamp || '00:00:00';
    }
    if (this.progressBarEl) {
      this.progressBarEl.style.width = `${state.progressPercentage || 0}%`;
    }
    if (this.simTimeTotal && this.audioEl && !isNaN(this.audioEl.duration) && this.audioEl.duration > 0) {
      const mins = Math.floor(this.audioEl.duration / 60);
      const secs = Math.floor(this.audioEl.duration % 60);
      this.simTimeTotal.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  updatePlaybackUI(state) {
    if (!state) return;
    if (state.isPlaying) {
      if (this.playIcon) this.playIcon.textContent = '⏸';
      if (this.playText) this.playText.textContent = 'Pausar';
      if (this.playBtn) {
        this.playBtn.classList.add('playing');
        this.playBtn.setAttribute('title', 'Pausar clase');
      }
    } else {
      if (this.playIcon) this.playIcon.textContent = '▶';
      if (this.playText) this.playText.textContent = state.currentIndex > 0 ? 'Reanudar' : 'Iniciar';
      if (this.playBtn) {
        this.playBtn.classList.remove('playing');
        this.playBtn.setAttribute('title', state.currentIndex > 0 ? 'Reanudar clase' : 'Iniciar clase');
      }
    }
  }

  /**
   * Configuración del modal de syllabus / contenido permitido
   */
  setupModal() {
    const badgeBtn = document.getElementById('courseBadgeBtn');
    const modal = document.getElementById('scopeModal');
    const closeBtn = document.getElementById('btnCloseScopeModal');
    const saveBtn = document.getElementById('btnSaveScope');
    const unitsList = document.getElementById('unitsConfigList');

    badgeBtn.addEventListener('click', async () => {
      modal.classList.remove('hidden');
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        unitsList.innerHTML = '';
        config.units.forEach(u => {
          const isActive = config.activeUnitNumbers.includes(u.unitNumber);
          const item = document.createElement('label');
          item.className = `unit-config-item ${isActive ? 'active' : ''}`;
          item.innerHTML = `
            <input type="checkbox" value="${u.unitNumber}" ${isActive ? 'checked' : ''}>
            <div class="unit-config-content">
              <h4>${u.title}</h4>
              <p>${u.summary}</p>
            </div>
          `;
          unitsList.appendChild(item);
        });
      } catch (e) {
        console.error('Error cargando config:', e);
      }
    });

    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', async () => {
      const checked = Array.from(unitsList.querySelectorAll('input:checked')).map(cb => Number(cb.value));
      if (checked.length === 0) {
        alert('Debe haber al menos 1 unidad curricular activa.');
        return;
      }

      try {
        const res = await fetch('/api/config/active-units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeUnitNumbers: checked })
        });
        if (res.ok) {
          modal.classList.add('hidden');
          alert(`✅ Alcance actualizado exitosamente: Unidades activas [${checked.join(', ')}].\nEl tutor IA ahora responderá con estos nuevos límites.`);
        }
      } catch (err) {
        console.error('Error actualizando unidades:', err);
      }
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Iniciar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
