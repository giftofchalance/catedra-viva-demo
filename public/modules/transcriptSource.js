/**
 * Interfaz TranscriptSource e Implementación Simulada (SimulatedTranscriptSource)
 * 
 * ARQUITECTURA:
 * El avance de la transcripción está estrictamente desacoplado del resto de la aplicación.
 * El chat, el resumen y las pantallas consumidoras solo dependen del contrato de TranscriptSource:
 * - getRevealedText(): entrega el texto disponible hasta el momento actual.
 * - getRevealedEntries(): entrega la lista de objetos de transcripción revelados hasta ahora.
 * - getCurrentTimestamp(): entrega el timestamp actual (ej. "00:01:28").
 * - isComplete(): indica si la clase ha terminado de transcribirse.
 * - subscribe(callback): notifica cuando hay nuevas líneas o cambios de estado.
 * 
 * Corrección de sincronización:
 * Cuando el audio real está activo, el audio es la única fuente de verdad temporal.
 * El timer por setTimeout se desactiva para evitar conflictos entre el reloj de audio y el timer simulado.
 */

export class TranscriptSource {
  constructor() {
    this.listeners = new Set();
  }

  /**
   * Suscribe un listener a cambios en la transcripción: callback(event, state)
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, data) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (err) {
        console.error('Error en listener de TranscriptSource:', err);
      }
    });
  }

  getRevealedText() {
    throw new Error('Método getRevealedText() debe ser implementado por la subclase');
  }

  getRevealedEntries() {
    throw new Error('Método getRevealedEntries() debe ser implementado por la subclase');
  }

  getCurrentTimestamp() {
    throw new Error('Método getCurrentTimestamp() debe ser implementado por la subclase');
  }

  isComplete() {
    throw new Error('Método isComplete() debe ser implementado por la subclase');
  }
}

/**
 * Implementación Simulada de TranscriptSource con sincronización de audio real.
 */
export class SimulatedTranscriptSource extends TranscriptSource {
  /**
   * @param {Array<{ id, timestamp, seconds, speaker, text }>} entries - Todas las entradas de la clase
   * @param {Object} options
   * @param {number} options.stepIntervalMs - Intervalo entre líneas en simulación estándar sin audio (ej. 2500ms)
   */
  constructor(entries = [], options = {}) {
    super();
    this.entries = entries;
    this.stepIntervalMs = options.stepIntervalMs || 2500;
    this.speedMultiplier = 1;
    this.currentIndex = 0; // Cantidad de entradas reveladas hasta el momento
    this.isPlaying = false;
    this.timer = null;
    this.audioElement = null; // Elemento de audio real
    this.lastSec = -1;
  }

  /**
   * Conecta un elemento HTMLAudioElement para sincronización exacta con el audio real
   */
  attachAudio(audioElement) {
    this.audioElement = audioElement;

    this.audioElement.addEventListener('timeupdate', () => {
      if (!this.audioElement) return;
      const currentSec = Math.floor(this.audioElement.currentTime);
      if (currentSec !== this.lastSec) {
        this.lastSec = currentSec;
        this.syncToSeconds(currentSec);
      }
    });

    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
      // Cuando el audio arranca, el reloj del audio toma el control absoluto
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.notify('stateChange', this.getState());
    });

