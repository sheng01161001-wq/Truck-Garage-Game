// 卡車改裝王 — 開大卡車送貨、賺金幣、改裝卡車
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const VERSION = 'v1';
const $ = (s) => document.querySelector(s);

// ================= 存檔 =================
const SAVE_KEY = 'truckGarage_save_v1';
const DEFAULT_TRUCK = {
  cabColor: '#e63946', paint: 'normal', pattern: 'none', patternColor: '#ffd60a',
  rims: 'std', bumper: 'std', lightbar: 'off', stacks: 'off', visor: 'off', spoiler: 'off',
  horn: 'normal', glow: 'off',
  trailerColor: '#f1f1f1', trailerPattern: 'none', trailerPatColor: '#1d3557', name: '我的卡車',
};

// ================= 商品目錄 =================
const CATALOG = {
  paint: { title: '烤漆種類', items: [
    { id: 'normal', name: '一般烤漆', icon: '🎨', price: 0 },
    { id: 'matte', name: '消光霧面', icon: '🌫️', price: 80 },
    { id: 'metal', name: '金屬亮光', icon: '✨', price: 120 },
    { id: 'pearl', name: '珍珠變色', icon: '💎', price: 300 },
    { id: 'neon', name: '霓虹發光', icon: '🌟', price: 400 },
    { id: 'chrome', name: '電鍍鏡面', icon: '🔮', price: 500 },
    { id: 'chameleon', name: '變色龍', icon: '🦎', price: 800 },
  ] },
  pattern: { title: '彩繪圖案', items: [
    { id: 'none', name: '不要彩繪', icon: '⬜', price: 0 },
    { id: 'dots', name: '圓點點', icon: '🔵', price: 100 },
    { id: 'stripes', name: '賽車條紋', icon: '🏁', price: 120 },
    { id: 'checker', name: '賽車格子', icon: '♟️', price: 150 },
    { id: 'camo', name: '迷彩', icon: '🎖️', price: 150 },
    { id: 'stars', name: '星星', icon: '⭐', price: 150 },
    { id: 'lightning', name: '閃電', icon: '⚡', price: 180 },
    { id: 'flames', name: '火焰', icon: '🔥', price: 200 },
    { id: 'tiger', name: '老虎紋', icon: '🐯', price: 220 },
    { id: 'rainbow', name: '彩虹', icon: '🌈', price: 250 },
  ] },
  bumper: { title: '保險桿', items: [
    { id: 'std', name: '一般', icon: '▬', price: 0 },
    { id: 'chromeb', name: '電鍍', icon: '💰', price: 120 },
    { id: 'bull', name: '鐵牛欄', icon: '🐂', price: 150 },
  ] },
  rims: { title: '輪框', items: [
    { id: 'std', name: '一般', icon: '⚙️', price: 0 },
    { id: 'color', name: '同車身色', icon: '🎡', price: 100 },
    { id: 'chrome', name: '電鍍', icon: '💿', price: 150 },
    { id: 'gold', name: '黃金', icon: '📀', price: 300 },
  ] },
  stacks: { title: '直立排氣管', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'on', name: '電鍍排氣管', icon: '🎺', price: 180 },
  ] },
  lightbar: { title: '車頂燈條', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'on', name: '黃色燈條', icon: '🚨', price: 120 },
  ] },
  visor: { title: '遮陽板', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'on', name: '遮陽板', icon: '🧢', price: 80 },
  ] },
  spoiler: { title: '車頂導流罩', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'on', name: '導流罩', icon: '🛸', price: 100 },
  ] },
  horn: { title: '喇叭聲音（點了會叫）', items: [
    { id: 'normal', name: '一般喇叭', icon: '📯', price: 0 },
    { id: 'funny', name: '搞笑喇叭', icon: '🤡', price: 80 },
    { id: 'train', name: '火車喇叭', icon: '🚂', price: 100 },
    { id: 'cow', name: '牛叫喇叭', icon: '🐄', price: 120 },
  ] },
  glow: { title: '底盤燈', items: [
    { id: 'off', name: '不裝', icon: '✖️', price: 0 },
    { id: 'blue', name: '藍色', icon: '💙', price: 200 },
    { id: 'pink', name: '粉紅', icon: '💗', price: 200 },
    { id: 'green', name: '綠色', icon: '💚', price: 200 },
    { id: 'rainbow', name: '彩虹閃爍', icon: '🌈', price: 350 },
  ] },
};
const catList = (cat) => CATALOG[cat === 'trailerPattern' ? 'pattern' : cat].items;
const ownKey = (cat, id) => (cat === 'trailerPattern' ? 'pattern' : cat) + ':' + id;
const itemOf = (cat, id) => catList(cat).find((i) => i.id === id);
function isOwned(cat, id) {
  const it = itemOf(cat, id);
  return !!it && (it.price === 0 || save.owned.includes(ownKey(cat, id)));
}
const ITEM_KEYS = ['paint', 'pattern', 'bumper', 'rims', 'stacks', 'lightbar', 'visor', 'spoiler', 'horn', 'glow', 'trailerPattern'];
const COLOR_KEYS = ['cabColor', 'patternColor', 'trailerColor', 'trailerPatColor'];
const PALETTE = ['#e63946', '#ff7b00', '#ffd60a', '#80ed99', '#2a9d8f', '#00b4d8', '#1d4ed8', '#7b2cbf',
  '#ff70a6', '#ffffff', '#adb5bd', '#495057', '#111111', '#8d5524', '#c0a062', '#00ff9f'];

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  const out = { coins: 500, owned: [], deliveries: 0, truck: { ...DEFAULT_TRUCK } };
  if (s && typeof s === 'object') {
    if (Number.isFinite(s.coins) && s.coins >= 0) out.coins = Math.floor(s.coins);
    if (Array.isArray(s.owned)) out.owned = s.owned.filter((x) => typeof x === 'string');
    if (Number.isFinite(s.deliveries)) out.deliveries = s.deliveries;
    if (s.truck && typeof s.truck === 'object') {
      for (const k of COLOR_KEYS) if (/^#[0-9a-f]{6}$/i.test(s.truck[k])) out.truck[k] = s.truck[k];
      if (typeof s.truck.name === 'string') out.truck.name = s.truck.name.slice(0, 8);
      for (const k of ITEM_KEYS) if (typeof s.truck[k] === 'string') out.truck[k] = s.truck[k];
    }
  }
  return out;
}
let save = loadSave();
// 存檔裡的零件如果不存在或沒買，換回預設
for (const k of ITEM_KEYS) if (!isOwned(k, save.truck[k])) save.truck[k] = DEFAULT_TRUCK[k];
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 存不了就算了 */ } }
let draft = { ...save.truck }; // 車庫試看用

// ================= 小工具 =================
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amt < 0 ? 0x000000 : 0xffffff), Math.abs(amt));
  return '#' + c.getHexString();
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';

