// 卡車改裝王｜橫向電影模式（2.5D）
// 畫面組成（由遠到近）：天空 → 雲層 → 遠處天際線 → 中景建築與行道樹 → 路面與路燈 → 卡車（分層）→ 光線 → 天氣 → 前景護欄與電線桿 → 調色、暗角、底片顆粒
// 跟 3D 版共用存檔（localStorage 的 truckGarage_save_v1）：車身顏色、改裝零件會同步。
// 可以換成自己畫的 PNG：放到 assets/side/（檔名與位置見 assets/side/README.txt），找不到就用程式畫的。

import { createPost } from './side-post.js';
import { SpriteSheet, Animator, drawPerson, randomLook } from './side-sprites.js';
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'truckGarage_save_v1';
const DH = 720; // 設計高度：所有座標都用 720 高的畫面來算，再依螢幕縮放
let W = 0, H = 0, DPR = 1, K = 1, VW = 1280; // VW＝設計寬度

// ---------------- 存檔（只改卡車外觀欄位，其他欄位原封不動） ----------------
function readSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
let save = readSave();
const TRUCK_DEF = { cabColor: '#b71c1c', trailerColor: '#e9ecef', paint: 'normal', bumper: 'std', spoiler: 'off', lightbar: 'off', stacks: 'off', rims: 'std', visor: 'off', name: '我的卡車' };
const truckCfg = () => ({ ...TRUCK_DEF, ...(save.truck || {}) });
const owned = (cat, id) => ['std', 'off', 'normal'].includes(id) || (save.owned || []).includes(cat + ':' + id);
function writeTruck(fields) {
  const cur = readSave(); cur.truck = { ...(cur.truck || {}), ...fields };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(cur)); } catch (e) { /* 存不了就算了 */ }
  save = cur;
}

