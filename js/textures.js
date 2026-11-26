// 程式畫出來的寫實貼圖（柏油、草地、大樓外牆、胎紋…），不用下載圖片
import * as THREE from 'three';
import { canvasTex, rng, addGrain, makeNoise, FONT, roundRectPath, clamp } from './util.js';

// ---------- 實拍照片貼圖（Poly Haven，CC0，textures/）----------
// 先用程式畫的貼圖，照片在背景載完再換上；載不到（離線）就一直用程式畫的。
const PHOTOS = new Map();   // 名稱 → Promise<{ img, nor, arm }>
const loader = new THREE.TextureLoader();
export function photoSet(name) {
  if (!PHOTOS.has(name)) {
    const one = (suffix, srgb) => loader.loadAsync(`textures/${name}_${suffix}.jpg`).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
    });
    PHOTOS.set(name, Promise.all([one('Diffuse', true), one('nor_gl', false), one('arm', false)])
      .then(([diff, nor, arm]) => ({ diff, img: diff.image, nor, arm })));
  }
  return PHOTOS.get(name);
}
// 在畫布上鋪照片（px＝一張照片在畫布上幾個像素），再乘一個顏色調亮暗
function tilePhoto(ctx, img, w, h, px, tint = null) {
  for (let y = 0; y < h; y += px) for (let x = 0; x < w; x += px) ctx.drawImage(img, x, y, px, px);
  if (tint) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
}
// 照片載完後重畫畫布貼圖（painter 第 4 個參數拿到照片）
function redrawWithPhoto(tex, name, painter, after) {
  photoSet(name).then((p) => {
    const c = tex.image, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    painter(ctx, c.width, c.height, p.img);
    tex.needsUpdate = true;
    if (after) after(p);
  }).catch((e) => console.warn('照片貼圖載入失敗，用程式畫的：', name, e));
  return tex;
}
// 材質加上照片的凹凸（法線）和粗糙度細節；rx, ry＝在這個材質的 UV 上重複幾次
export function photoDetail(mat, name, rx, ry, normalScale = 1) {
  photoSet(name).then(({ nor, arm }) => {
    const n = nor.clone(); n.repeat.set(rx, ry); n.needsUpdate = true;
    const a = arm.clone(); a.repeat.set(rx, ry); a.needsUpdate = true;
    mat.normalMap = n; mat.normalScale = new THREE.Vector2(normalScale, normalScale);
    mat.roughnessMap = a; mat.bumpMap = null;
    mat.needsUpdate = true;
  }).catch(() => {});
  return mat;
}
// 直接用照片當貼圖（草地、人行道）：先放程式畫的，載完換照片
export function photoMap(mat, name, rx, ry, normalScale = 1) {
  photoSet(name).then(({ diff }) => {
    const d = diff.clone(); d.repeat.set(rx, ry); d.needsUpdate = true;
    if (mat.map) mat.map.dispose();
    mat.map = d; mat.needsUpdate = true;
  }).catch(() => {});
  return photoDetail(mat, name, rx, ry, normalScale);
}