// ================= 圖案貼圖 =================
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}
function drawPattern(ctx, w, h, type, col) {
  const r = rng(12345);
  ctx.save();
  if (type === 'stripes') {
    ctx.fillStyle = col;
    ctx.fillRect(0, h * 0.40, w, h * 0.14); ctx.fillRect(0, h * 0.58, w, h * 0.04); ctx.fillRect(0, h * 0.32, w, h * 0.04);
  } else if (type === 'dots') {
    ctx.fillStyle = col; const s = h / 6;
    for (let y = s / 2, row = 0; y < h + s; y += s, row++)
      for (let x = row % 2 ? s / 2 : 0; x < w + s; x += s) { ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill(); }
  } else if (type === 'checker') {
    const s = h / 10;
    for (let y = h * 0.6, j = 0; y < h; y += s, j++)
      for (let x = 0, i = 0; x < w; x += s, i++) { ctx.fillStyle = (i + j) % 2 ? col : '#ffffff'; ctx.fillRect(x, y, s + 1, s + 1); }
  } else if (type === 'camo') {
    const shades = [shade(col, -0.35), col, shade(col, 0.3), shade(col, -0.6)];
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = shades[i % 4]; ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, (0.04 + r() * 0.08) * w, (0.05 + r() * 0.1) * h, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  } else if (type === 'stars') {
    ctx.fillStyle = col;
    const n = Math.round(14 * w / h);
    for (let i = 0; i < n; i++) star(ctx, r() * w, r() * h, h * (0.04 + r() * 0.06));
  } else if (type === 'lightning') {
    const pts = [[0, 0], [0.18, 0], [0.08, 0.4], [0.22, 0.4], [-0.02, 1.0], [0.06, 0.52], [-0.08, 0.52]];
    const n = Math.max(2, Math.round(1.5 * w / h));
    for (let k = 0; k < n; k++) {
      const x0 = w * ((k + 0.35) / n), y0 = h * 0.1, s = h * 0.8;
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x0 + px * s, y0 + py * s)); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = h * 0.015; ctx.stroke();
    }
  } else if (type === 'flames') {
    for (let i = 6; i >= 0; i--) {
      const y = h * (0.3 + i * 0.07), tip = w * (0.35 + r() * 0.45), th = h * 0.07;
      const g = ctx.createLinearGradient(0, 0, tip, 0);
      g.addColorStop(0, '#fff7ae'); g.addColorStop(0.35, '#ffb703'); g.addColorStop(0.75, col); g.addColorStop(1, col);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, y - th);
      ctx.bezierCurveTo(tip * 0.5, y - th * 1.6, tip * 0.75, y + th * 0.3, tip, y - th * 0.8);
      ctx.bezierCurveTo(tip * 0.7, y + th * 0.9, tip * 0.4, y + th * 1.4, 0, y + th);
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = h * 0.008; ctx.stroke();
    }
  } else if (type === 'tiger') {
    ctx.fillStyle = col; const n = Math.round(7 * w / h) + 3;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.3) * w) / n, wd = (w / n) * 0.28;
      let len = h * (0.25 + r() * 0.25);
      ctx.beginPath(); ctx.moveTo(x - wd, 0); ctx.lineTo(x + wd, 0); ctx.lineTo(x + r() * wd, len); ctx.closePath(); ctx.fill();
      len = h * (0.2 + r() * 0.25);
      ctx.beginPath(); ctx.moveTo(x + w / n / 2 - wd, h); ctx.lineTo(x + w / n / 2 + wd, h); ctx.lineTo(x + w / n / 2 + r() * wd, h - len); ctx.closePath(); ctx.fill();
    }
  } else if (type === 'rainbow') {
    const cols = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de'];
    const bh = h / cols.length; cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * bh, w, bh + 1); });
  }
  ctx.restore();
}
function luminance(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function drawName(ctx, w, h, text, base) {
  if (!text) return;
  let size = h * 0.34;
  ctx.font = `bold ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  if (tw > w * 0.8) { size *= (w * 0.8) / tw; ctx.font = `bold ${size}px ${FONT}`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const light = luminance(base) > 0.45;
  ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = light ? '#ffffff' : '#111111'; ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = light ? '#1b1b1b' : '#ffffff'; ctx.fillText(text, w / 2, h / 2);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function paintTexture(w, h, base, pattern, pcol, text) {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    drawPattern(ctx, w, h, pattern, pcol);
    if (text) drawName(ctx, w, h, text, base);
  });
}

// ================= 3D 場景 =================
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const SKY = 0x9fd8ff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 160, 480);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 1200);
scene.add(new THREE.HemisphereLight(0xcfeaff, 0x5d7f3a, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// 共用材質
const MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.7, metalness: 0.3 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.08, metalness: 0.6 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.2, metalness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.7 }),
  grille: new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.4, metalness: 0.8 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4cc, emissiveIntensity: 0.3 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x990000, emissive: 0xff2020, emissiveIntensity: 0.4 }),
  bar: new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xffa000, emissiveIntensity: 0.3 }),
};

// ================= 地圖 =================
const ROADS = [-240, -80, 80, 240]; // 直路 x=這些、橫路 z=這些
const ROAD_W = 14;
const WORLD = 300;
const DEPOTS = [
  { name: '港口', emoji: '🚢', x: -266, z: 160, bx: -288, bz: 160, color: '#3a86ff' },
  { name: '農場', emoji: '🐄', x: 160, z: -264, bx: 160, bz: -287, color: '#8ac926' },
  { name: '工廠', emoji: '🏭', x: 266, z: -20, bx: 288, bz: -20, color: '#adb5bd' },
  { name: '超市', emoji: '🛒', x: 0, z: 102, bx: 0, bz: 124, color: '#ff595e' },
  { name: '建材行', emoji: '🧱', x: -160, z: -102, bx: -160, bz: -124, color: '#e76f51' },
  { name: '玩具店', emoji: '🧸', x: 102, z: 170, bx: 124, bz: 170, color: '#ff70a6' },
  { name: '冰店', emoji: '🍦', x: -100, z: 264, bx: -100, bz: 287, color: '#4cc9f0' },
];
const SPAWN = { x: 80, z: -30, heading: 0 };
const GARAGE_BLD = { x: 122, z: -34 };
const CARGOS = ['🍌 香蕉', '🚗 小汽車', '🍦 冰淇淋', '🔩 鋼筋', '🧱 水泥', '🧸 玩具', '🍉 西瓜', '🦖 恐龍蛋', '🥚 雞蛋', '🎁 禮物', '🌲 木頭', '🐟 魚'];
const boxes = []; // 會撞到的東西 {minx,maxx,minz,maxz}

function makeSign(text, color) {
  const tex = canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(4, 4, w - 8, h - 8, 30); else ctx.rect(4, 4, w - 8, h - 8);
    ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.font = `bold 72px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, w / 2, h / 2 + 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(16, 4, 1);
  return s;
}

function buildWorld() {
  // 草地
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // 馬路
  const roadTex = canvasTex(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3c3f44'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(2, 0, 3, h); ctx.fillRect(w - 5, 0, 3, h);
    ctx.fillStyle = '#ffd60a'; ctx.fillRect(w / 2 - 2, 0, 4, h / 2);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(1, 640 / 16);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
  const roadGeo = new THREE.PlaneGeometry(ROAD_W, 640);
  ROADS.forEach((r) => {
    const a = new THREE.Mesh(roadGeo, roadMat); a.rotation.x = -Math.PI / 2; a.position.set(r, 0.02, 0); a.receiveShadow = true; scene.add(a);
    const g = new THREE.Group(); g.rotation.y = Math.PI / 2; g.position.set(0, 0.03, r);
    const b = new THREE.Mesh(roadGeo, roadMat); b.rotation.x = -Math.PI / 2; b.receiveShadow = true; g.add(b); scene.add(g);
  });

  // 大樓窗戶貼圖
  const winTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9ab7cf';
    for (let y = 10; y < h; y += 32) for (let x = 10; x < w; x += 32) ctx.fillRect(x, y, 18, 20);
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;

  const addBuilding = (x, z, sx, sy, sz, color, solid = true) => {
    const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(sx / 6)), Math.max(1, Math.round(sy / 6)));
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, map: t, roughness: 0.8 }));
    m.position.set(x, sy / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.6, 0.6, sz + 0.6), MAT.dark); roof.position.set(x, sy + 0.3, z); scene.add(roof);
    if (solid) boxes.push({ minx: x - sx / 2, maxx: x + sx / 2, minz: z - sz / 2, maxz: z + sz / 2 });
    return m;
  };

  // 送貨地點
  DEPOTS.forEach((d) => {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(11, 40), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6, transparent: true, opacity: 0.8 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(d.x, 0.06, d.z); scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(10.2, 11, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.07, d.z); scene.add(ring);
    addBuilding(d.bx, d.bz, 16, 9, 16, d.color);
    const s = makeSign(`${d.emoji} ${d.name}`, d.color); s.position.set(d.bx, 13, d.bz); scene.add(s);
  });
  // 車庫房子
  addBuilding(GARAGE_BLD.x, GARAGE_BLD.z, 14, 8, 18, '#ffb703');
  const gs = makeSign('🔧 車庫', '#1d3557'); gs.position.set(GARAGE_BLD.x, 12, GARAGE_BLD.z); scene.add(gs);

  // 隨機大樓（不擋路、不擋送貨點）
  const r = rng(2024);
  const COLORS = ['#f4a261', '#e9c46a', '#a8dadc', '#cdb4db', '#ffc8dd', '#bde0fe', '#caffbf', '#ffd6a5', '#d4a373', '#f1faee'];
  const keepAway = [...DEPOTS.map((d) => [d.x, d.z]), ...DEPOTS.map((d) => [d.bx, d.bz]), [SPAWN.x, SPAWN.z], [GARAGE_BLD.x, GARAGE_BLD.z]];
  let placed = 0, tries = 0;
  while (placed < 75 && tries < 3000) {
    tries++;
    const sx = 8 + r() * 14, sz = 8 + r() * 14, sy = 6 + r() * 22;
    const x = (r() * 2 - 1) * 275, z = (r() * 2 - 1) * 275;
    if (ROADS.some((rr) => Math.abs(x - rr) < sx / 2 + 12 || Math.abs(z - rr) < sz / 2 + 12)) continue;
    if (keepAway.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 34)) continue;
    if (boxes.some((b) => x + sx / 2 + 4 > b.minx && x - sx / 2 - 4 < b.maxx && z + sz / 2 + 4 > b.minz && z - sz / 2 - 4 < b.maxz)) continue;
    addBuilding(x, z, sx, sy, sz, COLORS[Math.floor(r() * COLORS.length)]);
    placed++;
  }

  // 樹
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3, 6);
  const crownGeo = new THREE.ConeGeometry(2.4, 5.5, 7);
  const N = 420;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a4b2a }), N);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.9 }), N);
  crowns.castShadow = true;
  const m4 = new THREE.Matrix4(); let n = 0; tries = 0;
  while (n < N && tries < 8000) {
    tries++;
    const x = (r() * 2 - 1) * 330, z = (r() * 2 - 1) * 330;
    if (ROADS.some((rr) => Math.abs(x - rr) < 11 || Math.abs(z - rr) < 11)) continue;
    if (keepAway.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 20)) continue;
    if (boxes.some((b) => x > b.minx - 3 && x < b.maxx + 3 && z > b.minz - 3 && z < b.maxz + 3)) continue;
    const s = 0.7 + r() * 0.7;
    m4.makeScale(s, s, s).setPosition(x, 1.5 * s, z); trunks.setMatrixAt(n, m4);
    m4.makeScale(s, s, s).setPosition(x, 5.5 * s, z); crowns.setMatrixAt(n, m4);
    n++;
  }
  trunks.count = crowns.count = n;
  scene.add(trunks, crowns);

  // 白雲
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(6 + r() * 6, 10, 8), cloudMat);
      b.position.set(j * 8 - 12, r() * 3, r() * 6); b.scale.y = 0.6; g.add(b);
    }
    g.position.set((r() * 2 - 1) * 400, 70 + r() * 30, (r() * 2 - 1) * 400); scene.add(g);
  }
}

