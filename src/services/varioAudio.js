/**
 * Acoustic Variometer Synthesizer for Paragliding using Web Audio API.
 * Emulates the audio feedback of instruments like XC Tracer, Flytec, Naviter.
 */
class VarioAudio {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.intervalId = null;
    this.isPlaying = false;
    this.currentRate = 0; // m/s
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setRate(climbRate) {
    this.currentRate = climbRate;
    if (this.isPlaying) {
      this.updateTone();
    }
  }

  start() {
    this.init();
    this.isPlaying = true;
    this.updateTone();
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.osc) {
      try {
        this.osc.stop();
        this.osc.disconnect();
      } catch (e) {}
      this.osc = null;
    }
  }

  updateTone() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.osc) {
      try {
        this.osc.stop();
        this.osc.disconnect();
      } catch (e) {}
      this.osc = null;
    }

    if (!this.isPlaying) return;

    const rate = this.currentRate;

    // 1. Lift: Climb rate > +0.1 m/s -> Pulsed beeps
    if (rate >= 0.15) {
      // Frequency rises with lift: 600 Hz at 0.2 m/s up to 1800 Hz at 6 m/s
      const freq = Math.min(2200, 650 + rate * 220);
      // Beep cycle period decreases: 600ms at 0.2 m/s down to 80ms at 6 m/s
      const cycleMs = Math.max(90, Math.round(550 - rate * 65));
      const beepDurationMs = Math.min(cycleMs * 0.55, 180);

      const playBeep = () => {
        if (!this.isPlaying) return;
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

          // Fast attack and decay for crisp vario chirp
          gain.gain.setValueAtTime(0, this.ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.015);
          gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + (beepDurationMs / 1000));

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start();
          osc.stop(this.ctx.currentTime + (beepDurationMs / 1000) + 0.02);
        } catch (e) {}
      };

      playBeep();
      this.intervalId = setInterval(playBeep, cycleMs);
    }
    // 2. Sink alarm: Rate < -2.0 m/s -> Continuous warning drone
    else if (rate <= -2.0) {
      try {
        const freq = Math.max(180, 320 + rate * 25); // Lower frequency for heavier sink
        this.osc = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();

        this.osc.type = 'sawtooth';
        this.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        this.gain.gain.setValueAtTime(0.18, this.ctx.currentTime);

        this.osc.connect(this.gain);
        this.gain.connect(this.ctx.destination);

        this.osc.start();
      } catch (e) {}
    }
    // 3. Deadband: -2.0 < rate < 0.15 -> Silent
  }
}

export const varioAudio = new VarioAudio();
