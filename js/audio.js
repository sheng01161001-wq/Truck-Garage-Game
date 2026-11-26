// 聲音：柴油引擎、渦輪、氣壓煞車、方向燈、胎噪、風切、雨聲、喇叭
// v32：引擎改成「真實 6 缸柴油」的合成方式（每轉兩圈點火 6 次、各缸有一點不平均、排氣管共鳴、柴油敲擊聲、
//      排氣煞車的噠噠聲、車內聽到的比較悶）；sounds/ 資料夾放了真的錄音就自動改用錄音（見 sounds/README.txt）
const MAN_URL = 'sounds/manifest.json';
// 6 缸四行程：一個循環（曲軸轉 2 圈）點火 6 次 → 第 6、12、18… 次諧波最強；其他諧波是各缸不平均造成的「顆粒感」
function dieselWave(ctx, bright) {
  const N = 120, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 1; n <= N; n++) {
    const fire = n % 6 === 0, half = n % 3 === 0;
    const fall = Math.pow(n / 6, bright ? -0.75 : -1.25);
    const a = (fire ? 1 : half ? 0.32 : 0.1 + rnd() * 0.12) * fall;
    const ph = rnd() * Math.PI * 2;
    re[n] = a * Math.cos(ph); im[n] = a * Math.sin(ph);
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}
export const Snd = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // 瀏覽器不讓網頁自己開始放音樂：玩家按任何按鈕時再試一次
      if (this.musicEl && this.musicEl.paused && this.musicOn !== false) this.musicEl.play().catch(() => {});
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7 * (this.vol ?? 1); this.master.connect(ctx.destination);
    // 白雜訊
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // 引擎：兩組波形（沒踩油門比較悶／重踩比較亮）交叉淡入，頻率＝一個循環（轉速÷120）
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = (i / 1024) - 1; curve[i] = Math.tanh(x * 1.8); }
    shaper.curve = curve; shaper.oversample = '2x';
    this.engIn = ctx.createGain(); this.engIn.gain.value = 0.9; this.engIn.connect(shaper);
    this.oOff = ctx.createOscillator(); this.oOff.setPeriodicWave(dieselWave(ctx, false));
    this.oOn = ctx.createOscillator(); this.oOn.setPeriodicWave(dieselWave(ctx, true));
    this.gOff = ctx.createGain(); this.gOn = ctx.createGain(); this.gOff.gain.value = 1; this.gOn.gain.value = 0;
    this.oOff.connect(this.gOff); this.oOn.connect(this.gOn); this.gOff.connect(this.engIn); this.gOn.connect(this.engIn);
    // 柴油敲擊聲：高頻雜訊跟著點火節奏一下一下的（怠速最明顯）
    const nz = noise(); this.engNoiseBP = ctx.createBiquadFilter(); this.engNoiseBP.type = 'bandpass'; this.engNoiseBP.frequency.value = 2600; this.engNoiseBP.Q.value = 0.9;
    this.knockG = ctx.createGain(); this.knockG.gain.value = 0;
    this.knockLFO = ctx.createOscillator(); this.knockLFO.type = 'square'; this.knockLFO.frequency.value = 30;
    this.knockDepth = ctx.createGain(); this.knockDepth.gain.value = 0; this.knockLFO.connect(this.knockDepth); this.knockDepth.connect(this.knockG.gain);
    nz.connect(this.engNoiseBP); this.engNoiseBP.connect(this.knockG);
    // 排氣管共鳴（低沉的轟轟聲）＋進氣聲
    this.exhPeak = ctx.createBiquadFilter(); this.exhPeak.type = 'peaking'; this.exhPeak.frequency.value = 95; this.exhPeak.Q.value = 1.4; this.exhPeak.gain.value = 9;
    this.intPeak = ctx.createBiquadFilter(); this.intPeak.type = 'peaking'; this.intPeak.frequency.value = 420; this.intPeak.Q.value = 1.1; this.intPeak.gain.value = 3;
    this.engLP = ctx.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 900; this.engLP.Q.value = 0.6;
    this.engHP = ctx.createBiquadFilter(); this.engHP.type = 'highpass'; this.engHP.frequency.value = 22; // 手機喇叭放不出來的超低頻拿掉
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    shaper.connect(this.exhPeak); this.exhPeak.connect(this.intPeak); this.intPeak.connect(this.engLP); this.engLP.connect(this.engHP); this.engHP.connect(this.engGain);
    this.knockG.connect(this.engGain);
    this.engGain.connect(this.master);
    // 排氣煞車（放油門時「噠噠噠」的粗糙聲）
    const jk = ctx.createWaveShaper(), jc = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; jc[i] = Math.sign(x) * Math.min(1, Math.abs(x) * 4); } jk.curve = jc;
    this.jakeBP = ctx.createBiquadFilter(); this.jakeBP.type = 'bandpass'; this.jakeBP.frequency.value = 700; this.jakeBP.Q.value = 0.8;
    this.jakeG = ctx.createGain(); this.jakeG.gain.value = 0;
    this.oOn.connect(jk); jk.connect(this.jakeBP); this.jakeBP.connect(this.jakeG); this.jakeG.connect(this.master);
    [this.oOff, this.oOn, this.knockLFO].forEach((o) => { o.frequency.value = 5; o.start(); });
    // 真的錄音（有放 sounds/manifest.json 才用）
    this.loadSamples();
    // 渦輪：口哨聲＋進氣的嘶嘶聲（加速時慢慢轉起來）
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turbo.frequency.value = 1500;
    this.turboG = ctx.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG); this.turboG.connect(this.master); this.turbo.start();
    this.spool = 0;
    // 胎噪、風切、雨聲
    const mk = (type, f, q) => { const s = noise(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); return { fl, g }; };
    this.tireN = mk('lowpass', 420, 0.7);
    this.windN = mk('bandpass', 700, 0.5);
    this.rainN = mk('highpass', 2500, 0.5);
    this.gravelN = mk('bandpass', 1800, 0.8);
    this.turboAir = mk('bandpass', 4200, 1.5);
  },

  // ---- 真實錄音（sounds/manifest.json）：引擎錄音依轉速交叉淡入＋變速；配樂依序播放 ----
  loadSamples() {
    const ctx = this.ctx;
    fetch(MAN_URL, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((man) => {
      if (!man) return;
      const load = (f) => fetch('sounds/' + f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(f))).then((b) => ctx.decodeAudioData(b));
      if (Array.isArray(man.engine) && man.engine.length) {
        Promise.all(man.engine.map((e) => load(e.file).then((buf) => ({ rpm: Number(e.rpm) || 1000, buf }))))
          .then((list) => {
            list.sort((a, b) => a.rpm - b.rpm);
            this.samples = list.map(({ rpm, buf }) => {
              const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; src.loop = true; g.gain.value = 0;
              src.connect(g); g.connect(this.sampleBus); src.start(); return { rpm, src, g };
            });
          }).catch((e) => console.warn('引擎錄音載入失敗，用合成聲音：', e));
        this.sampleBus = ctx.createGain(); this.sampleBus.gain.value = 0; this.sampleLP = ctx.createBiquadFilter(); this.sampleLP.type = 'lowpass'; this.sampleLP.frequency.value = 20000;
        this.sampleBus.connect(this.sampleLP); this.sampleLP.connect(this.master);
      }
      if (Array.isArray(man.music) && man.music.length) {
        this.musicList = man.music; this.musicIdx = 0;
        this.musicG = ctx.createGain(); this.musicG.gain.value = (man.musicVolume ?? 0.35) * (this.musicOn === false ? 0 : 1); this.musicG.connect(this.master);
        this.musicVol = man.musicVolume ?? 0.35;
        const el = (this.musicEl = new Audio()); el.crossOrigin = 'anonymous'; el.preload = 'auto';
        ctx.createMediaElementSource(el).connect(this.musicG);
        el.onended = () => { this.musicIdx = (this.musicIdx + 1) % this.musicList.length; el.src = 'sounds/' + this.musicList[this.musicIdx]; el.play().catch(() => {}); };
        el.src = 'sounds/' + this.musicList[0];
        if (this.musicOn !== false) el.play().catch(() => {});
      }
    }).catch(() => {});
  },
  setMusic(on) {
    this.musicOn = on;
    if (this.musicG) this.musicG.gain.setTargetAtTime(on ? this.musicVol : 0, this.ctx.currentTime, 0.3);
    if (this.musicEl) { if (on) this.musicEl.play().catch(() => {}); else this.musicEl.pause(); }
  },
  hasMusic() { return !!this.musicList; },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7 * (this.vol ?? 1), this.ctx.currentTime, 0.05); },
  // v31：音量（0～1）
  setVolume(v) { this.vol = Math.max(0, Math.min(1, v)); if (this.master && !this.muted) this.master.gain.setTargetAtTime(0.7 * this.vol, this.ctx.currentTime, 0.05); },
  suspend() { if (this.ctx) this.ctx.suspend(); },
  resume() { if (this.ctx) this.ctx.resume(); },

  // 每一幀更新：rpm、油門、速度、路面、雨、引擎有沒有發動、在車內
  update({ rpm, throttle, speed, surface, rain, running, inside, retard = false }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const cyc = rpm / 120, fire = cyc * 6; // 一個循環的頻率、點火頻率（6 缸）
    this.oOff.frequency.setTargetAtTime(cyc, t, k); this.oOn.frequency.setTargetAtTime(cyc, t, k);
    this.knockLFO.frequency.setTargetAtTime(fire, t, k);
    // 負載：踩越深越亮越大聲；放油門變悶
    const load = Math.min(1, throttle * (0.6 + rpm / 3000));
    this.gOn.gain.setTargetAtTime(load, t, 0.1); this.gOff.gain.setTargetAtTime(1 - load * 0.7, t, 0.1);
    const idle = Math.max(0, 1 - (rpm - 600) / 700);
    const kd = running ? 0.02 + idle * 0.03 + load * 0.02 : 0; // 方波 ±kd 加上底 kd → 0～2kd 一下一下的
    this.knockDepth.gain.setTargetAtTime(kd, t, 0.1); this.knockG.gain.setTargetAtTime(kd, t, 0.1);
    this.exhPeak.frequency.setTargetAtTime(80 + rpm * 0.03, t, 0.2);
    // 在車內：高頻被駕駛室擋掉，低頻比較重
    this.engLP.frequency.setTargetAtTime((inside ? 380 : 650) + load * (inside ? 500 : 1400) + rpm * 0.15, t, k);
    const useSample = this.samples && this.samples.length;
    const vol = running ? (0.075 + load * 0.08 + rpm / 2200 * 0.03) * (inside ? 1.1 : 1) : 0;
    this.engGain.gain.setTargetAtTime(useSample ? 0 : vol, t, 0.12);
    if (useSample) {
      // 錄音：找轉速最接近的兩段交叉淡入，播放速度＝目前轉速÷錄音轉速
      const L = this.samples; let i = 0; while (i < L.length - 1 && L[i + 1].rpm < rpm) i++;
      const a = L[i], b = L[Math.min(L.length - 1, i + 1)], w = b === a ? 0 : Math.min(1, Math.max(0, (rpm - a.rpm) / (b.rpm - a.rpm)));
      for (const s of L) { const g = s === a ? 1 - w : s === b ? w : 0; s.g.gain.setTargetAtTime(g, t, 0.08); s.src.playbackRate.setTargetAtTime(Math.min(2.5, Math.max(0.4, rpm / s.rpm)), t, 0.05); }
      this.sampleBus.gain.setTargetAtTime(running ? (0.5 + load * 0.5) : 0, t, 0.12);
      this.sampleLP.frequency.setTargetAtTime(inside ? 1400 + load * 1200 : 18000, t, 0.1);
    }
    // 排氣煞車：放油門、轉速夠高才有
    this.jakeG.gain.setTargetAtTime(running && retard && throttle < 0.05 && rpm > 1100 ? 0.035 * Math.min(1, (rpm - 1100) / 500) * (inside ? 0.6 : 1) : 0, t, 0.08);
    // 渦輪：慢慢轉起來（真實的渦輪遲滯）
    const want = Math.max(0, (rpm - 900) / 1100) * throttle;
    this.spool += (want - this.spool) * (want > this.spool ? 0.04 : 0.1);
    const boost = this.spool;
    this.turbo.frequency.setTargetAtTime(2200 + boost * 3800 + rpm * 0.6, t, 0.2);
    this.turboG.gain.setTargetAtTime(running ? boost * (inside ? 0.004 : 0.008) : 0, t, 0.25);
    this.turboAir.g.gain.setTargetAtTime(running ? boost * 0.03 : 0, t, 0.25);
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
  blowOff() { this.burst(0.45, 'bandpass', 2600, 0.06 + (this.lastBoost || 0) * 0.14, 0, 1.2); this.burst(0.2, 'highpass', 5000, 0.04 + (this.lastBoost || 0) * 0.05); this.spool = (this.spool || 0) * 0.4; },
  // 換檔：離合器一頓、變速箱「喀」一聲、氣動換檔的短短洩氣聲
  shift() { this.burst(0.1, 'lowpass', 260, 0.22); this.burst(0.05, 'bandpass', 1200, 0.1, 0.03, 2); this.burst(0.14, 'highpass', 3500, 0.035, 0.05); },
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