// ================= 卡車模型 =================
function makePaintMat(paint, tex) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex });
  switch (paint) {
    case 'matte': m.metalness = 0; m.roughness = 0.95; break;
    case 'metal': m.metalness = 0.75; m.roughness = 0.28; m.clearcoat = 1; m.clearcoatRoughness = 0.05; break;
    case 'pearl': m.metalness = 0.5; m.roughness = 0.2; m.clearcoat = 1; m.iridescence = 1; m.iridescenceIOR = 1.6; m.iridescenceThicknessRange = [200, 900]; break;
    case 'neon': m.metalness = 0; m.roughness = 0.4; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.55; break;
    case 'chrome': m.metalness = 1; m.roughness = 0.06; break;
    case 'chameleon': m.metalness = 0.6; m.roughness = 0.2; m.clearcoat = 1; break;
    default: m.metalness = 0.1; m.roughness = 0.45; m.clearcoat = 0.6;
  }
  return m;
}

const GLOW_COLORS = { blue: 0x00b4ff, pink: 0xff4fd8, green: 0x2bff88, rainbow: 0xff0000 };
const WHEEL_R = 0.55;

function buildRig(cfg) {
  const own = []; // 要回收的材質、貼圖
  const tractor = new THREE.Group(), trailer = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
  const cyl = (r1, r2, h, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);

  // 車頭烤漆
  const cham = cfg.paint === 'chameleon';
  const cabTex = paintTexture(512, 512, cham ? '#ffffff' : cfg.cabColor, cfg.pattern, cfg.patternColor);
  const paint = makePaintMat(cfg.paint, cabTex); own.push(cabTex, paint);
  const plainTex = paintTexture(16, 16, cham ? '#ffffff' : cfg.cabColor, 'none', '#000');
  const paintPlain = makePaintMat(cfg.paint, plainTex); own.push(plainTex, paintPlain);

  // ---- 車頭（原點在後輪軸中間，車頭朝 +z）----
  add(tractor, box(1.2, 0.35, 7.2), MAT.dark, 0, 0.95, 1.9); // 大樑
  add(tractor, box(2.5, 2.9, 2.3), paint, 0, 2.6, 4.15); // 駕駛室
  add(tractor, box(2.2, 1.1, 0.06), MAT.glass, 0, 3.35, 5.31); // 擋風玻璃
  add(tractor, box(0.06, 0.9, 1.0), MAT.glass, 1.26, 3.4, 4.6);
  add(tractor, box(0.06, 0.9, 1.0), MAT.glass, -1.26, 3.4, 4.6);
  add(tractor, box(1.6, 0.9, 0.06), MAT.grille, 0, 2.0, 5.31); // 水箱罩
  for (let i = 0; i < 4; i++) add(tractor, box(1.5, 0.06, 0.08), MAT.chrome, 0, 1.68 + i * 0.22, 5.34);
  add(tractor, box(0.45, 0.25, 0.06), MAT.head, 0.95, 1.55, 5.32); // 大燈
  add(tractor, box(0.45, 0.25, 0.06), MAT.head, -0.95, 1.55, 5.32);
  // 後照鏡
  for (const sx of [1, -1]) {
    add(tractor, box(0.4, 0.05, 0.05), MAT.dark, sx * 1.42, 3.3, 5.0);
    add(tractor, box(0.1, 0.55, 0.28), MAT.dark, sx * 1.62, 3.3, 5.0);
  }
  // 保險桿
  add(tractor, box(2.5, 0.45, 0.35), cfg.bumper === 'chromeb' ? MAT.chrome : MAT.dark, 0, 1.05, 5.35);
  if (cfg.bumper === 'bull') {
    for (const x of [-0.95, -0.35, 0.35, 0.95]) add(tractor, cyl(0.07, 0.07, 1.7, 8), MAT.chrome, x, 1.75, 5.7);
    for (const y of [1.6, 2.55]) { const b = add(tractor, cyl(0.07, 0.07, 2.2, 8), MAT.chrome, 0, y, 5.7); b.rotation.z = Math.PI / 2; }
  }
  // 油箱、後擋泥板、第五輪、尾燈
  for (const sx of [1, -1]) {
    const t = add(tractor, cyl(0.36, 0.36, 1.4, 16), MAT.steel, sx * 0.95, 0.95, 2.2); t.rotation.x = Math.PI / 2;
    add(tractor, box(0.7, 0.12, 2.7), MAT.dark, sx * 1.1, 1.25, 0);
    add(tractor, box(0.35, 0.2, 0.06), MAT.tail, sx * 0.8, 1.05, -1.52);
  }
  add(tractor, box(1.6, 0.12, 1.4), MAT.dark, 0, 1.17, 0);
  // 選配零件
  if (cfg.spoiler === 'on') { const s = add(tractor, box(2.3, 0.7, 1.7), paintPlain, 0, 4.35, 3.95); s.rotation.x = -0.28; }
  if (cfg.visor === 'on') { const v = add(tractor, box(2.4, 0.08, 0.55), paintPlain, 0, 4.0, 5.5); v.rotation.x = 0.2; }
  if (cfg.lightbar === 'on') {
    add(tractor, box(2.1, 0.18, 0.25), MAT.dark, 0, 4.15, 5.05);
    for (let i = 0; i < 5; i++) add(tractor, box(0.3, 0.16, 0.06), MAT.bar, -0.84 + i * 0.42, 4.15, 5.19);
  }
  if (cfg.stacks === 'on') {
    for (const sx of [1, -1]) {
      add(tractor, cyl(0.13, 0.13, 3.6, 14), MAT.chrome, sx * 1.12, 2.9, 2.85);
      add(tractor, cyl(0.16, 0.13, 0.3, 14), MAT.chrome, sx * 1.12, 4.8, 2.85);
    }
  }
  // 底盤燈
  let glowMat = null, glowLight = null;
  if (cfg.glow !== 'off') {
    glowMat = new THREE.MeshBasicMaterial({ color: GLOW_COLORS[cfg.glow], transparent: true, opacity: 0.55, depthWrite: false });
    own.push(glowMat);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.5), glowMat); g.rotation.x = -Math.PI / 2; g.position.set(0, 0.08, 2); tractor.add(g);
    glowLight = new THREE.PointLight(GLOW_COLORS[cfg.glow], 6, 10, 1.5); glowLight.position.set(0, 0.5, 2); tractor.add(glowLight);
  }

  // 輪子
  let rimMat = MAT.steel;
  if (cfg.rims === 'chrome') rimMat = MAT.chrome;
  else if (cfg.rims === 'gold') rimMat = MAT.gold;
  else if (cfg.rims === 'color') { rimMat = new THREE.MeshStandardMaterial({ color: cham ? '#ffffff' : cfg.cabColor, metalness: 0.5, roughness: 0.3 }); own.push(rimMat); }
  const tireGeo = cyl(WHEEL_R, WHEEL_R, 0.5, 22), rimGeo = cyl(0.36, 0.36, 0.52, 18);
  const spokeGeo = box(0.54, 0.09, 0.62), hubGeo = cyl(0.12, 0.12, 0.56, 10);
  const wheels = [], front = [];
  const makeWheel = (parent, x, z) => {
    const g = new THREE.Group(); g.position.set(x, WHEEL_R, z);
    const spin = new THREE.Group(); g.add(spin);
    const t = new THREE.Mesh(tireGeo, MAT.tire); t.rotation.z = Math.PI / 2; t.castShadow = true;
    const rm = new THREE.Mesh(rimGeo, rimMat); rm.rotation.z = Math.PI / 2;
    const s1 = new THREE.Mesh(spokeGeo, rimMat), s2 = new THREE.Mesh(spokeGeo, rimMat); s2.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, MAT.dark); hub.rotation.z = Math.PI / 2;
    spin.add(t, rm, s1, s2, hub);
    parent.add(g); wheels.push(spin);
    return g;
  };
  for (const sx of [1, -1]) {
    front.push(makeWheel(tractor, sx * 1.1, 3.8));
    makeWheel(tractor, sx * 1.1, 0.7);
    makeWheel(tractor, sx * 1.1, -0.7);
  }

  // ---- 拖車（原點在聯結點，往 -z 延伸）----
  const sideTex = paintTexture(1024, 256, cfg.trailerColor, cfg.trailerPattern, cfg.trailerPatColor, cfg.name);
  const endTex = paintTexture(256, 256, cfg.trailerColor, cfg.trailerPattern, cfg.trailerPatColor);
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.5, metalness: 0.1 });
  const endMat = new THREE.MeshStandardMaterial({ map: endTex, roughness: 0.5, metalness: 0.1 });
  own.push(sideTex, endTex, sideMat, endMat);
  add(trailer, box(2.5, 3.0, 13), [sideMat, sideMat, endMat, MAT.dark, endMat, endMat], 0, 2.85, -5.5);
  add(trailer, box(1.2, 0.3, 12), MAT.dark, 0, 1.2, -5.5);
  for (const sx of [1, -1]) {
    add(trailer, box(0.15, 0.9, 0.15), MAT.dark, sx * 0.9, 0.85, -1.5);
    add(trailer, box(0.35, 0.2, 0.06), MAT.tail, sx * 0.9, 1.25, -12.03);
    add(trailer, box(0.7, 0.12, 2.8), MAT.dark, sx * 1.1, 1.25, -10.25);
    makeWheel(trailer, sx * 1.1, -9.6);
    makeWheel(trailer, sx * 1.1, -10.9);
  }
  const trailerWheels = wheels.slice(6);

  // 貨物圖示
  const cargoSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
  cargoSprite.scale.set(4, 4, 1); cargoSprite.position.set(0, 6.2, -5.5); cargoSprite.visible = false;
  own.push(cargoSprite.material);
  trailer.add(cargoSprite);

  scene.add(tractor, trailer);
  return {
    tractor, trailer, front, wheels, trailerWheels, paint, paintPlain, rimMat: cfg.rims === 'color' ? rimMat : null,
    chameleon: cham, glowMat, glowLight, rainbowGlow: cfg.glow === 'rainbow', cargoSprite,
    dispose() {
      scene.remove(tractor, trailer);
      const geos = new Set();
      [tractor, trailer].forEach((g) => g.traverse((o) => { if (o.geometry) geos.add(o.geometry); }));
      geos.forEach((g) => g.dispose());
      own.forEach((o) => o.dispose());
      if (cargoTex) cargoTex.dispose();
    },
  };
}
let cargoTex = null;
function setCargoIcon(text) {
  if (cargoTex) { cargoTex.dispose(); cargoTex = null; }
  if (!text) { rig.cargoSprite.visible = false; rig.cargoSprite.material.map = null; return; }
  const emoji = text.split(' ')[0];
  cargoTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffffdd'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 60, 0, Math.PI * 2); ctx.fill();
    ctx.font = `80px "Segoe UI Emoji","Apple Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, w / 2, h / 2 + 6);
  });
  rig.cargoSprite.material.map = cargoTex; rig.cargoSprite.material.needsUpdate = true; rig.cargoSprite.visible = true;
}

// ================= 遊戲狀態 =================
const S = {
  mode: 'title', // title / drive / garage
  x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading,
  v: 0, steer: 0, wheelAngle: 0, lights: false, cam: 0, shake: 0,
  gAng: 0.9, gDrag: null, gTab: 'paint', pending: null, muted: false,
  mission: null, hint: '', time: 0,
};
let rig = null;
function rebuildRig(cfg) {
  if (rig) rig.dispose();
  cargoTex = null;
  rig = buildRig(cfg);
  if (S.mission && S.mission.stage === 'deliver') setCargoIcon(S.mission.cargo);
  placeRig();
}
function placeRig() {
  rig.tractor.position.set(S.x, 0, S.z); rig.tractor.rotation.y = S.heading;
  rig.trailer.position.set(S.x, 0, S.z); rig.trailer.rotation.y = S.trailerHeading;
}

// ================= 聲音 =================
const Snd = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = S.muted ? 0 : 0.6; this.master.connect(ctx.destination);
    // 引擎聲
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    this.eg = ctx.createGain(); this.eg.gain.value = 0.0;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 42;
    this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = 21;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    this.o1.connect(lp); this.o2.connect(g2); g2.connect(lp); lp.connect(this.eg); this.eg.connect(this.master);
    this.o1.start(); this.o2.start();
  },
  setMuted(m) { if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05); },
  engine(speed, throttle, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 34 + Math.abs(speed) * 2.4 + throttle * 10;
    this.o1.frequency.setTargetAtTime(f, t, 0.1); this.o2.frequency.setTargetAtTime(f / 2, t, 0.1);
    this.eg.gain.setTargetAtTime(on ? 0.07 + throttle * 0.05 : 0, t, 0.15);
  },
  tone(freq, dur, type = 'square', vol = 0.15, when = 0, slideTo = null, filter = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.08)); g.gain.linearRampToValueAtTime(0, t + dur);
    let node = o;
    if (filter) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  horn(type) {
    if (type === 'train') [185, 233, 277, 311].forEach((f) => this.tone(f, 1.3, 'sawtooth', 0.09, 0, null, 1400));
    else if (type === 'funny') [523, 659, 784, 1047, 784].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.22, i * 0.12));
    else if (type === 'cow') { this.tone(170, 1.0, 'sawtooth', 0.22, 0, 105, 700); this.tone(172, 1.0, 'square', 0.06, 0, 108, 500); }
    else { this.tone(392, 0.5, 'square', 0.1, 0, null, 2000); this.tone(494, 0.5, 'square', 0.1, 0, null, 2000); }
  },
  coin() { [988, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'square', 0.08, i * 0.08)); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.2, i * 0.09)); },
  bump() { this.tone(90, 0.25, 'sawtooth', 0.25, 0, 40, 300); },
  click() { this.tone(880, 0.05, 'square', 0.05); },
  no() { this.tone(220, 0.25, 'square', 0.1, 0, 150); },
};

// ================= 輸入 =================
const input = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', (e) => {
  if (S.mode === 'garage' && e.code === 'Escape') { closeGarage(); return; }
  if (e.target && e.target.tagName === 'INPUT') return;
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (S.mode === 'drive') {
    if (e.code === 'KeyH') honk();
    if (e.code === 'KeyL') toggleLights();
    if (e.code === 'KeyC') switchCam();
    if (e.code === 'KeyR') resetTruck();
    if (e.code === 'KeyG') openGarage();
  }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
function releaseAll() { for (const k in input) input[k] = false; document.querySelectorAll('.tc').forEach((b) => b.classList.remove('on')); }
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releaseAll(); if (Snd.ctx) Snd.ctx.suspend(); }
  else if (Snd.ctx) Snd.ctx.resume();
});
document.querySelectorAll('.tc').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); input[k] = true; b.classList.add('on'); Snd.init(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ } };
  const off = () => { input[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

// 車庫裡拖曳轉鏡頭
canvas.addEventListener('pointerdown', (e) => { if (S.mode === 'garage') S.gDrag = { x: e.clientX, a: S.gAng }; });
window.addEventListener('pointermove', (e) => { if (S.gDrag) S.gAng = S.gDrag.a - (e.clientX - S.gDrag.x) * 0.01; });
window.addEventListener('pointerup', () => { S.gDrag = null; });

// ================= 介面 =================
let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function popup(msg) { const p = $('#popup'); p.textContent = msg; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); }
function updateCoins() { $('#coinNum').textContent = save.coins; $('#gCoins').textContent = save.coins; }

function honk() { Snd.init(); if (S.hornT > 0) return; S.hornT = 0.35; Snd.horn(save.truck.horn); }
function toggleLights() {
  S.lights = !S.lights;
  MAT.head.emissiveIntensity = S.lights ? 3 : 0.3; MAT.bar.emissiveIntensity = S.lights ? 2.5 : 0.3; MAT.tail.emissiveIntensity = S.lights ? 1.5 : 0.4;
  toast(S.lights ? '💡 大燈打開' : '大燈關掉', 1000);
}
const CAM_NAMES = ['追車鏡頭', '遠遠的鏡頭', '駕駛座鏡頭'];
function switchCam() { S.cam = (S.cam + 1) % 3; toast('📷 ' + CAM_NAMES[S.cam], 1000); }
function resetTruck() {
  Object.assign(S, { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, trailerHeading: SPAWN.heading, v: 0, steer: 0 });
  placeRig(); toast('🔄 回到車庫門口', 1200);
}
$('#bGarage').onclick = () => openGarage();
$('#bHorn').onclick = () => honk();
$('#bLights').onclick = () => toggleLights();
$('#bCam').onclick = () => switchCam();
$('#bReset').onclick = () => resetTruck();
$('#bSound').onclick = () => {
  S.muted = !S.muted; Snd.init(); Snd.setMuted(S.muted);
  $('#bSound').firstChild.textContent = S.muted ? '🔇' : '🔊';
};
// 爸爸密技：金幣連點 7 下 +1000
let coinTaps = [];
$('#coins').addEventListener('click', () => {
  const now = performance.now(); coinTaps = coinTaps.filter((t) => now - t < 3000); coinTaps.push(now);
  if (coinTaps.length >= 7) { coinTaps = []; save.coins += 1000; persist(); updateCoins(); Snd.coin(); popup('💰 +1000'); }
});

// ---- 車庫 ----
const TABS = [
  { id: 'paint', name: '🎨 烤漆' }, { id: 'pattern', name: '🔥 彩繪' }, { id: 'parts', name: '🔧 零件' },
  { id: 'fun', name: '📯 喇叭燈' }, { id: 'trailer', name: '🚛 拖車' },
];
function openGarage() {
  if (S.mode !== 'drive') return;
  S.mode = 'garage'; S.v = 0; for (const k in input) input[k] = false;
  document.querySelectorAll('.tc').forEach((b) => b.classList.remove('on'));
  draft = { ...save.truck }; S.pending = null;
  S.gAng = S.heading + 0.9;
  $('#garage').classList.remove('hidden'); $('#touch').classList.add('hidden'); $('#hud').classList.add('hidden');
  renderGarage(); Snd.click();
}
function closeGarage() {
  if (S.mode !== 'garage') return;
  const changed = JSON.stringify(draft) !== JSON.stringify(save.truck);
  draft = { ...save.truck }; S.pending = null;
  if (changed) rebuildRig(save.truck);
  S.mode = 'drive';
  $('#garage').classList.add('hidden'); $('#touch').classList.remove('hidden'); $('#hud').classList.remove('hidden');
}
$('#gExit').onclick = () => closeGarage();

function secHtml(t) { return `<div class="g-sec">${t}</div>`; }
function swatchHtml(key) {
  return `<div class="swatches">${PALETTE.map((c) => `<button class="sw ${draft[key] === c ? 'sel' : ''}" data-key="${key}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>`;
}
function cardsHtml(cat) {
  const items = catList(cat);
  return `<div class="g-cards">${items.map((it) => {
    const sel = draft[cat] === it.id, owned = isOwned(cat, it.id);
    const pr = owned ? `<span class="pr own">${sel ? '✔ 使用中' : '已擁有'}</span>` : `<span class="pr">💰 ${it.price}</span>`;
    return `<button class="card ${sel ? 'sel' : ''}" data-cat="${cat}" data-id="${it.id}"><span class="ic">${it.icon}</span><span class="nm">${it.name}</span>${pr}</button>`;
  }).join('')}</div>`;
}
function renderGarage() {
  $('#gTabs').innerHTML = TABS.map((t) => `<button class="g-tab ${S.gTab === t.id ? 'sel' : ''}" data-tab="${t.id}">${t.name}</button>`).join('');
  let h = '';
  if (S.gTab === 'paint') h = secHtml('車身顏色（免費換）') + swatchHtml('cabColor') + secHtml('特殊烤漆') + cardsHtml('paint');
  else if (S.gTab === 'pattern') h = secHtml('彩繪圖案') + cardsHtml('pattern') + secHtml('彩繪顏色（免費換）') + swatchHtml('patternColor');
  else if (S.gTab === 'parts') h = ['bumper', 'rims', 'stacks', 'lightbar', 'visor', 'spoiler'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'fun') h = ['horn', 'glow'].map((c) => secHtml(CATALOG[c].title) + cardsHtml(c)).join('');
  else if (S.gTab === 'trailer') {
    h = secHtml('拖車顏色（免費換）') + swatchHtml('trailerColor') + secHtml('拖車彩繪（買過的圖案都能用）') + cardsHtml('trailerPattern')
      + secHtml('拖車彩繪顏色（免費換）') + swatchHtml('trailerPatColor')
      + secHtml('寫在拖車上的名字（最多 8 個字）') + `<input class="name-in" id="nameIn" maxlength="8" value="${escapeHtml(draft.name)}" placeholder="例如：小明號">`;
  }
  $('#gBody').innerHTML = h;
  const nameIn = $('#nameIn');
  if (nameIn) nameIn.addEventListener('input', onNameInput);
  renderBuyBar(); updateCoins();
}
function renderBuyBar() {
  const p = S.pending, el = $('#gBuy');
  if (!p) { el.innerHTML = '<span>👆 點一下就能先試看，喜歡再買！</span>'; return; }
  const it = itemOf(p.cat, p.id);
  el.innerHTML = `<span>${it.icon} ${it.name}　💰 ${it.price}</span><button id="buyBtn">買下來！</button>`;
  $('#buyBtn').onclick = buyPending;
}
let nameTimer = 0;
function onNameInput(e) {
  const v = e.target.value.slice(0, 8);
  draft.name = v; save.truck.name = v; persist();
  clearTimeout(nameTimer); nameTimer = setTimeout(() => rebuildRig(draft), 300);
}
$('#gTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.g-tab'); if (!b) return;
  S.gTab = b.dataset.tab; Snd.click(); renderGarage();
});
$('#gBody').addEventListener('click', (e) => {
  const sw = e.target.closest('.sw');
  if (sw) {
    draft[sw.dataset.key] = sw.dataset.col; save.truck[sw.dataset.key] = sw.dataset.col; persist();
    Snd.click(); rebuildRig(draft); renderGarage(); return;
  }
  const c = e.target.closest('.card');
  if (c) selectItem(c.dataset.cat, c.dataset.id);
});
function selectItem(cat, id) {
  Snd.init();
  // 換試別的東西時，上一個沒買的換回來
  if (S.pending && S.pending.cat !== cat) draft[S.pending.cat] = save.truck[S.pending.cat];
  draft[cat] = id;
  if (isOwned(cat, id)) { save.truck[cat] = id; persist(); S.pending = null; Snd.click(); }
  else S.pending = { cat, id };
  if (cat === 'horn') Snd.horn(id);
  rebuildRig(draft); renderGarage();
}
function buyPending() {
  const p = S.pending; if (!p) return;
  const it = itemOf(p.cat, p.id);
  if (save.coins < it.price) { Snd.no(); toast(`金幣還差 ${it.price - save.coins} 個，去送貨賺錢吧！`); return; }
  save.coins -= it.price; save.owned.push(ownKey(p.cat, p.id)); save.truck[p.cat] = p.id; persist();
  S.pending = null; Snd.buy(); popup(`${it.icon} 買到了！`); renderGarage();
}

