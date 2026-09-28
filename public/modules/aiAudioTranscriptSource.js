/**
 * Implementación de TranscriptSource que transcribe el archivo de audio MP3 en tiempo real con Gemini
 * 
 * En lugar de usar textos pregrabados, a medida que el audio se reproduce (o avanza el reloj),
 * extrae fragmentos de 15 segundos del archivo MP3 y los envía a Gemini Multimodal para
 * transcribir la voz auténtica del profesor de forma 100% generada por la IA en tiempo real.
 */

import { TranscriptSource } from './transcriptSource.js';

export class AiAudioTranscriptSource extends TranscriptSource {
  constructor(options = {}) {
    super();

    this.chunkDurationSeconds = options.chunkDurationSeconds || 15;
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

    const chunkIndex = Math.floor(this.currentSeconds / this.chunkDurationSeconds);
    const startSec = chunkIndex * this.chunkDurationSeconds;

    if (!this.processedChunks.has(startSec)) {
      await this.transcribeChunk(startSec);
    }
  }

  async transcribeChunk(startSec) {
    if (this.processedChunks.has(startSec) || this.isTranscribing) return;
    this.processedChunks.add(startSec);
    this.isTranscribing = true;

    this.notify('transcriptionPending', {
      startSeconds: startSec,
      timestamp: this.formatTime(startSec),
      message: `🤖 Gemini transcribiendo fragmento ${this.formatTime(startSec)} (${startSec}s - ${Math.min(startSec + this.chunkDurationSeconds, this.totalDurationSeconds)}s) directamente del audio...`
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
            timestamp: chunkData.timestamp,
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
          error: errJson.error || 'Error transcribiendo audio'
        });
      }
    } catch (err) {
      console.error('[AiAudioTranscriptSource] Error de red:', err);
    } finally {
      this.isTranscribing = false;
    }
  }

  async revealNext() {
    const nextStartSec = this.entries.length * this.chunkDurationSeconds;
    if (nextStartSec >= this.totalDurationSeconds) return;

    if (this.audioElement) {
      this.audioElement.currentTime = nextStartSec;
    }
    this.currentSeconds = nextStartSec;
    await this.transcribeChunk(nextStartSec);
  }

  revealAll() {
    // Para modo IA no revelamos todos juntos de golpe para no saturar la API
    console.warn('[AiAudioTranscriptSource] En modo IA, los fragmentos se transcriben secuencialmente.');
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
