/**
 * Implementación de TranscriptSource usando Web Speech API (Speech-to-Text en tiempo real)
 * 
 * Captura la voz del docente o usuario a través del micrófono del navegador,
 * la transcribe en tiempo real en español y genera fragmentos de transcripción
 * con timestamps automáticos para alimentar al asistente pedagógico de IA.
 * 
 * Cumple 100% con el contrato abstracto de TranscriptSource:
 * el chat, el resumen y la UI no saben si la clase viene de audio grabado o del micrófono.
 */

import { TranscriptSource } from './transcriptSource.js';

export class LiveSpeechTranscriptSource extends TranscriptSource {
  constructor(options = {}) {
    super();

    this.entries = [];
    this.currentIndex = 0;
    this.isListening = false;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.lang = options.lang || 'es-CL';

    // Verificar soporte del navegador
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.isSupported = Boolean(SpeechRecognition);

    if (this.isSupported) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.lang;

      this.setupRecognitionListeners();
    } else {
      console.warn('[LiveSpeechTranscriptSource] Web Speech API no está soportada en este navegador.');
    }
  }

  setupRecognitionListeners() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      console.log('[LiveSpeech] Reconocimiento de voz iniciado.');
      this.isListening = true;
      this.startClock();
      this.notify('stateChange', this.getState());
    };

    this.recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed.length > 0) {
            this.addLiveEntry(trimmed);
          }
        } else {
          interim += text;
        }
      }

      if (interim.trim().length > 0) {
        this.notify('interimSpeech', {
          interimText: interim.trim(),
          timestamp: this.getCurrentTimestamp(),
          state: this.getState()
        });
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[LiveSpeech] Evento de error en SpeechRecognition:', event.error);
      if (event.error === 'not-allowed') {
        alert('Permiso de micrófono denegado. Por favor autoriza el micrófono en tu navegador.');
        this.stopListening();
      }
    };

    this.recognition.onend = () => {
      console.log('[LiveSpeech] Reconocimiento detenido por el navegador.');
      // Si el usuario no presionó pausar/detener, auto-reiniciar (Chrome pausa tras silencios)
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (err) {
          console.warn('[LiveSpeech] Reintento de start falló:', err);
        }
      } else {
        this.stopClock();
        this.notify('stateChange', this.getState());
      }
    };
  }

  addLiveEntry(text) {
    const entry = {
      id: `live-${this.entries.length + 1}`,
      speaker: 'Profesor (En Vivo)',
      timestamp: this.getCurrentTimestamp(),
      seconds: this.elapsedSeconds,
      text: text
    };

    this.entries.push(entry);
    this.currentIndex = this.entries.length;

    this.notify('lineRevealed', {
      entry,
      state: this.getState()
    });
  }

  startListening() {
    if (!this.isSupported) {
      alert('Tu navegador no soporta Web Speech API. Te recomendamos Google Chrome o Microsoft Edge.');
      return;
    }

    if (this.isListening) return;

    this.isListening = true;
    try {
      this.recognition.start();
    } catch (err) {
      console.warn('[LiveSpeech] Error iniciando reconocimiento:', err);
    }
  }

  stopListening() {
    this.isListening = false;
    this.stopClock();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {
        // Ignorar si ya estaba detenido
      }
    }
    this.notify('stateChange', this.getState());
  }

  togglePlay() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startClock() {
    this.stopClock();
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.notify('clockTick', this.getState());
    }, 1000);
  }

  stopClock() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  reset() {
    this.stopListening();
    this.entries = [];
    this.currentIndex = 0;
    this.elapsedSeconds = 0;
    this.notify('reset', this.getState());
  }

  getRevealedText() {
    return this.entries.map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n\n');
  }

  getRevealedEntries() {
    return [...this.entries];
  }

  getCurrentTimestamp() {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = this.elapsedSeconds % 60;
    return `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  isComplete() {
    return false; // Una cátedra en vivo no tiene duración predeterminada
  }

  getState() {
    return {
      isPlaying: this.isListening,
      currentIndex: this.currentIndex,
      totalEntries: this.entries.length,
      currentTimestamp: this.getCurrentTimestamp(),
      progressPercentage: Math.min(100, Math.round((this.elapsedSeconds / 300) * 100)),
      isComplete: false,
      speed: 1,
      isLiveMic: true
    };
  }
}
