// 聲音：柴油引擎、渦輪、氣壓煞車、方向燈、胎噪、風切、雨聲、喇叭
export const Snd = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    // 白雜訊
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // 引擎：6 缸點火頻率＋諧波，加一點失真
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    this.engLP = ctx.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 300; this.engLP.Q.value = 0.8;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(); g1.gain.value = 0.6; g2.gain.value = 0.35; g3.gain.value = 0.18;
    this.o1.connect(g1); this.o2.connect(g2); this.o3.connect(g3);
    [g1, g2, g3].forEach((g) => g.connect(shaper));
    // 柴油的「喀喀」顆粒感
    const nz = noise(); this.engNoiseBP = ctx.createBiquadFilter(); this.engNoiseBP.type = 'bandpass'; this.engNoiseBP.Q.value = 1.2;
    this.engNoiseG = ctx.createGain(); this.engNoiseG.gain.value = 0.15;
    nz.connect(this.engNoiseBP); this.engNoiseBP.connect(this.engNoiseG); this.engNoiseG.connect(shaper);
    shaper.connect(this.engLP); this.engLP.connect(this.engGain); this.engGain.connect(this.master);
    [this.o1, this.o2, this.o3].forEach((o) => { o.frequency.value = 30; o.start(); });
    // 渦輪口哨
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turbo.frequency.value = 1500;
    this.turboG = ctx.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG); this.turboG.connect(this.master); this.turbo.start();
    // 胎噪、風切、雨聲
    const mk = (type, f, q) => { const s = noise(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); return { fl, g }; };
    this.tireN = mk('lowpass', 420, 0.7);
    this.windN = mk('bandpass', 700, 0.5);
    this.rainN = mk('highpass', 2500, 0.5);
    this.gravelN = mk('bandpass', 1800, 0.8);
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05); },
  suspend() { if (this.ctx) this.ctx.suspend(); },
  resume() { if (this.ctx) this.ctx.resume(); },

  // 每一幀更新：rpm、油門、速度、路面、雨、引擎有沒有發動、在車內
  update({ rpm, throttle, speed, surface, rain, running, inside }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.08;
    const f = (rpm / 60) * 3; // 6 缸四行程點火頻率
    this.o1.frequency.setTargetAtTime(f, t, k); this.o2.frequency.setTargetAtTime(f * 0.5, t, k); this.o3.frequency.setTargetAtTime(f * 2, t, k);
    this.engNoiseBP.frequency.setTargetAtTime(f * 4, t, k);
    this.engLP.frequency.setTargetAtTime(180 + throttle * 650 + rpm * 0.12, t, k);
    this.engGain.gain.setTargetAtTime(running ? (0.05 + throttle * 0.07) * (inside ? 1.2 : 1) : 0, t, 0.12);
    const boost = Math.max(0, (rpm - 1000) / 1100) * throttle;
    this.turbo.frequency.setTargetAtTime(1200 + rpm * 1.6, t, 0.2);
    this.turboG.gain.setTargetAtTime(running ? boost * 0.012 : 0, t, 0.25);
    const sp = Math.abs(speed);
    this.tireN.g.gain.setTargetAtTime(Math.min(0.12, sp * 0.005) * (surface === 'road' ? 1 : 0.6), t, 0.1);
    this.gravelN.g.gain.setTargetAtTime(surface !== 'road' ? Math.min(0.08, sp * 0.008) : 0, t, 0.1);
    this.windN.g.gain.setTargetAtTime(Math.min(0.1, sp * sp * 0.00012) * (inside ? 0.5 : 1), t, 0.2);
    this.windN.fl.frequency.setTargetAtTime(500 + sp * 20, t, 0.2);
    this.rainN.g.gain.setTargetAtTime(rain ? (inside ? 0.09 : 0.06) : 0, t, 0.4);
    this.lastBoost = boost;
  },

  burst(dur, type, freq, vol, when = 0, q = 0.7) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, type = 'square', vol = 0.15, when = 0, slideTo = null, filter = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.08)); g.gain.linearRampToValueAtTime(0, t + dur);
    let node = o;
    if (filter) { const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; o.connect(fl); node = fl; }
    node.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  airBrake() { this.burst(0.7, 'highpass', 2500, 0.22); this.burst(0.25, 'bandpass', 900, 0.15); },
  blowOff() { this.burst(0.35, 'bandpass', 3200, 0.08 + (this.lastBoost || 0) * 0.1, 0, 1.5); },
  shift() { this.burst(0.12, 'lowpass', 300, 0.25); this.burst(0.15, 'highpass', 3000, 0.05, 0.02); },
  tick(hi) { this.tone(hi ? 1500 : 1100, 0.025, 'square', 0.06); this.tone(hi ? 600 : 450, 0.03, 'triangle', 0.08, 0.005); },
  thud(power = 1) { this.burst(0.4, 'lowpass', 220, 0.5 * power); this.tone(80, 0.3, 'sine', 0.35 * power, 0, 40); this.burst(0.25, 'bandpass', 1800, 0.12 * power, 0.02, 3); },
  horn(type) {
    if (type === 'train') [185, 233, 277, 311].forEach((f) => this.tone(f, 1.3, 'sawtooth', 0.08, 0, null, 1400));
    else if (type === 'funny') [523, 659, 784, 1047, 784].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.22, i * 0.12));
    else if (type === 'cow') { this.tone(170, 1.0, 'sawtooth', 0.22, 0, 105, 700); this.tone(172, 1.0, 'square', 0.06, 0, 108, 500); }
    else { [262, 330, 392].forEach((f) => this.tone(f, 0.75, 'sawtooth', 0.08, 0, null, 1600)); }
  },
  coin() { [988, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'square', 0.07, i * 0.08)); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.18, i * 0.09)); },
  click() { this.tone(900, 0.04, 'square', 0.04); },
  no() { this.tone(220, 0.25, 'square', 0.1, 0, 150); },
};