// 柏油路：顆粒、補丁、裂縫、胎痕、磨損標線（一張 = 14 公尺寬 × 28 公尺長）
export function asphaltTex(kind) {
  return redrawWithPhoto(asphaltTex0(kind), 'asphalt_02', (ctx, w, h, img) => paintAsphalt(kind, ctx, w, h, img));
}
function asphaltTex0(kind) {
  return canvasTex(256, 512, (ctx, w, h) => paintAsphalt(kind, ctx, w, h, null), { repeat: true });
}
function paintAsphalt(kind, ctx, w, h, photo) {
  {
    const r = rng(kind.length * 31 + 5);
    ctx.fillStyle = '#3b3d40'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const g = (38 + r() * 64) | 0;
      ctx.fillStyle = `rgba(${g},${g},${g + 3},${0.35 + r() * 0.45})`;
      ctx.fillRect(r() * w, r() * h, 1 + r() * 1.7, 1 + r() * 1.7);
    }
    for (let i = 0; i < 2; i++) {
      const pw = 40 + r() * 70, ph = 60 + r() * 140, px = r() * (w - pw), py = r() * (h - ph);
      const g = r() < 0.5 ? 25 : 85;
      ctx.fillStyle = `rgba(${g},${g},${g},0.2)`; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(15,15,15,.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(px, py, pw, ph);
    }
    if (kind !== 'plain') { ctx.fillStyle = 'rgba(16,16,18,0.22)'; for (const x of [46, 82, 174, 210]) ctx.fillRect(x - 7, 0, 14, h); }
    ctx.strokeStyle = 'rgba(10,10,10,.55)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 26; y += (r() - 0.3) * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    addGrain(ctx, w, h, 14, 11);
    // 有照片就鋪實拍柏油（照片 3 公尺見方 ≈ 51 像素），再畫回車道的輪胎痕
    if (photo) {
      tilePhoto(ctx, photo, w, h, w / 5, '#ababab');   // 剛好整除，重複時才不會有接縫
      if (kind !== 'plain') { ctx.fillStyle = 'rgba(16,16,18,0.18)'; for (const x of [46, 82, 174, 210]) ctx.fillRect(x - 7, 0, 14, h); }
    }
    ctx.globalAlpha = 0.88;
    if (kind === 'city') {
      ctx.fillStyle = '#e6e6e6'; ctx.fillRect(6, 0, 5, h); ctx.fillRect(w - 11, 0, 5, h);
      ctx.fillStyle = '#dcaa0a'; ctx.fillRect(w / 2 - 7, 0, 4, h); ctx.fillRect(w / 2 + 3, 0, 4, h);
    } else if (kind === 'highway') {
      ctx.fillStyle = '#ececec'; ctx.fillRect(6, 0, 6, h); ctx.fillRect(w - 12, 0, 6, h);
      ctx.fillRect(w / 2 - 3, 0, 6, 110); ctx.fillRect(w / 2 - 3, 256, 6, 110);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 1600; i++) { ctx.fillStyle = 'rgba(55,55,58,.55)'; ctx.fillRect(r() * w, r() * h, 1.5, 1.5); }
  }
}

// 凹凸用的灰階雜訊
export function noiseBumpTex(seed = 3, size = 256, scale = 1) {
  return canvasTex(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data, r = rng(seed);
    for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() - 0.5) * 255 * scale; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
}

export function concreteTex() {
  return canvasTex(512, 512, (ctx, w, h) => {
    const r = rng(77);
    ctx.fillStyle = '#9c9a95'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const g = ctx.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 30 + r() * 90);
      g.addColorStop(0, `rgba(${r() < 0.5 ? 60 : 180},${r() < 0.5 ? 60 : 175},${r() < 0.5 ? 55 : 165},0.12)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    addGrain(ctx, w, h, 22, 5);
    ctx.strokeStyle = 'rgba(40,40,40,.5)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, { repeat: true });
}

export function grassTex() {
  const N = makeNoise(9);
  return canvasTex(512, 512, (ctx, w, h) => {
    const r = rng(21);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
      const n = N.fbm(x / 90, y / 90, 3), dry = N.fbm(x / 160 + 40, y / 160, 2);
      const g = 95 + n * 60, rr = 60 + n * 30 + dry * 55, b = 40 + n * 15;
      ctx.fillStyle = `rgb(${rr | 0},${g | 0},${b | 0})`; ctx.fillRect(x, y, 4, 4);
    }
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, g = 80 + r() * 90;
      ctx.strokeStyle = `rgba(${(g * 0.6) | 0},${g | 0},${(g * 0.35) | 0},0.6)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5); ctx.stroke();
    }
  }, { repeat: true });
}