    this.audioElement.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notify('stateChange', this.getState());
    });

    this.audioElement.addEventListener('ended', () => {
      this.revealAll();
    });

    this.audioElement.addEventListener('seeking', () => {
      if (this.audioElement) {
        const sec = Math.floor(this.audioElement.currentTime);
        this.syncToSeconds(sec);
      }
    });
  }

  /**
   * Inicia o reanuda la clase
   */
  play() {
    // Si hay audio y está pausado, reproducir el audio (el audio conducirá la transcripción)
    if (this.audioElement && this.audioElement.paused && this.audioElement.src) {
      this.audioElement.play().catch(e => console.warn('Audio auto-play restringido por navegador:', e));
      this.isPlaying = true;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.notify('stateChange', this.getState());
      return;
    }

    if (this.isPlaying) return;
    this.isPlaying = true;

    // Solo si no hay audio reproduciéndose usamos el timer artificial
    if (!this.audioElement || this.audioElement.paused) {
      this.scheduleNextStep();
    }
    this.notify('stateChange', this.getState());
  }

  /**
   * Pausa la clase
   */
  pause() {
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }

    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.notify('stateChange', this.getState());
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Revela la siguiente línea inmediatamente
   */
  revealNext() {
    if (this.currentIndex < this.entries.length) {
      const entry = this.entries[this.currentIndex];
      this.currentIndex++;
      this.notify('lineRevealed', { entry, state: this.getState() });
      if (this.currentIndex >= this.entries.length) {
        this.pause();
        this.notify('complete', this.getState());
      }
    }
  }

  /**
   * Revela todas las líneas de golpe (para pruebas inmediatas)
   */
  revealAll() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.currentIndex = this.entries.length;
    this.isPlaying = false;
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }
    this.notify('syncJump', {
      oldIndex: 0,
      targetIndex: this.entries.length,
      revealedEntries: this.entries,
      state: this.getState()
    });
    this.notify('stateChange', this.getState());
    this.notify('complete', this.getState());
  }

  /**
   * Reinicia la clase desde el segundo cero
   */
  reset() {
    this.pause();
    if (this.audioElement) {
      this.audioElement.currentTime = 0;
    }
    this.currentIndex = 0;
    this.lastSec = -1;
    this.notify('reset', this.getState());
    this.notify('stateChange', this.getState());
  }

  /**
   * Cambia la velocidad de reproducción
   */
  setSpeed(multiplier) {
    this.speedMultiplier = multiplier;
    if (this.audioElement) {
      this.audioElement.playbackRate = multiplier;
    }
    if (this.isPlaying && (!this.audioElement || this.audioElement.paused)) {
      if (this.timer) clearTimeout(this.timer);
      this.scheduleNextStep();
    }
    this.notify('stateChange', this.getState());
  }

  scheduleNextStep() {
    // Si el audio está activo, NO programar timer de simulación
    if (this.audioElement && !this.audioElement.paused) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      return;
    }

    if (!this.isPlaying || this.currentIndex >= this.entries.length) {
      if (this.currentIndex >= this.entries.length) {
        this.pause();
        this.notify('complete', this.getState());
      }
      return;
    }

    const delay = Math.max(400, Math.round(this.stepIntervalMs / this.speedMultiplier));
    this.timer = setTimeout(() => {
      this.revealNext();
      if (this.isPlaying) {
        this.scheduleNextStep();
      }
    }, delay);
  }

  /**
   * Sincroniza las líneas reveladas con los segundos actuales del audio
   */
  syncToSeconds(currentSec) {
    let targetIndex = 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].seconds <= currentSec) {
        targetIndex = i + 1;
      } else {
        break;
      }
    }

    // Si la frase ha cambiado (ej. llegamos a un nuevo timestamp o el usuario retrocedió en la barra de audio)
    if (targetIndex !== this.currentIndex) {
      const oldIndex = this.currentIndex;
      this.currentIndex = targetIndex;

      this.notify('syncJump', {
        oldIndex,
        targetIndex,
        revealedEntries: this.getRevealedEntries(),
        latestEntry: this.entries[this.currentIndex - 1] || null,
        state: this.getState()
      });

      if (this.currentIndex >= this.entries.length) {
        this.notify('complete', this.getState());
      }
    } else {
      // El contenido de texto sigue siendo el mismo, solo actualizamos el contador de reloj y la barra de progreso
      this.notify('clockTick', this.getState());
    }
  }

  // --- Implementación de Métodos de Interfaz TranscriptSource ---

  getRevealedText() {
    return this.entries
      .slice(0, this.currentIndex)
      .map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`)
      .join('\n');
  }

  getRevealedEntries() {
    return this.entries.slice(0, this.currentIndex);
  }

  getCurrentTimestamp() {
    if (this.audioElement && !isNaN(this.audioElement.currentTime)) {
      const sec = Math.floor(this.audioElement.currentTime);
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return `00:${m}:${s}`;
    }
    if (this.currentIndex === 0) return "00:00:00";
    const lastEntry = this.entries[this.currentIndex - 1];
    return lastEntry ? lastEntry.timestamp : "00:00:00";
  }

  getCurrentSeconds() {
    if (this.audioElement && !isNaN(this.audioElement.currentTime)) {
      return Math.floor(this.audioElement.currentTime);
    }
    if (this.currentIndex === 0) return 0;
    const lastEntry = this.entries[this.currentIndex - 1];
    return lastEntry ? lastEntry.seconds : 0;
  }

  isComplete() {
    return this.currentIndex >= this.entries.length;
  }

  getState() {
    const totalDurationSec = 294; // 04:54
    const currentSec = this.getCurrentSeconds();
    const progressPercentage = Math.min(100, Math.round((currentSec / totalDurationSec) * 100));

    return {
      isPlaying: this.isPlaying,
      currentIndex: this.currentIndex,
      totalEntries: this.entries.length,
      currentTimestamp: this.getCurrentTimestamp(),
      currentSeconds: currentSec,
      speedMultiplier: this.speedMultiplier,
      isComplete: this.isComplete(),
      progressPercentage: progressPercentage
    };
  }
}