// ---------------- 小工具 ----------------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function shade(hex, f) { // f>0 變亮、f<0 變暗
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function toast(t, ms = 1800) { const el = $('#toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => (el.style.opacity = 0), ms); }

// ---------------- 時間、天氣 ----------------
const TIMES = { day: '☀️ 白天', dusk: '🌇 黃昏', night: '🌙 晚上' }, WEATHERS = { clear: '🌤 晴天', rain: '🌧 下雨', snow: '❄️ 下雪', fog: '🌫 起霧' };
const st = {
  time: ['day', 'dusk', 'night'].includes(save.settings?.time) ? save.settings.time : 'day',
  weather: ['clear', 'rain', 'snow', 'fog'].includes(save.settings?.weather) ? save.settings.weather : 'clear',
  mode: 'road', lights: false, lightsManual: false,
};
// 環境光（色溫）：烘進背景圖層，也拿來幫卡車上色
const AMBIENT = {
  day: { tint: null, sky: ['#5f9bd6', '#a9cdec', '#e8f1f6'], sun: '#fff6dc', haze: 'rgba(214,228,240,', shadow: 0.5 },
  dusk: { tint: 'rgba(255,120,60,0.22)', sky: ['#2b3b6b', '#c4687a', '#ffb070'], sun: '#ffb070', haze: 'rgba(255,170,130,', shadow: 0.38 },
  night: { tint: 'rgba(10,18,45,0.62)', sky: ['#03060f', '#0a1630', '#1a2a4a'], sun: '#dfe6ff', haze: 'rgba(30,40,70,', shadow: 0.3 },
};
const weatherDim = () => (st.weather === 'rain' ? 0.25 : st.weather === 'fog' ? 0.18 : st.weather === 'snow' ? 0.12 : 0);

// ---------------- 外部 PNG（有放就用，沒放就用程式畫） ----------------
// 卡車座標：x 0（拖車尾）→ 720（車頭），y 0（最高）→ 300（地面）
const ART_BOX = {
  chassis: [10, 220, 700, 50], trailer: [14, 60, 512, 182], cab: [540, 60, 175, 196], wheel: [0, 0, 64, 64],
  bumper: [676, 214, 40, 46], spoiler: [548, 40, 140, 52], lightbar: [560, 46, 130, 18], stacks: [534, 20, 22, 228],
};
const ART = {};
for (const k of Object.keys(ART_BOX)) { const im = new Image(); im.onload = () => { ART[k] = im; }; im.src = `assets/side/${k}.png`; }

// ---------------- 背景圖層（先畫成一張張可以左右接起來的圖，捲動時只是貼圖，很快） ----------------
const LAYERS = [ // speed＝相對卡車的移動速度；blur＝景深模糊（設計像素）
  { id: 'cloud', w: 2600, y: 30, h: 360, speed: 0.04, drift: 6, blur: 5 },
  { id: 'far', w: 2200, y: 150, h: 340, speed: 0.12, blur: 2.2 },
  { id: 'mid', w: 2600, y: 100, h: 410, speed: 0.45, blur: 0.8 },
  { id: 'road', w: 1200, y: 500, h: 230, speed: 1, blur: 0 },
  { id: 'fore', w: 1800, y: 0, h: 720, speed: 1.35, blur: 3 },
];
const tileCache = new Map();
function getTile(L) {
  const key = `${L.id}|${st.time}|${st.weather}|${K.toFixed(3)}|${DPR}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const s = K * DPR, c = mkCanvas(L.w * s, L.h * s), g = c.getContext('2d');
  g.scale(s, s);
  DRAW[L.id](g, L.w, L.h, L);
  let out = c;
  if (L.blur) { // 景深：模糊一下
    const b = mkCanvas(c.width, c.height), bg = b.getContext('2d');
    bg.filter = `blur(${L.blur * s}px)`; bg.drawImage(c, 0, 0); out = b;
  }
  tileCache.set(key, out);
  if (tileCache.size > 40) tileCache.delete(tileCache.keys().next().value);
  return out;
}
// 雜訊貼圖（柏油顆粒、牆面、底片顆粒）
function noiseCanvas(w, h, seed, base, amp, alpha = 255) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(c.width, c.height), R = rng(seed);
  for (let i = 0; i < im.data.length; i += 4) { const v = base + (R() - 0.5) * amp; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = alpha; }
  g.putImageData(im, 0, 0); return c;
}
// 依時間把整張圖層「壓色溫」，然後再畫會發光的東西（窗戶、招牌）
function tintLayer(g, w, h) {
  const a = AMBIENT[st.time];
  g.save(); g.globalCompositeOperation = 'source-atop';
  if (a.tint) { g.fillStyle = a.tint; g.fillRect(0, 0, w, h); }
  const d = weatherDim(); if (d) { g.fillStyle = `rgba(90,100,115,${d})`; g.fillRect(0, 0, w, h); }
  g.restore();
}
const night = () => st.time === 'night', dusk = () => st.time === 'dusk';
const SHOPS = ['便利商店', '麵包店', '咖啡', '五金行', '藥局', '早餐店', '牛肉麵', '書局', '眼鏡行', '機車行'];

const DRAW = {
  cloud(g, w, h) {
    const R = rng(11), dark = night();
    for (let i = 0; i < 26; i++) {
      const cx = R() * w, cy = 40 + R() * (h - 120), sc = 0.6 + R() * 1.2;
      for (let j = 0; j < 7; j++) {
        const x = cx + (R() - 0.5) * 220 * sc, y = cy + (R() - 0.5) * 40 * sc, r = (40 + R() * 70) * sc;
        for (const off of [0, -w, w]) {
          const gr = g.createRadialGradient(x + off, y - r * 0.3, r * 0.1, x + off, y, r);
          const top = dark ? 'rgba(70,80,110,0.55)' : dusk() ? 'rgba(255,200,170,0.85)' : 'rgba(255,255,255,0.9)';
          const bot = dark ? 'rgba(20,25,40,0)' : dusk() ? 'rgba(170,110,140,0)' : 'rgba(200,214,230,0)';
          gr.addColorStop(0, top); gr.addColorStop(1, bot);
          g.fillStyle = gr; g.beginPath(); g.ellipse(x + off, y, r * 1.6, r, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
    if (st.weather !== 'clear') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(110,120,135,0.55)'; g.fillRect(0, 0, w, h); }
  },
  far(g, w, h) {
    const R = rng(22), base = h;
    const col = night() ? '#1a2232' : dusk() ? '#6c5a78' : '#8ea4ba';
    g.fillStyle = col;
    let x = 0;
    const lit = [];
    while (x < w) {
      const bw = 40 + R() * 90, bh = 70 + R() * 230, y = base - bh;
      g.fillRect(x, y, bw, bh);
      if (R() < 0.25) { g.fillRect(x + bw * 0.4, y - 30 - R() * 40, 4, 40 + R() * 40); } // 天線
      if (R() < 0.2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + bw / 2, y - 26 - R() * 30); g.lineTo(x + bw, y); g.fill(); }
      for (let wy = y + 10; wy < base - 8; wy += 12) for (let wx = x + 6; wx < x + bw - 6; wx += 10) if (R() < (night() ? 0.35 : 0.08)) lit.push([wx, wy]);
      x += bw + R() * 8;
    }
    // 霧氣：越下面越淡（空氣透視）
    const hz = g.createLinearGradient(0, base - 220, 0, base);
    const hc = AMBIENT[st.time].haze;
    hz.addColorStop(0, hc + '0)'); hz.addColorStop(1, hc + (st.weather === 'fog' ? '0.95)' : '0.6)'));
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = hz; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    if (night() || dusk()) { g.fillStyle = night() ? 'rgba(255,214,140,0.9)' : 'rgba(255,230,180,0.5)'; for (const [a, b] of lit) g.fillRect(a, b, 3, 4); }
  },
  mid(g, w, h) {
    const R = rng(33), ground = h; // 底部＝人行道上緣
    const pal = ['#b65b45', '#c9b9a0', '#8f9aa5', '#d8cfc0', '#6d7f8e', '#a97c55', '#e0d6c8', '#4f6070'];
    let x = 10; const glow = [];
    while (x < w - 60) {
      const bw = 140 + R() * 130, bh = 160 + R() * 220, y = ground - bh, c = pal[Math.floor(R() * pal.length)];
      // 牆面＋側邊陰影（2.5D 厚度）
      const wg = g.createLinearGradient(x, y, x + bw, y);
      wg.addColorStop(0, shade(c, 0.12)); wg.addColorStop(0.85, c); wg.addColorStop(1, shade(c, -0.35));
      g.fillStyle = wg; g.fillRect(x, y, bw, bh);
      g.fillStyle = shade(c, -0.25); g.fillRect(x - 4, y - 6, bw + 8, 8); // 屋簷
      // 屋頂：水塔、冷氣
      if (R() < 0.6) { g.fillStyle = '#6b6f73'; g.fillRect(x + bw * 0.6, y - 26, 28, 20); g.fillStyle = '#9aa0a5'; g.fillRect(x + bw * 0.6 - 2, y - 30, 32, 5); for (const lx of [4, 22]) g.fillRect(x + bw * 0.6 + lx, y - 6, 3, 6); }
      if (R() < 0.5) { g.fillStyle = '#c9cdd1'; g.fillRect(x + 14, y - 14, 22, 14); }
      // 窗戶（有窗框、反光、有的拉窗簾）
      const cols = Math.floor((bw - 20) / 26), rows = Math.floor((bh - 70) / 32);
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const wx = x + 12 + q * 26, wy = y + 14 + r * 32;
        g.fillStyle = shade(c, -0.45); g.fillRect(wx - 1, wy - 1, 18, 22);
        const on = night() ? R() < 0.45 : dusk() ? R() < 0.15 : false;
        const gl = g.createLinearGradient(wx, wy, wx + 16, wy + 20);
        gl.addColorStop(0, '#9fc0d8'); gl.addColorStop(0.5, '#5b7a92'); gl.addColorStop(1, '#2f4558');
        g.fillStyle = gl; g.fillRect(wx, wy, 16, 20);
        if (R() < 0.3) { g.fillStyle = 'rgba(230,220,200,0.8)'; g.fillRect(wx, wy, 16, 7 + R() * 10); }
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(wx + 2, wy + 2, 3, 16);
        if (R() < 0.2) { g.fillStyle = shade(c, -0.3); g.fillRect(wx - 3, wy + 20, 22, 4); } // 陽台
        if (on) glow.push([wx, wy, 16, 20]);
      }
      // 一樓店面：遮雨棚＋招牌
      const sy = ground - 58;
      g.fillStyle = '#2c3138'; g.fillRect(x + 6, sy, bw - 12, 58);
      g.fillStyle = 'rgba(160,200,230,0.35)'; g.fillRect(x + 12, sy + 16, bw - 24, 36);
      const aw = ['#c0392b', '#16a085', '#2c3e50', '#d35400', '#8e44ad'][Math.floor(R() * 5)];
      for (let i = 0; i < (bw - 12) / 14; i++) { g.fillStyle = i % 2 ? aw : '#f2f2f2'; g.beginPath(); g.moveTo(x + 6 + i * 14, sy - 4); g.lineTo(x + 20 + i * 14, sy - 4); g.lineTo(x + 22 + i * 14, sy + 12); g.lineTo(x + 4 + i * 14, sy + 12); g.fill(); }
      const name = SHOPS[Math.floor(R() * SHOPS.length)];
      g.fillStyle = aw; g.fillRect(x + bw * 0.2, sy - 30, bw * 0.6, 22);
      g.fillStyle = '#fff'; g.font = 'bold 15px "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x + bw / 2, sy - 19);
      glow.push([x + bw * 0.2, sy - 30, bw * 0.6, 22, aw, name]); glow.push([x + 12, sy + 16, bw - 24, 36, '#ffe9b0']);
      x += bw + 34 + R() * 40;
      // 行道樹（在建築前面）
      const tx = x - 22 - R() * 10, th = 90 + R() * 50;
      g.fillStyle = '#4b3526'; g.fillRect(tx - 4, ground - th * 0.5, 8, th * 0.5);
      for (let j = 0; j < 9; j++) {
        const lx = tx + (R() - 0.5) * 60, ly = ground - th * 0.55 - R() * th * 0.5, lr = 18 + R() * 20;
        const lg = g.createRadialGradient(lx - lr * 0.3, ly - lr * 0.4, 2, lx, ly, lr);
        lg.addColorStop(0, '#8fbf5a'); lg.addColorStop(0.6, '#4e7d34'); lg.addColorStop(1, '#2e4f22');
        g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI * 2); g.fill();
      }
      if (st.weather === 'snow') { g.fillStyle = 'rgba(245,248,252,0.9)'; g.beginPath(); g.ellipse(tx, ground - th * 0.98, 34, 10, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (st.weather === 'snow') { g.globalCompositeOperation = 'source-atop'; const sg = g.createLinearGradient(0, 0, 0, h); sg.addColorStop(0, 'rgba(240,245,250,0.25)'); sg.addColorStop(1, 'rgba(240,245,250,0)'); g.fillStyle = sg; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; }
    // 環境光遮蔽：建築、樹貼地的地方比較暗（看起來是「站在」地上，不是浮著）
    g.globalCompositeOperation = 'source-atop';
    const ao = g.createLinearGradient(0, ground - 34, 0, ground); ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = ao; g.fillRect(0, ground - 34, w, 34);
    g.globalCompositeOperation = 'source-over';
    tintLayer(g, w, h);
    // 晚上亮燈的窗戶、招牌（在壓暗之後畫，才會亮）
    if (night() || dusk()) for (const [a, b, ww, hh, cc, label] of glow) {
      g.fillStyle = cc ? (cc === '#ffe9b0' ? 'rgba(255,225,160,0.55)' : cc) : 'rgba(255,205,120,0.85)';
      g.globalAlpha = night() ? 1 : 0.5; g.fillRect(a, b, ww, hh);
      if (label) { g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = 'bold 15px "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, a + ww / 2, b + hh / 2); } // 招牌字也要亮
      g.globalAlpha = 1;
    }
  },
  road(g, w, h) {
    // h=230：0~28 人行道、28~36 路緣石、36~200 柏油、200~230 路肩
    const sw = g.createLinearGradient(0, 0, 0, 28); sw.addColorStop(0, '#b9b3a8'); sw.addColorStop(1, '#9e978c');
    g.fillStyle = sw; g.fillRect(0, 0, w, 28);
    g.strokeStyle = 'rgba(70,65,60,0.35)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 8, 28); g.stroke(); }
    g.beginPath(); g.moveTo(0, 14); g.lineTo(w, 14); g.stroke();
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 28, w, 5); g.fillStyle = '#8d8880'; g.fillRect(0, 33, w, 3);
    // 柏油：底色＋顆粒噪點＋修補痕＋裂縫
    const ag = g.createLinearGradient(0, 36, 0, 200); ag.addColorStop(0, '#45474b'); ag.addColorStop(1, '#2d2f33');
    g.fillStyle = ag; g.fillRect(0, 36, w, 164);
    const n = noiseCanvas(w * 0.5, 82, 7, 128, 120, 60); g.globalCompositeOperation = 'overlay'; g.drawImage(n, 0, 36, w, 164); g.globalCompositeOperation = 'source-over';
    const R = rng(44);
    for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.18)'; g.fillRect(R() * w, 36 + R() * 164, 1.2, 1.2); }
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(20,20,22,0.35)'; g.fillRect(R() * w, 60 + R() * 110, 60 + R() * 90, 14 + R() * 24); }
    g.strokeStyle = 'rgba(15,15,15,0.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { let x = R() * w, y = 50 + R() * 140; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += 6 + R() * 14; y += (R() - 0.5) * 10; g.lineTo(x, y); } g.stroke(); }
    // 車道標線（磨損）：虛線＋路邊實線，用「挖掉」小點做出磨損
    g.fillStyle = 'rgba(235,232,220,0.9)';
    for (let x = 0; x < w; x += 180) g.fillRect(x + 20, 110, 110, 6);
    g.fillStyle = 'rgba(240,200,60,0.9)'; g.fillRect(0, 44, w, 4); g.fillRect(0, 50, w, 4);
    g.fillStyle = 'rgba(235,232,220,0.85)'; g.fillRect(0, 192, w, 5);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + R() * 0.7})`; const x = R() * w, y = [46, 52, 113, 194][Math.floor(R() * 4)] + (R() - 0.5) * 6; g.fillRect(x, y, 1 + R() * 3, 1 + R() * 2); }
    g.globalCompositeOperation = 'source-over';
    // 補回被挖掉的柏油（磨損處露出柏油色，不是透明）
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#34363a'; g.fillRect(0, 36, w, 164); g.globalCompositeOperation = 'source-over';
    // 輪胎痕
    g.fillStyle = 'rgba(10,10,10,0.12)'; g.fillRect(0, 140, w, 10); g.fillRect(0, 168, w, 10);
    // 人孔蓋
    g.fillStyle = '#26282b'; g.beginPath(); g.ellipse(w * 0.62, 150, 22, 6, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#4a4d51'; g.stroke();
    // 路肩碎石
    g.fillStyle = '#6f685d'; g.fillRect(0, 200, w, 30);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,36,30' : '180,170,150'},0.5)`; g.fillRect(R() * w, 200 + R() * 30, 2, 2); }
    if (st.weather === 'rain') { // 濕路：深色＋反光條
      g.fillStyle = 'rgba(10,14,20,0.35)'; g.fillRect(0, 36, w, 164);
      for (let i = 0; i < 9; i++) { const x = R() * w, y = 60 + R() * 130, ww = 60 + R() * 120; const pg = g.createRadialGradient(x, y, 2, x, y, ww); pg.addColorStop(0, 'rgba(160,180,200,0.22)'); pg.addColorStop(1, 'rgba(160,180,200,0)'); g.fillStyle = pg; g.beginPath(); g.ellipse(x, y, ww, 8, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (st.weather === 'snow') {
      g.fillStyle = 'rgba(240,244,250,0.92)'; g.fillRect(0, 0, w, 30); g.fillRect(0, 196, w, 34);
      g.fillStyle = 'rgba(235,240,248,0.55)'; g.fillRect(0, 36, w, 100); g.fillRect(0, 182, w, 14);
      g.fillStyle = 'rgba(60,62,66,0.5)'; g.fillRect(0, 140, w, 12); g.fillRect(0, 166, w, 12); // 輪胎壓出來的車轍
    }
    tintLayer(g, w, h);
  },
  fore(g, w, h) {
    // 電線桿（含橫擔、礙子、變壓器）＋垂下來的電線
    const px = 320, top = 30;
    const pole = g.createLinearGradient(px - 9, 0, px + 9, 0); pole.addColorStop(0, '#4a3b2d'); pole.addColorStop(0.5, '#6e5640'); pole.addColorStop(1, '#3a2e23');
    g.fillStyle = pole; g.fillRect(px - 9, top, 18, h - top);
    g.fillStyle = '#3b3f44'; g.fillRect(px - 70, top + 26, 140, 8); g.fillRect(px - 50, top + 70, 100, 7);
    g.fillStyle = '#c9cfd4'; for (const dx of [-62, -30, 30, 62]) { g.fillRect(px + dx - 3, top + 16, 6, 12); }
    g.fillStyle = '#5c6670'; g.fillRect(px + 10, top + 110, 30, 46); g.fillStyle = '#7d8893'; g.fillRect(px + 10, top + 110, 30, 6);
    g.strokeStyle = 'rgba(20,20,22,0.9)'; g.lineWidth = 2.2;
    for (const dx of [-62, -30, 30, 62]) {
      g.beginPath();
      for (let t = 0; t <= 1.0001; t += 0.02) { const xx = px + dx + t * w, yy = top + 18 + Math.sin(t * Math.PI) * 70; t ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      g.stroke();
      g.beginPath();
      for (let t = 0; t <= 1.0001; t += 0.02) { const xx = px + dx - w + t * w, yy = top + 18 + Math.sin(t * Math.PI) * 70; t ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      g.stroke();
    }
    // 護欄（W 型鋼板＋立柱＋反光片）
    const gy = 664;
    for (let x = 30; x < w; x += 150) { g.fillStyle = '#5d646b'; g.fillRect(x, gy, 12, h - gy); }
    const gb = g.createLinearGradient(0, gy + 4, 0, gy + 34);
    gb.addColorStop(0, '#d9dee2'); gb.addColorStop(0.3, '#9aa3ab'); gb.addColorStop(0.55, '#e7ebee'); gb.addColorStop(0.8, '#8b949c'); gb.addColorStop(1, '#5f676e');
    g.fillStyle = gb; g.fillRect(0, gy + 4, w, 30);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, gy + 18, w, 2);
    for (let x = 60; x < w; x += 150) { g.fillStyle = '#ffcc33'; g.fillRect(x, gy + 12, 8, 12); }
    if (st.weather === 'snow') { g.fillStyle = 'rgba(245,248,252,0.95)'; g.fillRect(0, gy, w, 6); g.fillRect(px - 72, top + 22, 144, 4); }
    tintLayer(g, w, h);
    // 前景比較暗（離鏡頭近、背光）
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  },
};

// ---------------- 卡車（分層繪製） ----------------
const truck = {
  x: 0, v: 0, thr: 0, brk: 0, rev: false, wheelA: 0,
  // 避震：車頭、拖車各一組彈簧（位置、速度）；pitch＝加速／煞車時點頭
  susT: 0, susTv: 0, susR: 0, susRv: 0, pitch: 0, pitchV: 0, lastV: 0,
};
const PX_PER_M = 35;
const TC = { w: 740, h: 320 }; // 卡車畫布大小（設計像素）
let truckCv = mkCanvas(10, 10), tcx = truckCv.getContext('2d');
function roadBump(x) { return Math.sin(x * 0.021) * 1.2 + Math.sin(x * 0.0067 + 1.3) * 1.6 + ((Math.floor(x / 900) % 3 === 0 && (x % 900) < 40) ? 5 : 0); }

function drawWheel(g, cx, cy, r, ang, cfg) {
  if (ART.wheel) { g.save(); g.translate(cx, cy); g.rotate(ang); g.drawImage(ART.wheel, -r, -r, r * 2, r * 2); g.restore(); return; }
  const tg = g.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.3, cx, cy, r);
  tg.addColorStop(0, '#2a2a2c'); tg.addColorStop(0.85, '#141415'); tg.addColorStop(1, '#050505');
  g.fillStyle = tg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(cx, cy); g.rotate(ang);
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 3; for (let i = 0; i < 18; i++) { g.rotate(Math.PI / 9); g.beginPath(); g.moveTo(r - 6, 0); g.lineTo(r - 1, 0); g.stroke(); } // 胎紋
  const rimC = { std: ['#f0f0ec', '#b9bcbf'], chrome: ['#ffffff', '#8d969e'], gold: ['#ffe08a', '#b8861b'], color: [cfg.cabColor, shade(cfg.cabColor, -0.4)] }[cfg.rims] || ['#f0f0ec', '#b9bcbf'];
  const rg = g.createRadialGradient(-r * 0.15, -r * 0.2, 2, 0, 0, r * 0.62);
  rg.addColorStop(0, rimC[0]); rg.addColorStop(1, rimC[1]);
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.ellipse(r * 0.36, 0, r * 0.1, r * 0.07, 0, 0, Math.PI * 2); g.fill(); } // 輪框孔
  g.fillStyle = '#555b61'; g.beginPath(); g.arc(0, 0, r * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c7ccd0'; for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.arc(r * 0.22, 0, 1.8, 0, Math.PI * 2); g.fill(); } // 螺帽
  g.restore();
}
function paintFill(g, x, y, w, h, color, paint) {
  // 車漆：底色＋上亮下暗＋一條高光反射（金屬漆有亮點、霧面沒有反光）
  const bg = g.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, shade(color, 0.28)); bg.addColorStop(0.35, color); bg.addColorStop(1, shade(color, -0.42));
  g.fillStyle = bg; g.fill();
  if (paint !== 'matte') {
    g.save(); g.clip();
    const hl = g.createLinearGradient(x, y, x + w * 0.6, y + h);
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.42, 'rgba(255,255,255,0)'); hl.addColorStop(0.5, `rgba(255,255,255,${paint === 'chrome' ? 0.7 : 0.38})`); hl.addColorStop(0.58, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(x, y, w, h);
    if (paint === 'metal' || paint === 'pearl' || paint === 'candy') { const R = rng(5); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.35})`; g.fillRect(x + R() * w, y + R() * h, 1, 1); } }
    g.restore();
  }
}
// 車身質感：細刮痕、髒污、粗糙度不均（越髒越明顯；3D 版洗車後會變乾淨）
let grimeTex = null;
function grime(g, x, y, w, h) {
  if (!grimeTex) {
    grimeTex = mkCanvas(512, 256); const q = grimeTex.getContext('2d'), R = rng(77);
    q.drawImage(noiseCanvas(256, 128, 5, 128, 70, 40), 0, 0, 512, 256); // 粗糙度不均
    for (let i = 0; i < 140; i++) { const sx = R() * 512, sy = R() * 256, l = 6 + R() * 30, a = R() * Math.PI; q.strokeStyle = `rgba(255,255,255,${0.12 + R() * 0.25})`; q.lineWidth = 0.6; q.beginPath(); q.moveTo(sx, sy); q.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l * 0.3); q.stroke(); } // 細刮痕
    const dg = q.createLinearGradient(0, 120, 0, 256); dg.addColorStop(0, 'rgba(92,72,48,0)'); dg.addColorStop(1, 'rgba(92,72,48,0.75)'); q.fillStyle = dg; q.fillRect(0, 0, 512, 256); // 下面的泥巴
    for (let i = 0; i < 500; i++) { q.fillStyle = `rgba(70,55,38,${R() * 0.5})`; q.beginPath(); q.arc(R() * 512, 170 + R() * 86, R() * 2.2, 0, Math.PI * 2); q.fill(); } // 噴濺的泥點
  }
  const dirt = clamp(save.dirt ?? 0.2, 0.15, 1);
  g.save(); g.clip(); g.globalAlpha = 0.35 + dirt * 0.65; g.drawImage(grimeTex, x, y, w, h); g.restore();
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
function art(g, k) { const im = ART[k]; if (!im) return false; const [x, y, w, h] = ART_BOX[k]; g.drawImage(im, x, y, w, h); return true; }

function renderTruck(braking, scale = 1.18) {
  const cfg = truckCfg(), s = K * DPR * scale;
  if (truckCv.width !== Math.round(TC.w * s) || truckCv.height !== Math.round(TC.h * s)) { truckCv = mkCanvas(TC.w * s, TC.h * s); tcx = truckCv.getContext('2d'); }
  const g = tcx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, truckCv.width, truckCv.height); g.setTransform(s, 0, 0, s, 0, 0);
  const R = 30, gy = 300 - R; // 輪子中心高度
  const ty = -truck.susT, ry = -truck.susR; // 彈簧往上壓＝車身往上
  const axT = [500, 556, 652], axR = [70, 132];
  // 1. 底層：車架＋懸吊（葉片彈簧連到輪軸）
  g.save(); g.translate(0, ry);
  if (!art(g, 'chassis')) {
    g.fillStyle = '#1c1e21'; g.fillRect(16, 236, 480, 14);
    g.fillStyle = '#2b2e32'; g.fillRect(410, 250, 10, 34); g.fillRect(398, 282, 34, 6); // 支撐腳
  }
  g.restore();
  for (const ax of axR) { g.strokeStyle = '#3a3e43'; g.lineWidth = 5; g.beginPath(); g.moveTo(ax - 26, 250 + ry); g.quadraticCurveTo(ax, 262 + ry * 0.4, ax + 26, 250 + ry); g.stroke(); g.fillStyle = '#555'; g.fillRect(ax - 3, gy - 6, 6, 250 + ry - gy + 6); }
  g.save(); g.translate(0, ty);
  g.fillStyle = '#1c1e21'; g.fillRect(470, 238, 236, 14);
  g.restore();
  for (const ax of axT) { g.strokeStyle = '#3a3e43'; g.lineWidth = 5; g.beginPath(); g.moveTo(ax - 24, 252 + ty); g.quadraticCurveTo(ax, 264 + ty * 0.4, ax + 24, 252 + ty); g.stroke(); g.fillStyle = '#666'; g.fillRect(ax - 3, gy - 6, 6, 252 + ty - gy + 6); }
  // 2. 拖車車身（烤漆）
  g.save(); g.translate(0, ry);
  if (!art(g, 'trailer')) {
    rr(g, 14, 60, 512, 178, 6); paintFill(g, 14, 60, 512, 178, cfg.trailerColor, 'normal'); grime(g, 14, 60, 512, 178);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1.5; for (let x = 40; x < 520; x += 22) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 234); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(14, 228, 512, 10);
    const light = parseInt(cfg.trailerColor.slice(1), 16), lum = ((light >> 16) * 0.3 + ((light >> 8) & 255) * 0.59 + (light & 255) * 0.11);
    g.fillStyle = lum > 150 ? '#1b2735' : '#ffffff'; g.font = 'bold 56px "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(cfg.name || '我的卡車').slice(0, 8), 270, 150);
    g.fillStyle = '#ffb020'; for (let x = 30; x < 520; x += 60) g.fillRect(x, 222, 30, 5); // 反光條
  }
  // 尾燈（煞車時亮）
  g.fillStyle = braking ? '#ff2a2a' : '#7a1010'; g.fillRect(10, 196, 8, 22);
  g.restore();
  // 3. 車頭（烤漆＋車窗＋水箱罩）
  g.save(); g.translate(0, ty); g.translate(600, 250); g.rotate(truck.pitch); g.translate(-600, -250);
  if (!art(g, 'cab')) {
    g.beginPath(); g.moveTo(546, 250); g.lineTo(546, 92); g.quadraticCurveTo(548, 66, 576, 64); g.lineTo(676, 64); g.quadraticCurveTo(700, 66, 704, 96); g.lineTo(712, 200); g.lineTo(712, 250); g.closePath();
    paintFill(g, 546, 64, 166, 186, cfg.cabColor, cfg.paint); grime(g, 546, 64, 166, 186);
    // 車窗（反射天空）
    g.beginPath(); g.moveTo(640, 80); g.lineTo(690, 80); g.quadraticCurveTo(700, 82, 701, 98); g.lineTo(704, 140); g.lineTo(640, 140); g.closePath();
    const wg = g.createLinearGradient(640, 80, 700, 140); wg.addColorStop(0, '#9fc3dc'); wg.addColorStop(0.45, '#3d5a70'); wg.addColorStop(1, '#1b2a36');
    g.fillStyle = wg; g.fill();
    // 司機（有精靈圖就用 assets/side/sheets/driver.png）
    g.save(); g.clip();
    const bob = Math.sin(worldT * 2.2) * 0.8 - truck.susTv * 0.01;
    if (!driverAnim.draw(g, 648, 84 + bob, 56, 64)) {
      g.fillStyle = '#2b3542'; g.beginPath(); g.ellipse(674, 142 + bob, 22, 16, 0, Math.PI, 0); g.fill();
      const hg = g.createRadialGradient(670, 106 + bob, 1, 672, 108 + bob, 11); hg.addColorStop(0, '#f1c99b'); hg.addColorStop(1, '#c68e5c');
      g.fillStyle = hg; g.beginPath(); g.arc(672, 109 + bob, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1e1a18'; g.beginPath(); g.arc(672, 105 + bob, 10.5, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#c0392b'; g.fillRect(661, 98 + bob, 22, 4); // 帽沿
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(650, 84); g.lineTo(662, 84); g.lineTo(648, 136); g.lineTo(642, 136); g.fill();
    g.fillStyle = '#20262d'; g.fillRect(560, 84, 66, 40); // 臥舖小窗
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(634, 80); g.lineTo(634, 240); g.moveTo(634, 240); g.lineTo(706, 240); g.stroke(); // 車門縫
    g.fillStyle = '#c9ced3'; g.fillRect(616, 160, 14, 4); // 門把
    g.fillStyle = '#25292e'; g.fillRect(704, 150, 9, 70); // 水箱罩（側面）
    // 側踏板、油箱
    g.fillStyle = '#8f969c'; g.fillRect(588, 236, 40, 8);
    const tg = g.createLinearGradient(0, 214, 0, 246); tg.addColorStop(0, '#f3f5f7'); tg.addColorStop(0.5, '#9aa2aa'); tg.addColorStop(1, '#d9dde1');
    g.fillStyle = tg; rr(g, 470, 212, 70, 34, 14); g.fill();
    // 後照鏡
    g.fillStyle = '#1e2226'; g.fillRect(704, 104, 6, 30); g.fillRect(708, 96, 10, 40);
  }
  // 頭燈（燈殼；光束另外畫）
  g.fillStyle = '#e8eef3'; g.fillRect(706, 196, 8, 12);
  g.fillStyle = '#ff9a00'; g.fillRect(706, 210, 8, 5);
  // 4. 改裝套件
  if (cfg.spoiler === 'on' && !art(g, 'spoiler')) { g.beginPath(); g.moveTo(552, 64); g.quadraticCurveTo(570, 38, 640, 40); g.lineTo(676, 44); g.quadraticCurveTo(690, 52, 690, 64); g.closePath(); paintFill(g, 552, 38, 140, 28, cfg.cabColor, cfg.paint); }
  if (cfg.lightbar === 'on' && !art(g, 'lightbar')) { g.fillStyle = '#16181b'; rr(g, 566, 50, 124, 12, 4); g.fill(); g.fillStyle = st.lights ? '#fffbe8' : '#c9d2da'; for (let i = 0; i < 7; i++) g.fillRect(572 + i * 17, 53, 12, 6); }
  if (cfg.visor === 'on') { g.fillStyle = shade(cfg.cabColor, -0.3); g.beginPath(); g.moveTo(636, 74); g.lineTo(708, 70); g.lineTo(712, 78); g.lineTo(640, 82); g.fill(); }
  if (cfg.bumper !== 'std' || ART.bumper) {
    if (!art(g, 'bumper')) {
      if (cfg.bumper === 'bull') { g.strokeStyle = '#c9ced3'; g.lineWidth = 5; g.beginPath(); g.moveTo(700, 252); g.lineTo(720, 252); g.lineTo(720, 190); g.lineTo(704, 186); g.moveTo(720, 222); g.lineTo(706, 222); g.stroke(); }
      else { const cg = g.createLinearGradient(0, 228, 0, 254); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, '#8d969e'); cg.addColorStop(1, '#e8ecef'); g.fillStyle = cg; rr(g, 690, 226, 26, 28, 5); g.fill(); }
    }
  } else { g.fillStyle = '#23262a'; rr(g, 692, 228, 22, 26, 4); g.fill(); }
  if (cfg.stacks === 'on' && !art(g, 'stacks')) {
    const sg = g.createLinearGradient(534, 0, 556, 0); sg.addColorStop(0, '#8d969e'); sg.addColorStop(0.4, '#ffffff'); sg.addColorStop(1, '#6f777e');
    g.fillStyle = sg; g.fillRect(536, 26, 16, 222); g.fillStyle = '#5f676e'; g.beginPath(); g.ellipse(544, 26, 8, 3, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // 5. 輪子（最上層，會轉）
  for (const ax of axR) drawWheel(g, ax, gy, R, truck.wheelA, cfg);
  for (const ax of axT) drawWheel(g, ax, gy, R, truck.wheelA, cfg);
  return { headY: 202 + ty, tailY: 207 + ry, stackTop: cfg.stacks === 'on' ? { x: 544, y: 24 + ty } : { x: 520, y: 246 + ty } };
}

// ---------------- 粒子：廢氣、雨、雪 ----------------
const smoke = [], rainP = [], snowP = [];
const puff = (() => { const c = mkCanvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(120,122,126,0.55)'); gr.addColorStop(1, 'rgba(120,122,126,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })();
const grain = noiseCanvas(256, 256, 99, 128, 255, 255);

// ---------------- 輸入 ----------------
const input = { gas: false, brake: false };
const keyOn = (e, v) => {
  if (['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW'].includes(e.code)) input.gas = v;
  if (['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS', 'Space'].includes(e.code)) input.brake = v;
};
addEventListener('keydown', (e) => { keyOn(e, true); if (e.repeat) return; if (e.code === 'KeyL') toggleLights(); if (e.code === 'KeyG') toggleGarage(); if (e.code === 'KeyT') cycle('time'); if (e.code === 'KeyY') cycle('weather'); });
addEventListener('keyup', (e) => keyOn(e, false));
addEventListener('blur', () => { input.gas = input.brake = false; });
function pedal(id, key) {
  const b = $(id);
  const on = (e) => { e.preventDefault(); input[key] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ } };
  const off = () => { input[key] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
}
pedal('#pGas', 'gas'); pedal('#pBrake', 'brake');
function refreshUI() {
  $('#bTime').textContent = TIMES[st.time]; $('#bWeather').textContent = WEATHERS[st.weather];
  $('#bLights').classList.toggle('on', st.lights); $('#bGarage').classList.toggle('on', st.mode === 'garage');
  $('#coins').textContent = '💰 ' + (readSave().coins ?? 0).toLocaleString();
}
function autoLights() { if (!st.lightsManual) st.lights = st.time !== 'day' || st.weather !== 'clear'; }
function toggleLights() { st.lights = !st.lights; st.lightsManual = true; refreshUI(); }
function cycle(kind) {
  const list = kind === 'time' ? Object.keys(TIMES) : Object.keys(WEATHERS);
  st[kind] = list[(list.indexOf(st[kind]) + 1) % list.length];
  st.lightsManual = false; autoLights(); refreshUI(); toast(kind === 'time' ? TIMES[st.time] : WEATHERS[st.weather], 1000);
}
$('#bTime').onclick = () => cycle('time'); $('#bWeather').onclick = () => cycle('weather');
$('#bLights').onclick = () => toggleLights(); $('#bGarage').onclick = () => toggleGarage();

// ---------------- 車庫（工業風＋三點打光） ----------------
const PALETTE = ['#b71c1c', '#e65100', '#f9a825', '#2e7d32', '#00695c', '#0277bd', '#1a237e', '#4a148c', '#ad1457', '#f5f5f5', '#9e9e9e', '#37474f', '#111111', '#5d4037', '#c0a062', '#00e5ff'];
const PARTS = [
  ['bumper', '保險桿', [['std', '原廠'], ['chromeb', '電鍍'], ['bull', '鐵牛欄']]],
  ['spoiler', '車頂導流罩', [['off', '不裝'], ['on', '導流罩']]],
  ['lightbar', '車頂 LED 燈條', [['off', '不裝'], ['on', '燈條']]],
  ['stacks', '直立排氣管', [['off', '不裝'], ['on', '電鍍排氣管']]],
  ['rims', '輪框', [['std', '原廠'], ['color', '同車身色'], ['chrome', '拋光鋁圈'], ['gold', '黃金']]],
  ['paint', '烤漆質感', [['normal', '亮光'], ['metal', '金屬'], ['matte', '霧面'], ['pearl', '珍珠'], ['chrome', '電鍍'], ['candy', '糖果']]],
];
function renderGarageUI() {
  const cfg = truckCfg();
  let h = '<h3>🎨 車頭顏色</h3><div class="row">' + PALETTE.map((c) => `<button class="sw ${cfg.cabColor === c ? 'sel' : ''}" data-col="cabColor" data-v="${c}" style="background:${c}"></button>`).join('') + '</div>';
  h += '<h3>📦 拖車顏色</h3><div class="row">' + PALETTE.map((c) => `<button class="sw ${cfg.trailerColor === c ? 'sel' : ''}" data-col="trailerColor" data-v="${c}" style="background:${c}"></button>`).join('') + '</div>';
  for (const [cat, title, items] of PARTS) {
    h += `<h3>${title}</h3><div class="row">` + items.map(([id, n]) => { const ok = owned(cat, id); return `<button class="opt ${cfg[cat] === id ? 'sel' : ''} ${ok ? '' : 'lock'}" data-cat="${cat}" data-v="${id}">${ok ? '' : '🔒 '}${n}</button>`; }).join('') + '</div>';
  }
  h += '<div class="note">🔒 的零件要先到 3D 版的改裝廠用金幣買，買了這裡就能用。顏色免費換，兩邊會同步。<br>想換成自己畫的精緻圖：把 PNG 放到 assets/side/ 資料夾（說明在 assets/side/README.txt）。</div>';
  $('#garageUI').innerHTML = h;
}
$('#garageUI').addEventListener('click', (e) => {
  const sw = e.target.closest('[data-col]'); if (sw) { writeTruck({ [sw.dataset.col]: sw.dataset.v }); renderGarageUI(); return; }
  const o = e.target.closest('[data-cat]'); if (!o) return;
  if (!owned(o.dataset.cat, o.dataset.v)) { toast('這個要先到 3D 版的改裝廠買喔', 1800); return; }
  writeTruck({ [o.dataset.cat]: o.dataset.v }); renderGarageUI();
});
function toggleGarage() {
  if (st.mode !== 'garage' && Math.abs(truck.v) > 40) { toast('先停車再進車庫'); return; }
  st.mode = st.mode === 'garage' ? 'road' : 'garage'; truck.v = 0;
  $('#garageUI').style.display = st.mode === 'garage' ? 'block' : 'none';
  if (st.mode === 'garage') { save = readSave(); renderGarageUI(); }
  document.querySelectorAll('.pedals').forEach((p) => (p.style.display = st.mode === 'garage' ? 'none' : 'flex'));
  refreshUI();
}
let garageBg = null;
// 車庫每格要用的暫存畫布：重複使用，不要每一格都新開（手機會卡）
const scratchCv = [];
function scratch(i, w, h) { let c = scratchCv[i]; if (!c || c.width !== w || c.height !== h) { c = scratchCv[i] = mkCanvas(w, h); } return c; }
function getGarageBg() {
  const key = `${W}x${H}x${DPR}`;
  if (garageBg && garageBg.key === key) return garageBg.c;
  const c = mkCanvas(W * DPR, H * DPR), g = c.getContext('2d'); g.scale(DPR, DPR);
  // 混凝土牆＋雜訊
  const wg = g.createLinearGradient(0, 0, 0, H * 0.7); wg.addColorStop(0, '#1b1e22'); wg.addColorStop(1, '#2a2d31');
  g.fillStyle = wg; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.35; g.drawImage(noiseCanvas(W / 2, H / 2, 3, 128, 90), 0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let x = 0; x < W; x += W / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * 0.72); g.stroke(); }
  // 捲門
  const dx = W * 0.3, dw = W * 0.4, dh = H * 0.5;
  g.fillStyle = '#3a3f45'; g.fillRect(dx, H * 0.72 - dh, dw, dh);
  for (let y = H * 0.72 - dh; y < H * 0.72; y += 9) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(dx, y, dw, 2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(dx, y + 6, dw, 2); }
  // 鋼樑、立柱
  g.fillStyle = '#121417'; g.fillRect(0, H * 0.08, W, H * 0.035); for (const x of [W * 0.06, W * 0.94]) g.fillRect(x - 12, 0, 24, H * 0.72);
  g.fillStyle = '#e0a800'; for (let x = 0; x < W; x += 60) { g.save(); g.translate(x, H * 0.115); g.transform(1, 0, -0.6, 1, 0, 0); g.fillRect(0, 0, 24, 8); g.restore(); }
  // 工具牆
  g.fillStyle = '#23272c'; g.fillRect(W * 0.08, H * 0.25, W * 0.18, H * 0.26);
  g.fillStyle = '#4b535b'; for (let i = 0; i < 9; i++) g.fillRect(W * 0.095 + (i % 3) * W * 0.055, H * 0.28 + Math.floor(i / 3) * H * 0.075, W * 0.03, H * 0.05);
  // 地板：深色環氧樹脂（亮面）＋格線
  const fg = g.createLinearGradient(0, H * 0.72, 0, H); fg.addColorStop(0, '#2b2f34'); fg.addColorStop(1, '#0d0f11');
  g.fillStyle = fg; g.fillRect(0, H * 0.72, W, H * 0.28);
  g.strokeStyle = 'rgba(255,255,255,0.05)'; for (let i = -10; i < 20; i++) { g.beginPath(); g.moveTo(W / 2 + i * 120, H * 0.72); g.lineTo(W / 2 + i * 380, H); g.stroke(); }
  g.fillStyle = '#e0a800'; g.fillRect(0, H * 0.72, W, 3);
  // 吊燈
  for (const x of [W * 0.25, W * 0.5, W * 0.75]) { g.strokeStyle = '#000'; g.beginPath(); g.moveTo(x, H * 0.115); g.lineTo(x, H * 0.18); g.stroke(); g.fillStyle = '#2c3136'; g.beginPath(); g.moveTo(x - 26, H * 0.2); g.lineTo(x + 26, H * 0.2); g.lineTo(x + 12, H * 0.18); g.lineTo(x - 12, H * 0.18); g.fill(); g.fillStyle = '#fff6dc'; g.fillRect(x - 20, H * 0.2, 40, 3); }
  garageBg = { key, c };
  return c;
}

// ---------------- 行人（精靈圖序列幀；沒放圖就用程式畫的人物） ----------------
const walkerSheet = new SpriteSheet('walker'), driverSheet = new SpriteSheet('driver');
const driverAnim = new Animator(driverSheet, 'idle');
const peds = []; const pedR = rng(321);
function updatePeds(dt, camX) {
  const L = camX - 300, Rr = camX + VW + 300;
  while (peds.length < 9) peds.push({ wx: L + pedR() * (Rr - L), dir: pedR() < 0.5 ? 1 : -1, sp: 38 + pedR() * 30, look: randomLook(pedR), anim: new Animator(walkerSheet, 'walk'), phase: pedR() * 10, wait: 0, y: 518 + pedR() * 6 });
  const rainy = st.weather === 'rain' || st.weather === 'snow';
  for (const p of peds) {
    if (p.wait > 0) { p.wait -= dt; p.anim.play(rainy ? 'umbrella' : 'idle'); }
    else { p.wx += p.dir * p.sp * dt; p.phase += dt * p.sp * 0.11; p.anim.play(rainy ? 'umbrella' : 'walk'); if (pedR() < dt * 0.05) p.wait = 2 + pedR() * 4; }
    p.anim.update(dt);
    if (p.wx < L - 200 || p.wx > Rr + 200) { p.wx = p.dir > 0 ? L : Rr; p.look = randomLook(pedR); }
  }
}
function drawPeds(camX) {
  const rainy = st.weather === 'rain' || st.weather === 'snow';
  ctx.save();
  ctx.filter = st.time === 'night' ? 'brightness(0.5) saturate(0.8)' : st.time === 'dusk' ? 'brightness(0.85) sepia(0.15)' : 'none';
  for (const p of [...peds].sort((a, b) => a.y - b.y)) {
    const x = (p.wx - camX) * K, y = p.y * K, h = 74 * K;
    if (x < -80 || x > W + 80) continue;
    // 腳下的接觸陰影
    const sg = ctx.createRadialGradient(x, y, 1, x, y, 16 * K); sg.addColorStop(0, 'rgba(0,0,0,0.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y, 16 * K, 4 * K, 0, 0, Math.PI * 2); ctx.fill();
    if (!p.anim.draw(ctx, x - h * 0.3, y - h, h * 0.6, h, p.dir < 0)) drawPerson(ctx, x, y, h, p.phase, p.look, { walking: p.wait <= 0, flip: p.dir < 0, umbrella: rainy });
  }
  ctx.restore();
}
// ---------------- 微塵（光線裡才看得到）、鏡頭微震動 ----------------
const dust = []; for (let i = 0; i < 160; i++) dust.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6 });
let shake = 0, lastBump = 0;
function drawDust(dt, beams) {
  ctx.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    d.x += (Math.sin(worldT * 0.4 + d.ph) * 0.004 - truck.v * 0.00002 * d.z) * dt; d.y += Math.cos(worldT * 0.3 + d.ph) * 0.003 * dt;
    d.x = (d.x + 1) % 1; d.y = (d.y + 1) % 1;
    const x = d.x * W, y = d.y * H;
    let lit = st.time === 'day' && st.weather === 'clear' ? 0.12 : 0.03;
    for (const b of beams) if (b(x, y)) { lit = 0.7; break; }
    ctx.fillStyle = `rgba(255,236,200,${lit * d.z})`; ctx.beginPath(); ctx.arc(x, y, (0.6 + d.z * 1.4) * K, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
// 白天的斜射光（God rays）
function drawSunShafts() {
  if (st.time === 'night' || st.weather === 'rain') return;
  ctx.globalCompositeOperation = 'screen';
  const sx = W * (st.time === 'dusk' ? 0.2 : 0.78);
  for (let i = 0; i < 4; i++) {
    const x0 = sx + (i - 1.5) * W * 0.06, g = ctx.createLinearGradient(x0, 0, x0 - W * 0.25, H);
    g.addColorStop(0, `rgba(255,236,190,${st.time === 'dusk' ? 0.12 : 0.07})`); g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 - 18, 0); ctx.lineTo(x0 + 18, 0); ctx.lineTo(x0 - W * 0.22, H); ctx.lineTo(x0 - W * 0.34, H); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
// ---------------- 電影濾鏡（WebGL 著色器）開關 ----------------
const FX_KEY = 'truckSide_fx';
let post = null, fxOn = localStorage.getItem(FX_KEY) !== 'off';
function setupPost() {
  if (fxOn && !post) { try { post = createPost(cv); } catch (e) { post = null; } if (post) document.body.insertBefore(post.canvas, cv.nextSibling); }
  if (post) post.canvas.style.display = fxOn ? 'block' : 'none';
  cv.style.visibility = fxOn && post ? 'hidden' : 'visible';
  const b = $('#bFx'); if (b) { b.classList.toggle('on', fxOn && !!post); if (!post && fxOn) b.title = '這台裝置不支援電影濾鏡'; }
}
if ($('#bFx')) $('#bFx').onclick = () => { fxOn = !fxOn; localStorage.setItem(FX_KEY, fxOn ? 'on' : 'off'); setupPost(); resize(); toast(fxOn ? '🎞 電影濾鏡：開（色差、冷暖調色、鏡頭雨滴）' : '電影濾鏡：關', 1500); };

// ---------------- 主迴圈 ----------------
let last = performance.now(), worldT = 0, sweep = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, fxOn && post ? 1.5 : 2); W = innerWidth; H = innerHeight; // 開濾鏡時解析度上限低一點，比較順 K = H / DH; VW = W / K;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
addEventListener('resize', resize); setupPost(); resize();

function update(dt) {
  worldT += dt;
  if (st.mode === 'road') {
    // 油門、煞車（停住後按住煞車＝倒車）
    truck.thr += ((input.gas ? 1 : 0) - truck.thr) * Math.min(1, dt * 4);
    const grip = st.weather === 'snow' ? 0.55 : st.weather === 'rain' ? 0.8 : 1;
    if (input.brake && truck.v <= 5) truck.rev = true;
    if (input.gas) truck.rev = false;
    let a = 0;
    if (truck.rev) { a = input.brake ? -140 : 0; if (truck.v < -180) a = 0; if (!input.brake && truck.v < 0) a = 260; }
    else { a = truck.thr * 230 * (1 - truck.v / 1050); if (input.brake) a -= 520 * grip; }
    a -= truck.v * 0.06 + Math.sign(truck.v) * 12;
    truck.v += a * dt;
    if (!truck.rev && truck.v < 0) truck.v = 0;
    if (truck.rev && truck.v > 0 && !input.gas) truck.v = 0;
    truck.x += truck.v * dt;
    truck.wheelA += (truck.v * dt) / 30;
  } else { truck.thr = 0; truck.v = 0; }
  // 避震器：彈簧＋阻尼，路面顛簸讓車身微微上下跳（拖車比車頭慢半拍）
  const bT = roadBump(truck.x + 620) * Math.min(1, Math.abs(truck.v) / 300), bR = roadBump(truck.x + 100) * Math.min(1, Math.abs(truck.v) / 300);
  const idle = st.mode === 'garage' ? Math.sin(worldT * 2) * 0.6 : Math.sin(worldT * 9) * 0.25;
  truck.susTv += ((bT + idle - truck.susT) * 140 - truck.susTv * 9) * dt; truck.susT += truck.susTv * dt;
  truck.susRv += ((bR - truck.susR) * 110 - truck.susRv * 8) * dt; truck.susR += truck.susRv * dt;
  const acc = (truck.v - truck.lastV) / Math.max(dt, 1e-3); truck.lastV = truck.v;
  // 鏡頭微震動：壓到人孔蓋、急煞
  const jolt = Math.abs(bT - lastBump); lastBump = bT;
  if (jolt > 1.5) shake = Math.min(1, shake + jolt * 0.06);
  if (input.brake && truck.v > 300) shake = Math.min(0.5, shake + dt * 0.6);
  shake = Math.max(0, shake - dt * 2.2);
  truck.pitchV += ((clamp(-acc * 0.00006, -0.03, 0.03) - truck.pitch) * 90 - truck.pitchV * 10) * dt; truck.pitch += truck.pitchV * dt;
  $('#speed').textContent = `${Math.round(Math.abs(truck.v) / PX_PER_M * 3.6)} km/h`;
}

function drawSky() {
  const a = AMBIENT[st.time], g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  g.addColorStop(0, a.sky[0]); g.addColorStop(0.55, a.sky[1]); g.addColorStop(1, a.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (st.weather !== 'clear') { ctx.fillStyle = `rgba(120,128,140,${st.weather === 'fog' ? 0.7 : 0.55})`; ctx.fillRect(0, 0, W, H); }
  // 太陽／月亮＋光暈
  const sx = W * (st.time === 'dusk' ? 0.2 : 0.78), sy = H * (st.time === 'dusk' ? 0.52 : 0.16);
  if (st.weather === 'clear' || st.weather === 'fog') {
    const gl = ctx.createRadialGradient(sx, sy, 4, sx, sy, H * 0.35);
    gl.addColorStop(0, st.time === 'night' ? 'rgba(220,230,255,0.35)' : 'rgba(255,240,200,0.6)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = a.sun; ctx.beginPath(); ctx.arc(sx, sy, H * (st.time === 'night' ? 0.03 : 0.04), 0, Math.PI * 2); ctx.fill();
  }
  if (st.time === 'night' && st.weather === 'clear') { const R = rng(7); ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 160; i++) ctx.fillRect(R() * W, R() * H * 0.45, 1.2, 1.2); }
}
function drawLayer(L, camX) {
  const tile = getTile(L), tw = L.w * K, off = -(((camX * L.speed + (L.drift ? worldT * L.drift : 0)) * K) % tw + tw) % tw;
  const y = L.y * K;
  for (let x = off; x < W; x += tw) ctx.drawImage(tile, x, y, tw, L.h * K);
}
// 路燈（在路面圖層上、卡車後面）：桿子＋晚上的燈頭光暈和地面光圈
function lampXs(camX) { const out = [], step = 560, start = Math.floor((camX - 100) / step) * step; for (let x = start; x < camX + VW + 200; x += step) out.push((x - camX + 60) * K); return out; }
function drawLamps(camX) {
  for (const x of lampXs(camX)) {
    ctx.fillStyle = '#41474d'; ctx.fillRect(x - 3 * K, 270 * K, 6 * K, 236 * K);
    ctx.fillRect(x, 270 * K, 46 * K, 5 * K);
    ctx.fillStyle = '#1f2327'; ctx.fillRect(x + 34 * K, 266 * K, 26 * K, 10 * K);
    ctx.fillStyle = st.lights || st.time !== 'day' ? '#fff3cf' : '#b8c0c8'; ctx.fillRect(x + 36 * K, 275 * K, 22 * K, 3 * K);
  }
}
function lampLight(camX) {
  if (st.time === 'day' && st.weather === 'clear') return;
  const strengthBase = st.time === 'night' ? 1 : st.time === 'dusk' ? 0.55 : 0.3;
  ctx.globalCompositeOperation = 'lighter';
  for (const x of lampXs(camX)) {
    const lx = x + 47 * K, ly = 278 * K;
    // 有些路燈老舊，會一閃一閃（動態光源）
    const idx = Math.round((x / K + camX - 60) / 560), flick = ((idx % 5) + 5) % 5 === 2 ? (Math.sin(worldT * 31 + idx) > 0.6 || Math.sin(worldT * 7.3 + idx * 2) > 0.85 ? 0.25 : 1) : 1;
    const strength = strengthBase * flick;
    const cone = ctx.createLinearGradient(lx, ly, lx, 640 * K);
    cone.addColorStop(0, `rgba(255,214,150,${0.32 * strength})`); cone.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(lx - 10 * K, ly); ctx.lineTo(lx + 10 * K, ly); ctx.lineTo(lx + 110 * K, 640 * K); ctx.lineTo(lx - 110 * K, 640 * K); ctx.fill();
    const pool = ctx.createRadialGradient(lx, 600 * K, 4, lx, 600 * K, 140 * K);
    pool.addColorStop(0, `rgba(255,200,130,${0.35 * strength})`); pool.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(lx, 600 * K, 150 * K, 40 * K, 0, 0, Math.PI * 2); ctx.fill();
    const head = ctx.createRadialGradient(lx, ly, 1, lx, ly, 40 * K); head.addColorStop(0, `rgba(255,240,200,${0.9 * strength})`); head.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = head; ctx.beginPath(); ctx.arc(lx, ly, 40 * K, 0, Math.PI * 2); ctx.fill();
    if (st.weather === 'rain') { const ref = ctx.createLinearGradient(lx, 560 * K, lx, 700 * K); ref.addColorStop(0, `rgba(255,210,150,${0.25 * strength})`); ref.addColorStop(1, 'rgba(255,210,150,0)'); ctx.fillStyle = ref; ctx.fillRect(lx - 6 * K, 560 * K, 12 * K, 140 * K); } // 濕路倒影
  }
  ctx.globalCompositeOperation = 'source-over';
}

let slowEma = 1 / 60, slowT = 0;
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  // 平板跑不動電影濾鏡（平均每格超過 40 毫秒持續 4 秒）：自動關掉，畫面才順
  if (raw < 0.25) slowEma = slowEma * 0.95 + raw * 0.05;
  if (post && fxOn && slowEma > 0.04) { slowT += raw; if (slowT > 4) { fxOn = false; localStorage.setItem(FX_KEY, 'off'); setupPost(); resize(); toast('畫面有點卡，先幫你關掉電影濾鏡（右上角可以再打開）', 3000); } } else slowT = 0;
  render(dt);
  requestAnimationFrame(frame);
}
function render(dt) {
  update(dt);
  const sx = (Math.random() - 0.5) * shake * 7 * K, sy = (Math.random() - 0.5) * shake * 5 * K;
  ctx.setTransform(DPR, 0, 0, DPR, sx * DPR, sy * DPR);
  const braking = input.brake && Math.abs(truck.v) > 2;
  if (st.mode === 'garage') drawGarage(dt); else drawRoad(dt, braking);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (post && fxOn) { // 暗角、顆粒、調色、色差交給著色器
    post.render({ time: worldT, ca: 0.0022 + Math.min(1, Math.abs(truck.v) / 1000) * 0.004 + shake * 0.006, rain: st.weather === 'rain' && st.mode === 'road' ? 1 : 0, grade: 1, vign: st.mode === 'garage' ? 0.8 : 0.5, warm: st.time === 'dusk' ? 1 : 0 });
    return;
  }
  // 調色：暗角＋底片顆粒（電影感）
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${st.mode === 'garage' ? 0.75 : 0.45})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07;
  const gx = -Math.random() * 256, gy = -Math.random() * 256;
  for (let x = gx; x < W; x += 256) for (let y = gy; y < H; y += 256) ctx.drawImage(grain, x, y);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function drawRoad(dt, braking) {
  const TS = Math.min(0.8, VW * 0.62 / 740), TK = K * TS; // 卡車在路上的大小：整台都看得到
  const truckScreenX = VW * 0.68 - 720 * TS; // 卡車左邊（設計座標）
  const camX = truck.x;
  drawSky();
  for (const L of LAYERS.slice(0, 3)) drawLayer(L, camX); // 雲、遠景、中景
  if (st.weather === 'fog') { ctx.fillStyle = 'rgba(200,206,212,0.35)'; ctx.fillRect(0, 0, W, H); } // 中景和路面之間的霧
  drawSunShafts();
  drawLayer(LAYERS[3], camX); // 路面
  drawLamps(camX);
  lampLight(camX); // 路燈光先畫在路上（卡車在光的前面，才不會被光蓋掉變白）
  updatePeds(dt, camX); drawPeds(camX);
  // 卡車：先畫柔和的落地陰影，再畫卡車本體
  const info = renderTruck(braking, TS);
  const tx = truckScreenX * K, ty = 640 * K - 300 * TK, tw = TC.w * TK, th = TC.h * TK;
  const sh = AMBIENT[st.time].shadow * (st.weather === 'clear' ? 1 : 0.6);
  for (const [cx, rx] of [[270, 300], [620, 110]]) {
    const sg = ctx.createRadialGradient(tx + cx * TK, ty + 300 * TK, 4, tx + cx * TK, ty + 300 * TK, rx * TK);
    sg.addColorStop(0, `rgba(0,0,0,${sh})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(tx + cx * TK, ty + 298 * TK, rx * TK, 16 * TK, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 接觸陰影：每顆輪子貼地的地方一小塊很深的影子（車子才不會像浮著）
  for (const ax of [70, 132, 500, 556, 652]) {
    const cxw = tx + ax * TK, cyw = ty + 300 * TK, cg2 = ctx.createRadialGradient(cxw, cyw, 1, cxw, cyw, 30 * TK);
    cg2.addColorStop(0, 'rgba(0,0,0,0.7)'); cg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg2; ctx.beginPath(); ctx.ellipse(cxw, cyw, 32 * TK, 6 * TK, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 卡車也跟著環境光上色（白天原色、黃昏偏橘、晚上偏藍暗）
  const a = AMBIENT[st.time];
  if (a.tint || weatherDim()) {
    tcx.setTransform(1, 0, 0, 1, 0, 0); tcx.globalCompositeOperation = 'source-atop';
    if (a.tint) { tcx.fillStyle = a.tint; tcx.fillRect(0, 0, truckCv.width, truckCv.height); }
    if (weatherDim()) { tcx.fillStyle = `rgba(90,100,115,${weatherDim()})`; tcx.fillRect(0, 0, truckCv.width, truckCv.height); }
    tcx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(truckCv, tx, ty, tw, th);
  // 廢氣粒子（油門越大越多；有直立排氣管就從上面冒）
  const sx = tx + info.stackTop.x * TK, sy = ty + info.stackTop.y * TK;
  const rate = 4 + truck.thr * 30;
  for (let n = Math.floor(rate * dt + Math.random()); n > 0; n--) smoke.push({ wx: sx / K + camX, y: sy / K, r: 6 + Math.random() * 4, a: 0.5 + truck.thr * 0.3, vx: -20 - Math.random() * 20, vy: info.stackTop.y < 100 ? -40 - Math.random() * 30 : -8 - Math.random() * 8, life: 0 });
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i]; p.life += dt; p.wx += p.vx * dt; p.y += p.vy * dt; p.r += 26 * dt; p.vy *= 0.98;
    if (p.life > 2.4) { smoke.splice(i, 1); continue; }
    ctx.globalAlpha = p.a * (1 - p.life / 2.4) * (st.time === 'night' ? 0.6 : 1);
    const px = (p.wx - camX) * K;
    ctx.drawImage(puff, px - p.r * K, p.y * K - p.r * K, p.r * 2 * K, p.r * 2 * K);
  }
  ctx.globalAlpha = 1;
  // 光線（Blend：lighter／screen）：頭燈錐形光束、煞車燈光暈
  ctx.globalCompositeOperation = 'lighter';
  if (st.lights) {
    const hx = tx + 712 * TK, hy = ty + info.headY * TK;
    const beam = ctx.createLinearGradient(hx, hy, hx + 520 * K, hy);
    beam.addColorStop(0, 'rgba(255,245,215,0.55)'); beam.addColorStop(1, 'rgba(255,245,215,0)');
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(hx, hy - 4 * K); ctx.lineTo(hx + 520 * K, hy - 70 * K); ctx.lineTo(hx + 520 * K, hy + 110 * K); ctx.lineTo(hx, hy + 6 * K); ctx.fill();
    const pool = ctx.createRadialGradient(hx + 260 * K, ty + 296 * TK, 4, hx + 260 * K, ty + 296 * TK, 260 * K);
    pool.addColorStop(0, 'rgba(255,240,200,0.3)'); pool.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(hx + 260 * K, ty + 296 * TK, 280 * K, 26 * K, 0, 0, Math.PI * 2); ctx.fill();
    const lens = ctx.createRadialGradient(hx, hy, 1, hx, hy, 34 * K); lens.addColorStop(0, 'rgba(255,255,240,1)'); lens.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(hx, hy, 34 * K, 0, Math.PI * 2); ctx.fill();
  }
  const tailOn = braking || st.lights;
  if (tailOn) {
    const lx = tx + 12 * TK, ly = ty + info.tailY * TK, r = (braking ? 70 : 30) * K;
    const tg = ctx.createRadialGradient(lx, ly, 1, lx, ly, r); tg.addColorStop(0, `rgba(255,40,30,${braking ? 0.9 : 0.5})`); tg.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
    if (st.weather === 'rain' || braking) { const rf = ctx.createLinearGradient(lx, ty + 298 * TK, lx, ty + 360 * TK); rf.addColorStop(0, `rgba(255,40,30,${braking ? 0.35 : 0.15})`); rf.addColorStop(1, 'rgba(255,40,30,0)'); ctx.fillStyle = rf; ctx.fillRect(lx - 16 * K, ty + 298 * TK, 32 * K, 60 * K); }
  }
  ctx.globalCompositeOperation = 'source-over';
  // 微塵：只在頭燈、路燈光束裡亮起來
  const beams = [];
  if (st.lights) { const hx = tx + 712 * TK, hy = ty + info.headY * TK; beams.push((x, y) => x > hx && x < hx + 520 * K && Math.abs(y - hy - 20 * K) < 20 * K + (x - hx) * 0.17); }
  if (st.time !== 'day' || st.weather !== 'clear') for (const lxp of lampXs(camX)) { const lx = lxp + 47 * K; beams.push((x, y) => y > 278 * K && y < 640 * K && Math.abs(x - lx) < 10 * K + (y - 278 * K) * 0.28); }
  drawDust(dt, beams);
  // 天氣粒子
  weather(dt);
  // 前景（最快、最模糊）
  drawLayer(LAYERS[4], camX);
}

function weather(dt) {
  const speedPx = truck.v * K;
  if (st.weather === 'rain') {
    while (rainP.length < 420) rainP.push({ x: Math.random() * W, y: Math.random() * H, l: 14 + Math.random() * 16 });
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(170,190,210,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const p of rainP) {
      p.y += 900 * dt * K; p.x -= (120 + speedPx * 0.3) * dt;
      if (p.y > H) { p.y = -20; p.x = Math.random() * W * 1.2; } if (p.x < -20) p.x += W + 40;
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3 - speedPx * 0.01, p.y + p.l * K);
    }
    ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
  } else rainP.length = 0;
  if (st.weather === 'snow') {
    while (snowP.length < 260) snowP.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.6, s: Math.random() * 6 });
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const p of snowP) {
      p.y += (40 + p.r * 18) * dt * K; p.x += (Math.sin(worldT + p.s) * 20 - speedPx * 0.25) * dt;
      if (p.y > H) { p.y = -5; p.x = Math.random() * W; } if (p.x < -10) p.x += W + 20; if (p.x > W + 10) p.x -= W + 20;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * K, 0, Math.PI * 2); ctx.fill();
    }
  } else snowP.length = 0;
  if (st.weather === 'fog') { const fg = ctx.createLinearGradient(0, H * 0.4, 0, H); fg.addColorStop(0, 'rgba(210,214,220,0)'); fg.addColorStop(1, 'rgba(210,214,220,0.45)'); ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); }
}

