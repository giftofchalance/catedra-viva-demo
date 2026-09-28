/**
 * Implementación de TranscriptSource que transcribe el archivo de audio MP3 en tiempo real con Gemini
 * 
 * COMPORTAMIENTO RIGUROSAMENTE TEMPORAL (AUDIO PASADO):
 * En lugar de adelantarse al audio, transcribe únicamente los fragmentos que YA han terminado
 * de ser pronunciados por el profesor cada 6 segundos.
 * 
 * - t = 0s a 6s: El audio suena, el profesor habla.
 * - t = 6s: Se toma el fragmento de los últimos 6s (00:00:00 - 00:00:06) y se envía a Gemini.
 * - t ≈ 8s: Gemini devuelve el texto exacto de lo recién dicho y se revela en el feed.
 * - t = 12s: Se toma el fragmento (00:00:06 - 00:00:12) y se envía a Gemini.
 * 
 * Así nunca muestra texto del futuro ni lee transcripciones pregrabadas.
 */

import { TranscriptSource } from './transcriptSource.js';

export class AiAudioTranscriptSource extends TranscriptSource {
  constructor(options = {}) {
    super();

    this.chunkDurationSeconds = options.chunkDurationSeconds || 6; // Cortes de 6 segundos exactos
    this.totalDurationSeconds = options.totalDurationSeconds || 306; // 5 min 6 seg
    this.entries = [];
    this.processedChunks = new Set();
    this.audioElement = null;
    this.isPlaying = false;
    this.currentSeconds = 0;
    this.isTranscribing = false;
    this.enabled = false;
  }

  attachAudio(audioEl) {
    this.audioElement = audioEl;
    if (!audioEl) return;

    audioEl.addEventListener('play', () => {
      if (!this.enabled) return;
      this.isPlaying = true;
      this.notify('stateChange', this.getState());
      this.checkAndTranscribeCurrentWindow();
    });

    audioEl.addEventListener('pause', () => {
      if (!this.enabled) return;
      this.isPlaying = false;
      this.notify('stateChange', this.getState());
    });

    audioEl.addEventListener('timeupdate', () => {
      if (!this.enabled) return;
      this.currentSeconds = Math.floor(audioEl.currentTime);
      this.notify('clockTick', this.getState());
      this.checkAndTranscribeCurrentWindow();
    });

    audioEl.addEventListener('ended', () => {
      if (!this.enabled) return;
      this.isPlaying = false;
      this.notify('complete', this.getState());
    });
  }

  async checkAndTranscribeCurrentWindow() {
    if (!this.enabled || this.isTranscribing) return;

    // Cantidad de fragmentos de 6 segundos que YA HAN TERMINADO de escucharse
    const completedChunksCount = Math.floor(this.currentSeconds / this.chunkDurationSeconds);
    
    // Si aún no han pasado los primeros 6 segundos de audio, solo estamos acumulando buffer
    if (completedChunksCount <= 0) {
      if (this.currentSeconds > 0 && this.entries.length === 0) {
        this.notify('listeningBuffer', {
          currentSeconds: this.currentSeconds,
          nextChunkAt: this.chunkDurationSeconds,
          message: `🎧 Escuchando al profesor... (transcribiendo los primeros 6s al llegar a 00:00:0${this.chunkDurationSeconds})`
        });
      }
      return;
    }

    // Buscar en orden cronológico el fragmento completado más antiguo aún no transcrito
    for (let i = 0; i < completedChunksCount; i++) {
      const startSec = i * this.chunkDurationSeconds;
      if (!this.processedChunks.has(startSec)) {
        await this.transcribeChunk(startSec);
        break; // Procesar uno por uno de forma estrictamente secuencial
      }
    }
  }