// ================= 送貨任務 =================
function newMission(fromIdx = null) {
  const r = Math.random;
  let a = fromIdx ?? Math.floor(r() * DEPOTS.length);
  let b; do { b = Math.floor(r() * DEPOTS.length); } while (b === a);
  const A = DEPOTS[a], B = DEPOTS[b];
  const dist = Math.hypot(A.x - B.x, A.z - B.z);
  S.mission = { from: a, to: b, cargo: CARGOS[Math.floor(r() * CARGOS.length)], stage: 'pickup', reward: Math.round((80 + dist * 0.45) / 10) * 10 };
  setCargoIcon(null);
}
function missionTarget() { const m = S.mission; return DEPOTS[m.stage === 'pickup' ? m.from : m.to]; }
function checkMission(dt) {
  const m = S.mission; if (!m) return;
  if (m.wait > 0) { m.wait -= dt; return; }
  const d = missionTarget();
  const cx = S.x + Math.sin(S.heading) * 2, cz = S.z + Math.cos(S.heading) * 2;
  const dist = Math.hypot(cx - d.x, cz - d.z);
  S.hint = '';
  if (dist < 11) {
    if (Math.abs(S.v) > 3.5) { S.hint = '慢下來停在圈圈裡！'; return; }
    if (m.stage === 'pickup') {
      m.stage = 'deliver'; setCargoIcon(m.cargo); Snd.coin(); popup(`${m.cargo.split(' ')[0]} 裝好了！`);
    } else {
      save.coins += m.reward; save.deliveries++; persist(); updateCoins();
      Snd.coin(); setTimeout(() => Snd.buy(), 350); popup(`💰 +${m.reward}`); confetti();
      toast(`送到了！第 ${save.deliveries} 趟，好厲害！`);
      newMission(m.to);
      S.mission.wait = 2.2; // 先讓小朋友看完金幣畫面，再裝下一批貨
    }
  }
}

