/** Tiny WebAudio synth: no audio files to ship. */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('patang:muted') === '1';
    } catch {
      // Storage blocked: default to sound on.
    }
  }

  /** Browsers only allow sound after a tap, so this runs on the first touch. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('patang:muted', this.muted ? '1' : '0');
    } catch {
      // Ignore.
    }
  }

  tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.06, slideTo?: number) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + ms / 1000);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
  }
}