function drawGarage(dt) {
  ctx.drawImage(getGarageBg(), 0, 0, W, H);
  // 卡車擺在選單旁邊的空位（電腦：選單在右邊；手機：選單在下面）
  const pr = $('#garageUI').getBoundingClientRect(), side = pr.left > W * 0.4;
  const areaW = side ? pr.left - 20 : W, floorY = side ? H * 0.86 : Math.min(H * 0.86, pr.top - 16);
  const sc = Math.min(1.18, (areaW * 0.94) / (TC.w * K), ((floorY - 70) / (TC.h * K)));
  const tw = TC.w * K * sc, th = TC.h * K * sc, tx = (areaW - tw) / 2, ty = floorY - 300 * K * sc;
  renderTruck(false, sc);
  // 主光（左上方暖白色聚光燈，打在卡車上）
  ctx.globalCompositeOperation = 'screen';
  const kx = W * 0.28, key = ctx.createRadialGradient(kx, H * 0.05, 10, W * 0.42, H * 0.55, H * 0.75);
  key.addColorStop(0, 'rgba(255,236,200,0.55)'); key.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = key; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // 地面反射：卡車倒影（上下顛倒、越往下越淡）
  const refl = scratch(0, truckCv.width, truckCv.height), rg = refl.getContext('2d');
  rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalCompositeOperation = 'source-over'; rg.clearRect(0, 0, refl.width, refl.height);
  rg.translate(0, refl.height); rg.scale(1, -1); rg.drawImage(truckCv, 0, 0);
  rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalCompositeOperation = 'destination-in';
  const fade = rg.createLinearGradient(0, 0, 0, refl.height * 0.5); fade.addColorStop(0, 'rgba(0,0,0,0.38)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  rg.fillStyle = fade; rg.fillRect(0, 0, refl.width, refl.height);
  ctx.drawImage(refl, tx, floorY - 6 * K, tw, th);
  // 地面光圈（反射光）
  ctx.globalCompositeOperation = 'lighter';
  const cxT = tx + tw / 2, pool = ctx.createRadialGradient(cxT, floorY, 10, cxT, floorY, tw * 0.6);
  pool.addColorStop(0, 'rgba(180,200,230,0.28)'); pool.addColorStop(1, 'rgba(180,200,230,0)');
  ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(cxT, floorY + 8 * K, tw * 0.62, 46 * K, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // 落地陰影
  const sg = ctx.createRadialGradient(cxT, floorY, 4, cxT, floorY, tw * 0.5);
  sg.addColorStop(0, 'rgba(0,0,0,0.65)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(cxT, floorY - 2 * K, tw * 0.52, 18 * K, 0, 0, Math.PI * 2); ctx.fill();
  // 輪廓光（從卡車後面打過來的冷色邊光）
  ctx.save(); ctx.shadowColor = 'rgba(120,190,255,0.95)'; ctx.shadowBlur = 38 * K; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
  ctx.drawImage(truckCv, tx, ty - 3 * K, tw, th); ctx.restore();
  // 車漆反光：一道亮光慢慢掃過車身（只出現在卡車上）
  sweep = (sweep + dt * 0.25) % 1.6;
  const shine = scratch(1, truckCv.width, truckCv.height), sgc = shine.getContext('2d');
  sgc.globalCompositeOperation = 'source-over'; sgc.clearRect(0, 0, shine.width, shine.height);
  sgc.drawImage(truckCv, 0, 0);
  sgc.globalCompositeOperation = 'source-atop';
  const bx = (sweep - 0.3) * shine.width, band = sgc.createLinearGradient(bx, 0, bx + shine.width * 0.25, shine.height);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.32)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  sgc.fillStyle = band; sgc.fillRect(0, 0, shine.width, shine.height);
  // 頂光：車身上半部亮一點
  const top = sgc.createLinearGradient(0, 0, 0, shine.height); top.addColorStop(0, 'rgba(255,255,255,0.18)'); top.addColorStop(0.5, 'rgba(255,255,255,0)');
  sgc.fillStyle = top; sgc.fillRect(0, 0, shine.width, shine.height);
  ctx.drawImage(shine, tx, ty, tw, th);
  // 三盞燈的光束（主光、補光、頂光）
  ctx.globalCompositeOperation = 'lighter';
  for (const [lx, col, w2] of [[W * 0.25, 'rgba(255,236,200,0.16)', 0.32], [W * 0.5, 'rgba(255,255,255,0.12)', 0.26], [W * 0.75, 'rgba(170,205,255,0.14)', 0.3]]) {
    const cg = ctx.createLinearGradient(0, H * 0.2, 0, floorY);
    cg.addColorStop(0, col); cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(lx - 20, H * 0.2); ctx.lineTo(lx + 20, H * 0.2); ctx.lineTo(lx + W * w2 / 2, floorY); ctx.lineTo(lx - W * w2 / 2, floorY); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // 標題
  ctx.fillStyle = 'rgba(247,198,107,0.9)'; ctx.font = `900 ${Math.round(22 * K)}px "Microsoft JhengHei", sans-serif`; ctx.textAlign = 'left'; ctx.fillText('CUSTOM GARAGE　專屬改裝車庫', 24 * K, H * 0.2);
}

autoLights(); refreshUI();
requestAnimationFrame(frame);
window.__side = { truck, st, input, step(n = 60) { for (let i = 0; i < n; i++) render(1 / 60); }, toggleGarage, get ART() { return ART; } }; // 測試用（瀏覽器在背景時也能逐格推進）