// 目標光柱、方向箭頭
const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 70, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
scene.add(beam);
const arrow = new THREE.Group();
{
  const am = new THREE.MeshStandardMaterial({ color: 0xffd60a, emissive: 0xffa000, emissiveIntensity: 0.6 });
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 16), am); head.rotation.x = Math.PI / 2; head.position.z = 1.2;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 12), am); tail.rotation.x = Math.PI / 2;
  arrow.add(head, tail);
}
scene.add(arrow);

// 彩帶
const CONF_N = 260;
const confGeo = new THREE.BufferGeometry();
const confPos = new Float32Array(CONF_N * 3), confCol = new Float32Array(CONF_N * 3), confVel = new Float32Array(CONF_N * 3);
confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3));
confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
const confPts = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true }));
confPts.visible = false; confPts.frustumCulled = false; scene.add(confPts);
let confT = 0;
function confetti() {
  const c = new THREE.Color();
  for (let i = 0; i < CONF_N; i++) {
    confPos[i * 3] = S.x; confPos[i * 3 + 1] = 5; confPos[i * 3 + 2] = S.z;
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 8;
    confVel[i * 3] = Math.cos(a) * sp; confVel[i * 3 + 1] = 8 + Math.random() * 10; confVel[i * 3 + 2] = Math.sin(a) * sp;
    c.setHSL(Math.random(), 0.9, 0.6); confCol[i * 3] = c.r; confCol[i * 3 + 1] = c.g; confCol[i * 3 + 2] = c.b;
  }
  confGeo.attributes.color.needsUpdate = true; confPts.visible = true; confT = 2.5;
}