// 大樓外牆：一張 = 4 層樓 × 4 個開間（12×12 公尺）。回傳白天貼圖與晚上亮燈貼圖
export function facadeTex(type, seed) {
  let r = rng(seed);
  const lit = [];
  // 照片重畫時從頭再算一次亂數，窗戶位置和亮燈的窗才會跟晚上的亮燈貼圖對得上
  const paint = (ctx, w, h, photo) => {
    r = rng(seed); lit.length = 0;
    if (type === 'office') {
      ctx.fillStyle = '#8f98a0'; ctx.fillRect(0, 0, w, h);
      for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) {
        const x = b * 64 + 3, y = f * 64 + 3;
        const g = ctx.createLinearGradient(x, y, x + 58, y + 58);
        const t = 0.7 + r() * 0.3;
        g.addColorStop(0, `rgb(${(40 * t) | 0},${(62 * t) | 0},${(80 * t) | 0})`); g.addColorStop(1, `rgb(${(78 * t) | 0},${(100 * t) | 0},${(118 * t) | 0})`);
        ctx.fillStyle = g; ctx.fillRect(x, y, 58, 58);
        if (r() < 0.28) lit.push([x, y, 58, 58]);
      }
    } else {
      if (type === 'brick') {
        ctx.fillStyle = '#b9ab9c'; ctx.fillRect(0, 0, w, h);
        for (let y = 0, row = 0; y < h; y += 6, row++) for (let x = row % 2 ? -6 : 0; x < w; x += 12) {
          const c = 120 + r() * 30; ctx.fillStyle = `rgb(${c | 0},${(c * 0.55) | 0},${(c * 0.42) | 0})`; ctx.fillRect(x + 0.5, y + 0.5, 11, 5);
        }
        if (photo) tilePhoto(ctx, photo, w, h, w / 4, '#e6e6e6');   // 實拍紅磚（3 公尺見方，一張 12 公尺）
      } else {
        ctx.fillStyle = type === 'apartment' ? '#cbc2b0' : '#b8bcc0'; ctx.fillRect(0, 0, w, h);
        addGrain(ctx, w, h, 16, seed);
      }
      for (let f = 0; f < 4; f++) {
        ctx.fillStyle = 'rgba(70,64,56,.45)'; ctx.fillRect(0, f * 64 + 58, w, 6);
        for (let b = 0; b < 4; b++) {
          const x = b * 64 + 14, y = f * 64 + 14;
          ctx.fillStyle = '#e6e2da'; ctx.fillRect(x - 3, y - 3, 42, 40);
          const c = 30 + r() * 20; ctx.fillStyle = `rgb(${c | 0},${(c + 6) | 0},${(c + 14) | 0})`; ctx.fillRect(x, y, 36, 34);
          ctx.fillStyle = 'rgba(230,226,218,.9)'; ctx.fillRect(x + 17, y, 2, 34);
          if (r() < 0.33) lit.push([x, y, 36, 34]);
        }
      }
    }
    // 雨水垂流髒污
    for (let i = 0; i < 14; i++) {
      const x = r() * w, g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(40,40,40,0.0)'); g.addColorStop(1, 'rgba(40,40,40,0.12)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + r() * 6, h);
    }
  };
  const map = canvasTex(256, 256, (ctx, w, h) => paint(ctx, w, h, null));
  if (type === 'brick') redrawWithPhoto(map, 'brick_wall_006', paint);
  const emi = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    for (const [x, y, ww, hh] of lit) {
      const warm = r() < 0.7;
      ctx.fillStyle = warm ? `rgba(255,${(200 + r() * 40) | 0},${(130 + r() * 50) | 0},${0.55 + r() * 0.45})` : `rgba(190,215,255,${0.5 + r() * 0.4})`;
      ctx.fillRect(x, y, ww, hh);
    }
  });
  return { map, emi };
}

// 鐵皮浪板（倉庫、貨櫃）
export function corrugatedTex(color, seed = 4) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0.18)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 8, h);
    }
    addGrain(ctx, w, h, 14, seed);
    const r = rng(seed);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(90,60,30,${0.08 + r() * 0.1})`; ctx.fillRect(r() * w, r() * h, 10 + r() * 40, 4 + r() * 30); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6);
  }, { repeat: true });
}

// 輪胎胎紋：u 繞一圈、v 沿著胎面（中間 1/3 是接地面）
export function treadTex() {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1e1e1f'; ctx.fillRect(0, 0, w, h);
    const t0 = h * 0.333, t1 = h * 0.667;
    ctx.fillStyle = '#171718'; ctx.fillRect(0, t0, w, t1 - t0);
    ctx.fillStyle = '#060606';
    for (const f of [0.25, 0.5, 0.75]) ctx.fillRect(0, t0 + (t1 - t0) * f - 1.5, w, 3);
    for (let x = 0, i = 0; x < w; x += 8, i++) {
      const o = i % 2 ? 0 : (t1 - t0) * 0.25;
      ctx.fillRect(x, t0 + o, 2, (t1 - t0) * 0.25);
      ctx.fillRect(x + 4, t0 + (t1 - t0) * 0.5 + o * 0.5, 2, (t1 - t0) * 0.25);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < w; x += 64) { ctx.fillRect(x, h * 0.12, 30, 4); ctx.fillRect(x + 20, h * 0.85, 30, 4); }
  }, { repeat: false });
}

// 鋼圈（灰階，顏色由材質決定）
export function rimTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 128);
    g.addColorStop(0, '#f4f4f4'); g.addColorStop(0.55, '#d8d8d8'); g.addColorStop(0.62, '#a8a8a8'); g.addColorStop(0.68, '#e8e8e8'); g.addColorStop(1, '#bdbdbd');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 78, cy + Math.sin(a) * 78, 13, 8, a, 0, Math.PI * 2); ctx.fill();
    }
  }, { srgb: true });
}

export function woodTex() {
  return canvasTex(256, 512, (ctx, w, h) => {
    const r = rng(8);
    for (let x = 0; x < w; x += 32) {
      const c = 110 + r() * 40; ctx.fillStyle = `rgb(${c | 0},${(c * 0.7) | 0},${(c * 0.45) | 0})`; ctx.fillRect(x, 0, 32, h);
      ctx.strokeStyle = 'rgba(40,25,10,.6)'; ctx.lineWidth = 2; ctx.strokeRect(x, 0, 32, h);
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = 'rgba(60,40,20,.25)'; ctx.lineWidth = 1; ctx.beginPath(); const xx = x + 4 + r() * 24; ctx.moveTo(xx, 0); ctx.bezierCurveTo(xx + 4, h / 3, xx - 4, (2 * h) / 3, xx + 2, h); ctx.stroke(); }
    }
    addGrain(ctx, w, h, 18, 9);
  }, { repeat: true });
}

export function gravelTex(base = [128, 120, 108]) {
  return canvasTex(256, 256, (ctx, w, h) => {
    const r = rng(12);
    ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const c = 0.6 + r() * 0.7, s = 1.5 + r() * 4;
      ctx.fillStyle = `rgb(${(base[0] * c) | 0},${(base[1] * c) | 0},${(base[2] * c) | 0})`;
      ctx.beginPath(); ctx.ellipse(r() * w, r() * h, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    addGrain(ctx, w, h, 20, 13);
  }, { repeat: true });
}

export function plateTex(text) {
  return canvasTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f0'; roundRectPath(ctx, 2, 2, w - 4, h - 4, 8); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.font = `bold 44px Arial, ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