  async transcribeChunk(startSec) {
    if (this.processedChunks.has(startSec) || this.isTranscribing) return;
    this.processedChunks.add(startSec);
    this.isTranscribing = true;

    const startFormatted = this.formatTime(startSec);
    const endFormatted = this.formatTime(Math.min(startSec + this.chunkDurationSeconds, this.totalDurationSeconds));

    this.notify('transcriptionPending', {
      startSeconds: startSec,
      timestamp: `${startFormatted} - ${endFormatted}`,
      message: `🤖 Gemini transcribiendo lo que el profesor acaba de decir (${startFormatted} - ${endFormatted})...`
    });

    try {
      const response = await fetch('/api/transcribe-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startSeconds: startSec,
          durationSeconds: this.chunkDurationSeconds
        })
      });

      if (response.ok) {
        const chunkData = await response.json();
        if (chunkData.text && chunkData.text.length > 0) {
          const entry = {
            id: chunkData.id || `ai-chunk-${startSec}`,
            timestamp: chunkData.timestamp || `${startFormatted} - ${endFormatted}`,
            seconds: startSec,
            speaker: 'Profesor (IA Transcribiendo MP3 en Vivo)',
            text: chunkData.text
          };
          this.entries.push(entry);
          this.notify('lineRevealed', {
            entry,
            state: this.getState()
          });
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.error('[AiAudioTranscriptSource] Error del servidor:', errJson);
        this.notify('transcriptionError', {
          startSeconds: startSec,
          error: errJson.error || 'Error transcribiendo fragmento de audio'
        });
      }
    } catch (err) {
      console.error('[AiAudioTranscriptSource] Error de red:', err);
    } finally {
      this.isTranscribing = false;
      // Chequear si mientras transcribía se acumuló otro fragmento listo
      if (this.enabled && this.audioElement && !this.audioElement.paused) {
        this.checkAndTranscribeCurrentWindow();
      }
    }
  }

  async revealNext() {
    const nextStartSec = this.entries.length * this.chunkDurationSeconds;
    if (nextStartSec >= this.totalDurationSeconds) return;

    // Al forzar +1 Frase, adelantamos el audio al final del fragmento de 6s y lo transcribimos
    const targetEndSec = Math.min(nextStartSec + this.chunkDurationSeconds, this.totalDurationSeconds);
    if (this.audioElement) {
      this.audioElement.currentTime = targetEndSec;
    }
    this.currentSeconds = targetEndSec;
    await this.transcribeChunk(nextStartSec);
  }

  revealAll() {
    console.warn('[AiAudioTranscriptSource] En modo IA en vivo, los fragmentos se transcriben secuencialmente a medida que transcurre el audio.');
  }

  setSpeed(speed) {
    if (this.audioElement) {
      this.audioElement.playbackRate = speed;
    }
    this.notify('stateChange', this.getState());
  }

  togglePlay() {
    if (this.audioElement) {
      if (this.audioElement.paused) {
        this.audioElement.play().catch(() => {});
      } else {
        this.audioElement.pause();
      }
    }
  }

  formatTime(totalSecs) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  getRevealedText() {
    return this.entries.map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n\n');
  }

  getRevealedEntries() {
    return [...this.entries];
  }

  getCurrentTimestamp() {
    return this.formatTime(this.currentSeconds);
  }

  isComplete() {
    return this.currentSeconds >= this.totalDurationSeconds;
  }

  reset() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.entries = [];
    this.processedChunks.clear();
    this.currentSeconds = 0;
    this.isPlaying = false;
    this.isTranscribing = false;
    this.notify('reset', this.getState());
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      currentIndex: this.entries.length,
      totalEntries: Math.ceil(this.totalDurationSeconds / this.chunkDurationSeconds),
      currentTimestamp: this.getCurrentTimestamp(),
      progressPercentage: Math.min(100, Math.round((this.currentSeconds / this.totalDurationSeconds) * 100)),
      isComplete: this.isComplete(),
      speed: this.audioElement ? this.audioElement.playbackRate : 1,
      isAiAudio: true
    };
  }
}