// ================= 開車物理 =================
const L = 3.8, LT = 10.2, MAXV = 22, OFFROAD_V = 12;
function onRoad(x, z) { return ROADS.some((r) => Math.abs(x - r) < ROAD_W / 2 + 1 || Math.abs(z - r) < ROAD_W / 2 + 1); }
function hitsBox(x, z, rad) {
  if (Math.abs(x) > WORLD - rad || Math.abs(z) > WORLD - rad) return true;
  return boxes.some((b) => {
    const cx = clamp(x, b.minx, b.maxx), cz = clamp(z, b.minz, b.maxz);
    return (x - cx) ** 2 + (z - cz) ** 2 < rad * rad;
  });
}
function rigHits(x, z, h) {
  const fx = Math.sin(h), fz = Math.cos(h);
  return hitsBox(x + fx * 2.4, z + fz * 2.4, 1.8) || hitsBox(x + fx * 4.8, z + fz * 4.8, 1.4);
}
function drive(dt) {
  const thr = input.up ? 1 : 0, brk = input.down ? 1 : 0;
  if (thr) S.v += S.v < -0.3 ? 12 * dt : 5.5 * dt * (1 - S.v / MAXV);
  if (brk) { if (S.v > 0.3) S.v -= 12 * dt; else S.v = Math.max(S.v - 4 * dt, -7); }
  if (!thr && !brk) S.v -= Math.sign(S.v) * Math.min(Math.abs(S.v), (1.0 + Math.abs(S.v) * 0.04) * dt);
  if (!onRoad(S.x, S.z) && Math.abs(S.v) > OFFROAD_V) S.v -= Math.sign(S.v) * 8 * dt;

  const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const maxSteer = 0.55 / (1 + Math.abs(S.v) * 0.06);
  S.steer += (target * maxSteer - S.steer) * Math.min(1, dt * 5);

  const px = S.x, pz = S.z, ph = S.heading, pth = S.trailerHeading;
  S.heading += (S.v / L) * Math.tan(S.steer) * dt;
  S.x += Math.sin(S.heading) * S.v * dt;
  S.z += Math.cos(S.heading) * S.v * dt;
  S.trailerHeading += (S.v / LT) * Math.sin(S.heading - S.trailerHeading) * dt;
  const rel = wrapAngle(S.heading - S.trailerHeading);
  if (Math.abs(rel) > 1.25) S.trailerHeading = S.heading - Math.sign(rel) * 1.25;

  if (rigHits(S.x, S.z, S.heading)) {
    S.x = px; S.z = pz; S.heading = ph; S.trailerHeading = pth;
    if (Math.abs(S.v) > 4) { Snd.bump(); S.shake = Math.min(1, Math.abs(S.v) / 15); toast('碰！小心開 🙈', 900); }
    S.v = -S.v * 0.25;
  }
  S.wheelAngle += (S.v * dt) / WHEEL_R;
  Snd.engine(S.v, thr, true);
}

