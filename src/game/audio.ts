class GardenAudio {
  private ctx: AudioContext | null = null;
  private wingOsc: OscillatorNode | null = null;
  private wingGain: GainNode | null = null;
  private muted = false;
  private paused = false;

  public init(): void {
    if (typeof window === 'undefined') return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      this.wingOsc = this.ctx.createOscillator();
      this.wingGain = this.ctx.createGain();
      this.wingOsc.type = 'triangle';
      this.wingOsc.frequency.value = 54;
      this.wingGain.gain.value = 0;
      this.wingOsc.connect(this.wingGain);
      this.wingGain.connect(this.ctx.destination);
      this.wingOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.wingGain && this.ctx) {
      this.wingGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused && this.wingGain && this.ctx) {
      this.wingGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
  }

  public updateWingHum(speedRatio: number, isGrounded: boolean, isHovering: boolean): void {
    if (!this.ctx || !this.wingOsc || !this.wingGain || this.ctx.state !== 'running') return;
    if (this.muted || this.paused || isGrounded) {
      this.wingGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    const targetFreq = 48 + speedRatio * 42 + (isHovering ? 16 : 0);
    const targetGain = 0.014 + speedRatio * 0.018;
    this.wingOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.06);
    this.wingGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.06);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.08, endFreq?: number): void {
    if (!this.ctx || this.muted || this.paused) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
      }
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch {
      // Ignore audio errors
    }
  }

  public playDash(): void {
    this.tone(360, 0.14, 'sine', 0.08, 720);
  }

  public playNectarCollect(isRed = false): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.tone((isRed ? 660 : 520) * jitter, 0.16, 'sine', 0.07, (isRed ? 990 : 780) * jitter);
  }

  public playGlassCrash(): void {
    this.tone(1420, 0.28, 'triangle', 0.11, 520);
    this.tone(1980, 0.18, 'sine', 0.06, 980);
  }

  public playBeakStrike(): void {
    this.tone(280, 0.1, 'square', 0.06, 540);
  }

  public playBeeBuzz(): void {
    this.tone(175, 0.22, 'sawtooth', 0.04, 155);
  }

  public playGottfriedHum(): void {
    this.tone(110, 0.55, 'sawtooth', 0.045, 92);
  }

  public playCameraClick(): void {
    this.tone(1650, 0.05, 'square', 0.07, 620);
  }

  public playDanceBeat(good: boolean): void {
    if (good) {
      this.tone(587, 0.14, 'triangle', 0.08, 880);
    } else {
      this.tone(210, 0.16, 'sawtooth', 0.05, 160);
    }
  }

  public playGustaveApplause(): void {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.tone(420 + i * 70, 0.09, 'triangle', 0.07, 260);
      }, i * 160);
    }
  }
}

export const gardenAudio = new GardenAudio();