// 招牌（白天、晚上都用）
export function boardTex(text, bg = '#1d3557', fg = '#ffffff', w = 512, h = 128) {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,.15)'); g.addColorStop(1, 'rgba(0,0,0,.2)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    let size = h * 0.58; ctx.font = `bold ${size}px ${FONT}`;
    const tw = ctx.measureText(text).width; if (tw > w * 0.88) { size *= (w * 0.88) / tw; ctx.font = `bold ${size}px ${FONT}`; }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

export function stripeTex(a = '#d62828', b = '#ffffff', n = 8) {
  return canvasTex(256, 32, (ctx, w, h) => {
    const s = w / n;
    for (let i = -1; i < n + 1; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.beginPath(); ctx.moveTo(i * s, h); ctx.lineTo(i * s + s, h); ctx.lineTo(i * s + s * 1.6, 0); ctx.lineTo(i * s + s * 0.6, 0); ctx.closePath(); ctx.fill(); }
  });
}

// 田地（農場）
export function fieldTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    const r = rng(31);
    ctx.fillStyle = '#6b5a3a'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { ctx.fillStyle = `rgb(${(70 + r() * 20) | 0},${(110 + r() * 40) | 0},${(40 + r() * 15) | 0})`; ctx.fillRect(x, 0, 5, h); }
    addGrain(ctx, w, h, 24, 32);
  }, { repeat: true });
}

// 卡車烤漆上的污垢、刮痕（dirt 0～1）
export function drawGrime(ctx, w, h, dirt, seed = 5) {
  const r = rng(seed);
  ctx.save();
  ctx.globalAlpha = 0.05; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, h / 400);
  for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * w * 0.08, y + (r() - 0.5) * h * 0.03); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const d = clamp(dirt, 0, 1);
  if (d > 0.02) {
    const g = ctx.createLinearGradient(0, h, 0, h * (1 - 0.25 - 0.4 * d));
    g.addColorStop(0, `rgba(96,78,55,${0.75 * d})`); g.addColorStop(1, 'rgba(96,78,55,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const n = Math.round(900 * d * (w * h) / (512 * 512));
    for (let i = 0; i < n; i++) {
      const y = h - Math.pow(r(), 2) * h * 0.6;
      ctx.fillStyle = `rgba(${(80 + r() * 30) | 0},${(65 + r() * 20) | 0},${(45 + r() * 15) | 0},${0.25 + r() * 0.4})`;
      ctx.beginPath(); ctx.arc(r() * w, y, (0.5 + r() * 2) * (h / 256), 0, Math.PI * 2); ctx.fill();
    }
    // 整體灰塵
    ctx.fillStyle = `rgba(150,140,120,${0.18 * d})`; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

export function ledTex() {
  return canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,240,200,.8)'); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

export { THREE };