// ================= 鏡頭 =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  const want = new THREE.Vector3(), look = new THREE.Vector3();
  if (S.mode === 'garage') {
    const tx = S.gTab === 'trailer' ? S.x - Math.sin(S.trailerHeading) * 5 : S.x + fx * 2.5;
    const tz = S.gTab === 'trailer' ? S.z - Math.cos(S.trailerHeading) * 5 : S.z + fz * 2.5;
    const R = S.gTab === 'trailer' ? 26 : 17;
    if (!S.gDrag) S.gAng += dt * 0.15;
    want.set(tx + Math.sin(S.gAng) * R, S.gTab === 'trailer' ? 9 : 6.5, tz + Math.cos(S.gAng) * R);
    look.set(tx, 2.4, tz);
    // 車庫面板在右邊時，把車往左邊擺一點
    if (window.innerWidth > 700) {
      const right = new THREE.Vector3().subVectors(look, want).cross(new THREE.Vector3(0, 1, 0)).normalize();
      const off = R * 0.32; want.addScaledVector(right, off); look.addScaledVector(right, off);
    }
  } else if (S.cam === 2) {
    want.set(S.x + fx * 4.4, 3.6, S.z + fz * 4.4); look.set(S.x + fx * 30, 2.5, S.z + fz * 30);
    camPos.copy(want); camLook.copy(look); camera.position.copy(camPos); camera.lookAt(camLook); return;
  } else {
    const back = S.cam === 0 ? 21 : 40, up = S.cam === 0 ? 16 : 26;
    const th = S.trailerHeading * 0.6 + S.heading * 0.4;
    want.set(S.x - Math.sin(th) * back + fx * 3, up, S.z - Math.cos(th) * back + fz * 3);
    look.set(S.x + fx * 10, 2.5, S.z + fz * 10);
  }
  if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
  const k = Math.min(1, dt * 3.5);
  camPos.lerp(want, k); camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (S.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake, 0));
  camera.lookAt(camLook);
}

// ================= 小地圖 =================
const mm = $('#minimap'), mctx = mm.getContext('2d');
function drawMinimap() {
  const W = mm.width, s = W / 640, cx = W / 2, cy = W / 2;
  const P = (x, z) => [cx - x * s, cy - z * s];
  mctx.fillStyle = '#6aa84f'; mctx.fillRect(0, 0, W, W);
  mctx.strokeStyle = '#3c3f44'; mctx.lineWidth = ROAD_W * s * 1.4;
  ROADS.forEach((r) => {
    let [a, b] = P(r, -320), [c, d] = P(r, 320); mctx.beginPath(); mctx.moveTo(a, b); mctx.lineTo(c, d); mctx.stroke();
    [a, b] = P(-320, r); [c, d] = P(320, r); mctx.beginPath(); mctx.moveTo(a, b); mctx.lineTo(c, d); mctx.stroke();
  });
  const tgt = S.mission ? missionTarget() : null;
  DEPOTS.forEach((d) => {
    const [x, y] = P(d.x, d.z); mctx.fillStyle = d.color; mctx.beginPath(); mctx.arc(x, y, d === tgt ? 9 : 5, 0, Math.PI * 2); mctx.fill();
    if (d === tgt) { mctx.lineWidth = 3; mctx.strokeStyle = Math.sin(S.time * 6) > 0 ? '#ffd60a' : '#ffffff'; mctx.stroke(); }
  });
  const [gx, gy] = P(GARAGE_BLD.x, GARAGE_BLD.z); mctx.font = '14px sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText('🔧', gx, gy);
  const [tx, ty] = P(S.x, S.z);
  mctx.save(); mctx.translate(tx, ty); mctx.rotate(-S.heading);
  mctx.fillStyle = '#e63946'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(0, -9); mctx.lineTo(7, 7); mctx.lineTo(-7, 7); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

// ================= HUD =================
let lastMissionHtml = '', lastSpd = -1;
function updateHud() {
  const spd = Math.round(Math.abs(S.v) * 3.6);
  if (spd !== lastSpd) { $('#spdNum').textContent = spd; lastSpd = spd; }
  let html = '';
  const m = S.mission;
  if (m) {
    const d = missionTarget();
    const dist = Math.round(Math.hypot(S.x - d.x, S.z - d.z));
    html = m.stage === 'pickup'
      ? `① 先去 <b>${d.emoji}${d.name}</b> 載 ${m.cargo}`
      : `② 把 ${m.cargo} 送到 <b>${d.emoji}${d.name}</b>　💰${m.reward}`;
    html += `<br><span class="dist">還有 ${dist} 公尺</span>`;
    if (S.hint) html += `　⚠️ ${S.hint}`;
  }
  if (html !== lastMissionHtml) { $('#mission').innerHTML = html; lastMissionHtml = html; }
}

// ================= 主迴圈 =================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 70 : 55; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;
  if (S.hornT > 0) S.hornT -= dt;
  if (S.mode === 'drive') { drive(dt); checkMission(dt); }
  else Snd.engine(0, 0, S.mode === 'garage');
  S.shake = Math.max(0, S.shake - dt * 2);
  placeRig();

  // 輪子轉、前輪轉向
  for (const w of rig.wheels) w.rotation.x = S.wheelAngle;
  for (const f of rig.front) f.rotation.y = S.steer;
  // 變色龍、彩虹底盤燈
  if (rig.chameleon) {
    const c = new THREE.Color().setHSL((S.time * 0.08) % 1, 0.85, 0.5);
    rig.paint.color.copy(c); rig.paintPlain.color.copy(c); if (rig.rimMat) rig.rimMat.color.copy(c);
  }
  if (rig.rainbowGlow) {
    const c = new THREE.Color().setHSL((S.time * 0.5) % 1, 1, 0.55);
    rig.glowMat.color.copy(c); rig.glowLight.color.copy(c);
  }
  // 目標指示
  if (S.mission && S.mode === 'drive') {
    const d = missionTarget();
    beam.visible = true; beam.position.set(d.x, 35, d.z);
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    arrow.visible = true;
    arrow.position.set(S.x + fx * 4, 7 + Math.sin(S.time * 4) * 0.3, S.z + fz * 4);
    arrow.rotation.y = Math.atan2(d.x - arrow.position.x, d.z - arrow.position.z);
  } else { beam.visible = false; arrow.visible = false; }
  // 彩帶
  if (confT > 0) {
    confT -= dt;
    for (let i = 0; i < CONF_N; i++) {
      confVel[i * 3 + 1] -= 18 * dt;
      confPos[i * 3] += confVel[i * 3] * dt; confPos[i * 3 + 1] += confVel[i * 3 + 1] * dt; confPos[i * 3 + 2] += confVel[i * 3 + 2] * dt;
    }
    confGeo.attributes.position.needsUpdate = true;
    if (confT <= 0) confPts.visible = false;
  }
  // 太陽跟著卡車（影子才清楚）
  sun.position.set(S.x + 40, 80, S.z + 30); sun.target.position.set(S.x, 0, S.z);

  updateCamera(dt);
  if (S.mode === 'drive') { updateHud(); drawMinimap(); }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// 給測試用
window.__truck = { S, get save() { return save; } };
// ================= 開始 =================
buildWorld();
rebuildRig(save.truck);
newMission();
resize();
updateCoins();
$('#ver').textContent = '卡車改裝王 ' + VERSION;
$('#loadMsg').textContent = '';
$('#startBtn').onclick = () => {
  Snd.init();
  S.mode = 'drive';
  $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#touch').classList.remove('hidden');
  toast('跟著黃色箭頭去載貨！', 2500);
};
requestAnimationFrame(loop);
