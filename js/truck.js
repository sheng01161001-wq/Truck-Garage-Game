// 寫實卡車模型：兩種車頭（歐式平頭、美式長鼻）、三種車斗（廂型、平板、砂石斗）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, rng, shade, luminance, FONT, makeNoise } from './util.js';
import { treadTex, rimTex, plateTex, woodTex, gravelTex, drawGrime, stripeTex } from './textures.js';

export const WHEEL_R = 0.53;

// ---------- 共用材質（只建一次） ----------
let M = null;
// v26：大燈顏色
const HEAD_COL = { white: 0xf2f6ff, warm: 0xffd58a, blue: 0xb8dcff };
function mats() {
  if (M) return M;
  const tread = treadTex();
  M = {
    chassis: new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.55, metalness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.45, metalness: 0.1 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.95 }),
    tire: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tread, bumpMap: tread, bumpScale: 3, roughness: 0.93, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b141c, metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.62, envMapIntensity: 2.0, clearcoat: 1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 1 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.28, metalness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.4, metalness: 0.85 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.5, metalness: 0.6 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.8 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.9 }),
    hoseR: new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.6 }),
    hoseY: new THREE.MeshStandardMaterial({ color: 0xd6a60e, roughness: 0.6 }),
    head: new THREE.MeshStandardMaterial({ color: 0xdfe8ef, emissive: 0xfff6e0, emissiveIntensity: 0.15, roughness: 0.1, metalness: 0.3 }),
    drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1010, emissiveIntensity: 0.1, roughness: 0.2 }),
    indL: new THREE.MeshStandardMaterial({ color: 0x6a3a00, emissive: 0xff9000, emissiveIntensity: 0.05, roughness: 0.2 }),
    indR: new THREE.MeshStandardMaterial({ color: 0x6a3a00, emissive: 0xff9000, emissiveIntensity: 0.05, roughness: 0.2 }),
    marker: new THREE.MeshStandardMaterial({ color: 0x7a4a00, emissive: 0xffa020, emissiveIntensity: 0.3 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0xbbbbbb, emissive: 0xffffff, emissiveIntensity: 0 }),
    bar: new THREE.MeshStandardMaterial({ color: 0xdde6ee, emissive: 0xffffff, emissiveIntensity: 0.05 }),
    cluster: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x39b6ff, emissiveIntensity: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.85 }),
    gravel: new THREE.MeshStandardMaterial({ map: gravelTex([135, 126, 112]), roughness: 1 }),
    icc: new THREE.MeshStandardMaterial({ map: stripeTex('#c8102e', '#f2f2f2', 10), roughness: 0.6 }),
    strap: new THREE.MeshStandardMaterial({ color: 0xe0a800, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffcc55, map: rimTex(), roughness: 0.18, metalness: 1 }),
    rimChrome: new THREE.MeshStandardMaterial({ color: 0xffffff, map: rimTex(), roughness: 0.07, metalness: 1 }),
    rimStd: new THREE.MeshStandardMaterial({ color: 0xe9e9e6, map: rimTex(), roughness: 0.35, metalness: 0.35 }),
  };
  return M;
}

// ---------- v32：外部 GLB 車頭模型（models/truck/truck.glb） ----------
// 節點名稱用「圖層__零件」：cab__ 跟著駕駛室點頭、tractor__ 底盤、kit_xxx__ 改裝件、trailer__／wheel__ 不用（拖車和輪子維持程式畫的）
// 換成自己下載的模型也行：照這個命名規則在 Blender 裡改名後匯出同一個檔名即可
let GLB = null, glbOn = true;
export function loadTruckGLB(url = 'models/truck/truck.glb') {
  return import('three/addons/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
    .then((g) => { GLB = g.scene; return true; })
    .catch(() => false);
}
export function setTruckGLB(on) { glbOn = !!on; }
export function truckGLBReady() { return !!GLB; }
const GLB_SKIP = /^(windshield|sidewin|sleeperwin|headlight|indicator|rail|fifthwheel|axle|faxle|rear_fender|mudflap|airtank)$/;
const GLB_KIT = { kit_bumper_chromeb: (c) => c.bumper === 'chromeb', kit_bumper_bull: (c) => c.bumper === 'bull', kit_spoiler: (c) => c.spoiler === 'on', kit_lightbar: (c) => c.lightbar === 'on', kit_visor: (c) => c.visor === 'on', kit_stacks: (c) => c.stacks === 'on', kit_skirts: (c) => c.skirts === 'on' };
function addGLB(cfg, targets, matFor) {
  const list = [];
  GLB.traverse((o) => {
    if (!o.isMesh) return;
    let n = o.name, q = o;
    while (q && !n.includes('__')) { q = q.parent; n = q ? q.name : ''; }
    const mm = /^([a-z_]+?)__([a-z_]+)/i.exec(n); if (!mm) return;
    const [, layer, piece] = mm;
    if (GLB_SKIP.test(piece)) return;
    if (layer === 'trailer' || layer === 'wheel') return;
    if (layer.startsWith('kit_') && !(GLB_KIT[layer] && GLB_KIT[layer](cfg))) return;
    if (layer === 'tractor' && !/^(tank|tank_strap|battery)$/.test(piece)) return;
    if (layer === 'kit_bumper_chromeb' || layer === 'kit_bumper_bull') list.push(['bumper_kit', o]);
    list.push([layer, o]);
  });
  // 有改裝保險桿就不要原廠的
  const hasKitBumper = list.some(([l]) => l === 'bumper_kit');
  for (const [layer, o] of list) {
    if (layer === 'bumper_kit') continue;
    if (hasKitBumper && /__bumper/.test(o.name)) continue;
    const c = o.clone(false);
    o.updateWorldMatrix(true, false); c.matrix.copy(o.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mapped = mats.map((mt) => matFor(mt.name, layer));
    c.material = mapped.length === 1 ? mapped[0] : mapped;
    c.castShadow = true; c.receiveShadow = true;
    (layer === 'tractor' || layer === 'kit_skirts' ? targets.tractor : targets.cab).add(c);
  }
}

// 燈光狀態（大燈、煞車、方向燈、倒車、燈條）
export function setTruckLights(s) {
  const m = mats();
  m.head.emissiveIntensity = s.head ? 6 : 0.15;
  m.tail.emissiveIntensity = (s.head ? 1.2 : 0.1) + (s.brake ? 4 : 0);
  m.indL.emissiveIntensity = s.indL ? 5 : 0.05;
  m.indR.emissiveIntensity = s.indR ? 5 : 0.05;
  m.reverse.emissiveIntensity = s.reverse ? 4 : 0;
  m.bar.emissiveIntensity = s.head ? 8 : 0.05;
  m.marker.emissiveIntensity = s.head ? 3 : 0.3;
}

// ---------- 共用幾何（輪胎、鋼圈） ----------
const SHARED = new Set();
let WG = null;
function wheelGeos() {
  if (WG) return WG;
  const prof = (k) => [[0.33, -0.16], [0.47, -0.16], [0.51, -0.13], [0.53, -0.1], [0.53, -0.035], [0.53, 0.035], [0.53, 0.1], [0.51, 0.13], [0.47, 0.16], [0.33, 0.16]]
    .map(([x, y]) => new THREE.Vector2(x, y * k));
  const tire = new THREE.LatheGeometry(prof(1), 40); tire.rotateZ(Math.PI / 2);
  const tireWide = new THREE.LatheGeometry(prof(1.3), 40); tireWide.rotateZ(Math.PI / 2);
  const parts = [new THREE.CylinderGeometry(0.33, 0.33, 0.2, 28), new THREE.CylinderGeometry(0.1, 0.13, 0.3, 16)];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, c = new THREE.CylinderGeometry(0.022, 0.022, 0.27, 6);
    c.translate(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19); parts.push(c);
  }
  const rim = mergeGeometries(parts); rim.rotateZ(Math.PI / 2);
  parts.forEach((p) => p.dispose());
  WG = { tire, tireWide, rim };
  Object.values(WG).forEach((g) => SHARED.add(g));
  return WG;
}

// ---------- 彩繪圖案 ----------
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
export function drawPattern(ctx, w, h, type, col) {
  const r = rng(12345);
  ctx.save();
  if (type === 'stripes') {
    ctx.fillStyle = col; ctx.fillRect(0, h * 0.4, w, h * 0.14); ctx.fillRect(0, h * 0.58, w, h * 0.04); ctx.fillRect(0, h * 0.32, w, h * 0.04);
  } else if (type === 'dots') {
    ctx.fillStyle = col; const s = h / 6;
    for (let y = s / 2, row = 0; y < h + s; y += s, row++) for (let x = row % 2 ? s / 2 : 0; x < w + s; x += s) { ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill(); }
  } else if (type === 'checker') {
    const s = h / 10;
    for (let y = h * 0.6, j = 0; y < h; y += s, j++) for (let x = 0, i = 0; x < w; x += s, i++) { ctx.fillStyle = (i + j) % 2 ? col : '#ffffff'; ctx.fillRect(x, y, s + 1, s + 1); }
  } else if (type === 'camo') {
    const shades = [shade(col, -0.35), col, shade(col, 0.3), shade(col, -0.6)];
    for (let i = 0; i < 90; i++) { ctx.fillStyle = shades[i % 4]; ctx.beginPath(); ctx.ellipse(r() * w, r() * h, (0.04 + r() * 0.08) * w, (0.05 + r() * 0.1) * h, r() * Math.PI, 0, Math.PI * 2); ctx.fill(); }
  } else if (type === 'stars') {
    ctx.fillStyle = col; const n = Math.round((14 * w) / h);
    for (let i = 0; i < n; i++) star(ctx, r() * w, r() * h, h * (0.04 + r() * 0.06));
  } else if (type === 'lightning') {
    const pts = [[0, 0], [0.18, 0], [0.08, 0.4], [0.22, 0.4], [-0.02, 1.0], [0.06, 0.52], [-0.08, 0.52]];
    const n = Math.max(2, Math.round((1.5 * w) / h));
    for (let k = 0; k < n; k++) {
      const x0 = w * ((k + 0.35) / n), y0 = h * 0.1, s = h * 0.8;
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(x0 + px * s, y0 + py * s) : ctx.moveTo(x0 + px * s, y0 + py * s))); ctx.closePath();
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
    ctx.fillStyle = col; const n = Math.round((7 * w) / h) + 3;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.3) * w) / n, wd = (w / n) * 0.28;
      let len = h * (0.25 + r() * 0.25);
      ctx.beginPath(); ctx.moveTo(x - wd, 0); ctx.lineTo(x + wd, 0); ctx.lineTo(x + r() * wd, len); ctx.closePath(); ctx.fill();
      len = h * (0.2 + r() * 0.25);
      const x2 = x + w / n / 2;
      ctx.beginPath(); ctx.moveTo(x2 - wd, h); ctx.lineTo(x2 + wd, h); ctx.lineTo(x2 + r() * wd, h - len); ctx.closePath(); ctx.fill();
    }
  } else if (type === 'rainbow') {
    const cols = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de'];
    const bh = h / cols.length; cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * bh, w, bh + 1); });
  }
  ctx.restore();
}
function drawName(ctx, w, h, text, base) {
  if (!text) return;
  let size = h * 0.34; ctx.font = `bold ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width; if (tw > w * 0.7) { size *= (w * 0.7) / tw; ctx.font = `bold ${size}px ${FONT}`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const light = luminance(base) > 0.45;
  ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = light ? '#ffffff' : '#111111'; ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = light ? '#1b1b1b' : '#ffffff'; ctx.fillText(text, w / 2, h / 2);
}

// 特殊烤漆材質：用物理材質參數呈現透明清漆、金屬粉與角度變色
let FLAKE_ROUGHNESS = null;
function makeFlakeRoughnessMap() {
  if (FLAKE_ROUGHNESS) return FLAKE_ROUGHNESS;
  const canvas = makeCanvas(512, 512), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, 512, 512);
  const r = rng(7341);
  for (let i = 0; i < 5200; i++) {
    const x = r() * 512, y = r() * 512, s = 0.35 + r() * 1.25;
    const v = Math.floor(65 + r() * 115);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  FLAKE_ROUGHNESS = tex;
  return FLAKE_ROUGHNESS;
}

function makePaintMat(paint, tex) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex });
  // 預設原廠烤漆也保留清漆層，讓車身高光更接近汽車烤漆
  m.metalness = 0.6; m.roughness = 0.3; m.clearcoat = 1; m.clearcoatRoughness = 0.06; m.envMapIntensity = 1.2;
  switch (paint) {
    case 'matte':
      m.metalness = 0.02; m.roughness = 0.88; m.clearcoat = 0.08; break;
    case 'metal':
      m.metalness = 0.72; m.roughness = 0.27; m.clearcoat = 1; m.clearcoatRoughness = 0.045;
      m.roughnessMap = makeFlakeRoughnessMap(); break;
    case 'pearl':
      m.metalness = 0.48; m.roughness = 0.22; m.clearcoat = 1; m.clearcoatRoughness = 0.035;
      m.iridescence = 1; m.iridescenceIOR = 1.45; m.iridescenceThicknessRange = [280, 980];
      m.roughnessMap = makeFlakeRoughnessMap(); break;
    case 'neon':
      m.metalness = 0.05; m.roughness = 0.3; m.clearcoat = 0.55;
      m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.45; break;
    case 'chrome':
      m.color.set(0xdfe5eb); m.metalness = 1; m.roughness = 0.035; m.clearcoat = 0.35; break;
    case 'chameleon':
      m.metalness = 0.68; m.roughness = 0.16; m.clearcoat = 1; m.clearcoatRoughness = 0.025;
      m.iridescence = 1; m.iridescenceIOR = 1.55; m.iridescenceThicknessRange = [180, 1100];
      m.roughnessMap = makeFlakeRoughnessMap(); break;
    case 'candy':
      m.metalness = 0.62; m.roughness = 0.14; m.clearcoat = 1; m.clearcoatRoughness = 0.018;
      m.roughnessMap = makeFlakeRoughnessMap(); break;
    case 'satin':
      m.metalness = 0.58; m.roughness = 0.43; m.clearcoat = 0.42; m.clearcoatRoughness = 0.22; break;
    case 'holographic':
      m.metalness = 0.78; m.roughness = 0.13; m.clearcoat = 1; m.clearcoatRoughness = 0.02;
      m.iridescence = 1; m.iridescenceIOR = 1.6; m.iridescenceThicknessRange = [100, 1200];
      m.roughnessMap = makeFlakeRoughnessMap(); break;
    case 'brushed':
      m.metalness = 0.9; m.roughness = 0.34; m.clearcoat = 0.55; m.clearcoatRoughness = 0.16;
      m.anisotropy = 0.7; break;
  }
  return m;
}

const GLOW_COLORS = { blue: 0x00b4ff, pink: 0xff4fd8, green: 0x2bff88, rainbow: 0xff0000 };

function fillPaint(ctx, w, h, colorA, colorB, mode = 'off') {
  if (mode === 'horizontal' || mode === 'vertical') {
    const g = mode === 'horizontal' ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colorA || '#b71c1c'); g.addColorStop(1, colorB || colorA || '#b71c1c');
    ctx.fillStyle = g;
  } else ctx.fillStyle = colorA || '#b71c1c';
  ctx.fillRect(0, 0, w, h);
}

// 玩家自訂彩繪貼圖快取（支援透明 PNG）
const artworkImages = new Map();
function drawArtwork(ctx, w, h, cfg, prefix, redraw) {
  const data=cfg[`${prefix}DecalData`]; if(!data)return;
  let img=artworkImages.get(data);
  if(!img){img=new Image();artworkImages.set(data,img);img.onload=()=>{if(typeof redraw==='function')redraw();};img.src=data;}
  if(!img.complete||!img.naturalWidth)return;
  const x=w*(.5+(cfg[`${prefix}DecalX`]||0)), y=h*(.5+(cfg[`${prefix}DecalY`]||0));
  const scale=cfg[`${prefix}DecalScale`]||.4, maxW=w*scale, maxH=h*scale;
  const ratio=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight);
  ctx.save();ctx.translate(x,y);ctx.rotate((cfg[`${prefix}DecalRotation`]||0)*Math.PI/180);
  ctx.drawImage(img,-img.naturalWidth*ratio/2,-img.naturalHeight*ratio/2,img.naturalWidth*ratio,img.naturalHeight*ratio);ctx.restore();
}

// v32：拖車側板的波浪板凹凸（法線貼圖，共用一張）
let RIB = null;
function ribNormal() {
  if (RIB) return RIB;
  const w = 1024, h = 8, cv = makeCanvas(w, h), ctx = cv.getContext('2d'), d = ctx.createImageData(w, h);
  const P = 22.6; // 約 30 公分一道
  for (let x = 0; x < w; x++) {
    // 梯形波：斜面的地方法線往左右偏
    const t = (x % P) / P;
    const slope = t < 0.15 ? 1 : t < 0.5 ? 0 : t < 0.65 ? -1 : 0;
    const nx = -slope * 0.7, nz = Math.sqrt(1 - nx * nx);
    for (let y = 0; y < h; y++) { const i = (y * w + x) * 4; d.data[i] = (nx * 0.5 + 0.5) * 255; d.data[i + 1] = 128; d.data[i + 2] = nz * 255; d.data[i + 3] = 255; }
  }
  ctx.putImageData(d, 0, 0);
  RIB = new THREE.CanvasTexture(cv); RIB.colorSpace = THREE.NoColorSpace; RIB.anisotropy = 8; SHARED.add(RIB);
  return RIB;
}

// v32：大燈光錐、路面光斑的漸層貼圖
const BEAM_TEX = {};
function beamTexture(kind) {
  if (BEAM_TEX[kind]) return BEAM_TEX[kind];
  const cv = makeCanvas(128, 128), g = cv.getContext('2d');
  if (kind === 'cone') { // 靠近燈最亮，越遠越淡
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  } else { // 橢圓光斑，邊緣柔和
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; SHARED.add(t); BEAM_TEX[kind] = t; return t;
}
// ======================================================================
export function buildRig(cfg, dirt = 0) {
  const m = mats(), W = wheelGeos();
  const own = [], surfaces = [];
  const geos = [];
  const box = (x, y, z) => { const g = new THREE.BoxGeometry(x, y, z); geos.push(g); return g; };
  const rbox = (x, y, z, r = 0.08, s = 3) => { const g = new RoundedBoxGeometry(x, y, z, s, Math.min(r, x / 2 - 0.001, y / 2 - 0.001, z / 2 - 0.001)); geos.push(g); return g; };
  const cyl = (r1, r2, h, s = 16) => { const g = new THREE.CylinderGeometry(r1, r2, h, s); geos.push(g); return g; };
  const part = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const surface = (w, h, painter) => {
    const canvas = makeCanvas(w, h), ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const s = { tex, redraw(d) { ctx.clearRect(0, 0, w, h); painter(ctx, w, h, () => s.redraw(d)); drawGrime(ctx, w, h, d, w + h); tex.needsUpdate = true; } };
    s.redraw(dirt); own.push(tex); surfaces.push(s); return s;
  };

  const US = cfg.cabStyle === 'us';
  const cham = cfg.paint === 'chameleon';
  // 歐式車頭、沒有彩繪圖案／自訂貼圖時用 GLB 模型（圖案要貼在程式畫的車殼上才對得準）
  const G = !!GLB && glbOn && !US && (cfg.pattern || 'none') === 'none' && !cfg.cabDecalData;
  const base = cham ? '#ffffff' : cfg.cabColor;
  const cabS = surface(512, 512, (ctx, w, h, redraw) => { fillPaint(ctx, w, h, base, cfg.cabColor2, cfg.cabGradient); drawPattern(ctx, w, h, cfg.pattern, cfg.patternColor); drawArtwork(ctx,w,h,cfg,'cab',redraw); });
  const plainS = surface(64, 64, (ctx, w, h) => { fillPaint(ctx, w, h, base, cfg.cabColor2, cfg.cabGradient); });
  const paint = makePaintMat(cfg.paint, cabS.tex), paintPlain = makePaintMat(cfg.paint, plainS.tex);
  own.push(paint, paintPlain);

  // 輪框材質
  let rimMat = m.rimStd;
  if (cfg.rims === 'chrome') rimMat = m.rimChrome;
  else if (cfg.rims === 'gold') rimMat = m.gold;
  else if (cfg.rims === 'color') { rimMat = new THREE.MeshStandardMaterial({ color: base, map: m.rimStd.map, metalness: 0.5, roughness: 0.3 }); own.push(rimMat); }

  const spins = [], front = [];
  const seatMat = new THREE.MeshStandardMaterial({ color: { beige: 0xbfa77f, red: 0x7c1818 }[cfg.interior] || 0x3a3330, roughness: 0.85 }); own.push(seatMat);
  const tSkirt = new THREE.MeshStandardMaterial({ color: cfg.trailerColor || '#e9ecef', roughness: 0.5, metalness: 0.2 }); own.push(tSkirt);
  // v24：駕駛座內裝（儀表板螢幕、中控導航、排檔桿、門板、遮陽板）
  const screenMats = { cluster: null, nav: null };
  const plane = (w, h) => { const g = new THREE.PlaneGeometry(w, h); geos.push(g); return g; };
  const sphere = (r) => { const g = new THREE.SphereGeometry(r, 14, 10); geos.push(g); return g; };
  const cockpit = (C, cx, cy, cz, top, cabW) => {
    const IN = { black: [0x1c1d20, 0x2b2420], beige: [0x3a342c, 0xc9b28c], red: [0x18181a, 0x8f1d1d] }[cfg.interior] || [0x1c1d20, 0x2b2420];
    const dash = new THREE.MeshStandardMaterial({ color: IN[0], roughness: 0.55, metalness: 0.05 }); own.push(dash);
    const trim = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.35, metalness: 0.6 }); own.push(trim);
    const leather = new THREE.MeshStandardMaterial({ color: IN[1], roughness: 0.7 }); own.push(leather);
    // 氣氛燈：儀表板下緣、兩邊門板一條發光燈條
    const AMB = { blue: 0x2f8cff, pink: 0xff4fc8, gold: 0xffb43a }[cfg.ambient];
    if (AMB) {
      const am = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: AMB, emissiveIntensity: 3 }); own.push(am);
      part(C, box(cabW - 0.4, 0.02, 0.02), am, 0, top - 0.02, cz - 0.02).castShadow = false;
      for (const sx of [1, -1]) part(C, box(0.02, 0.02, 1.2), am, sx * (cabW / 2 - 0.09), top - 0.05, cz - 0.7).castShadow = false;
    }
    // 儀表罩＋儀表螢幕（顯示真正的轉速表、速度表）
    // 儀表螢幕立在儀表板上、往駕駛的方向斜一點；上面一片薄薄的遮光罩
    part(C, rbox(0.56, 0.27, 0.05, 0.03), dash, cx, top + 0.1, cz + 0.035, 0.45);
    screenMats.cluster = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); own.push(screenMats.cluster);
    const cl = part(C, plane(0.5, 0.22), screenMats.cluster, cx, top + 0.1, cz + 0.005, 0.45, Math.PI, 0); cl.castShadow = false;
    // 中控台＋導航螢幕
    const midX = cx > 0 ? cx - 0.72 : cx + 0.72;
    part(C, rbox(0.34, 0.3, 0.05, 0.03), trim, midX, top + 0.12, cz + 0.03, 0.45);
    screenMats.nav = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); own.push(screenMats.nav);
    const nv = part(C, plane(0.26, 0.26), screenMats.nav, midX, top + 0.12, cz, 0.45, Math.PI, 0); nv.castShadow = false;
    part(C, rbox(0.42, 0.7, 0.55, 0.06), dash, midX, top - 0.6, cz - 0.32);
    // 排檔桿
    part(C, cyl(0.018, 0.022, 0.32, 10), trim, midX + (cx > 0 ? 0.08 : -0.08), top - 0.1, cz - 0.42, -0.35);
    part(C, sphere(0.045), leather, midX + (cx > 0 ? 0.08 : -0.08), top + 0.06, cz - 0.48);
    // 方向盤柱、門板、扶手、遮陽板
    part(C, cyl(0.05, 0.06, 0.4, 10), dash, cx, cy - 0.06, cz - 0.15, 1.0);
    for (const sx of [1, -1]) {
      part(C, box(0.06, 0.9, 1.4), leather, sx * (cabW / 2 - 0.05), top - 0.35, cz - 0.7);
      part(C, box(0.12, 0.06, 0.6), trim, sx * (cabW / 2 - 0.12), top - 0.25, cz - 0.75);
      part(C, box(0.7, 0.03, 0.3), leather, sx * 0.55, top + 0.9, cz - 0.15, -0.25);
    }
    // 車頂內襯
    part(C, box(cabW - 0.1, 0.04, 1.6), leather, 0, top + 1.08, cz - 0.7);
  };
  const wheel = (parent, x, z, { dual = false, wide = false } = {}) => {
    const g = new THREE.Group(); g.position.set(x, WHEEL_R, z); parent.add(g);
    const spin = new THREE.Group(); g.add(spin);
    const sx = Math.sign(x);
    const addTire = (ox, outer) => {
      const t = new THREE.Mesh(wide ? W.tireWide : W.tire, m.tire); t.position.x = ox; t.castShadow = true; spin.add(t);
      const rm = new THREE.Mesh(W.rim, outer ? rimMat : m.rimStd); rm.position.x = ox + (outer ? sx * 0.02 : 0); spin.add(rm);
    };
    if (dual) { addTire(-sx * 0.17, false); addTire(sx * 0.17, true); } else addTire(0, true);
    spins.push(spin);
    return g;
  };

  // ================= 車頭 =================
  const tractor = new THREE.Group(); tractor.rotation.order = 'YXZ';
  const pivot = US ? new THREE.Vector3(0, 1.6, 3.6) : new THREE.Vector3(0, 1.3, 4.2);
  const cab = new THREE.Group(); cab.position.copy(pivot); tractor.add(cab);
  const C = new THREE.Group(); C.position.copy(pivot).multiplyScalar(-1); cab.add(C);
  // v26：車身高度（低趴／加高：駕駛室和車身一起升降）
  const rideY = cfg.chassis === 'low' ? -0.12 : cfg.chassis === 'lift' ? 0.22 : 0;
  cab.position.y += rideY;

  const bumperZ = US ? 6.35 : 5.45;
  const cabBackZ = US ? 1.55 : 3.09;
  const windshield = [];
  const wipers = [];
  let steeringWheel, camLocal;

  // --- 大樑、底盤 ---
  for (const sx of [1, -1]) part(tractor, box(0.12, 0.32, 7.6), m.chassis, sx * 0.45, 1.0, 1.9);
  for (const z of [-1.3, 0.8, 2.6, 4.6]) part(tractor, box(0.9, 0.18, 0.1), m.chassis, 0, 1.0, z);
  // 傳動軸、差速器、車軸
  part(tractor, cyl(0.07, 0.07, 2.4, 10), m.steel, 0, 0.75, 1.9, Math.PI / 2);
  part(tractor, cyl(0.07, 0.07, 1.4, 10), m.steel, 0, 0.62, 0, Math.PI / 2);
  for (const z of [0.7, -0.7]) {
    part(tractor, cyl(0.11, 0.11, 1.75, 12), m.chassis, 0, WHEEL_R, z, 0, 0, Math.PI / 2);
    const d = part(tractor, new THREE.SphereGeometry(0.26, 14, 10), m.chassis, 0, WHEEL_R, z); geos.push(d.geometry); d.scale.set(1, 0.85, 1.1);
  }
  part(tractor, cyl(0.09, 0.09, 1.9, 10), m.chassis, 0, WHEEL_R, 3.8, 0, 0, Math.PI / 2);
  // 變速箱
  part(tractor, rbox(0.55, 0.5, 0.9, 0.08), m.chassis, 0, 0.95, 3.15);
  // 油箱（鋁）＋綁帶
  if (!G) {
    part(tractor, rbox(0.62, 0.62, 1.4, 0.26), cfg.tanks === 'chrome' ? m.chrome : m.alu, 1.0, 1.0, 2.25);
    for (const z of [1.8, 2.7]) part(tractor, box(0.66, 0.66, 0.05), m.black, 1.0, 1.0, z);
  }
  // 電瓶箱、儲氣筒
  part(tractor, rbox(0.55, 0.5, 0.8, 0.04), m.black, -1.0, 1.05, 1.9);
  for (const y of [0.78, 1.12]) part(tractor, cyl(0.15, 0.15, 0.9, 14), m.steel, -0.95, y, 2.85, Math.PI / 2);
  // v26：車頭側裙（前輪和後輪中間，同車身色）
  if (cfg.skirts === 'on' && !G) for (const sx of [1, -1]) part(tractor, rbox(0.06, 0.62, 2.1, 0.03), paintPlain, sx * 1.34, 1.05, 2.3);
  // 後擋泥板、擋泥皮
  for (const sx of [1, -1]) {
    part(tractor, rbox(0.75, 0.07, 2.9, 0.03), m.plastic, sx * 0.92, 1.2, 0);
    part(tractor, box(0.7, 0.55, 0.02), m.rubber, sx * 0.92, 0.6, -1.48);
    // 尾燈組
    part(tractor, box(0.6, 0.2, 0.08), m.black, sx * 0.85, 1.0, -1.55);
    part(tractor, box(0.25, 0.14, 0.03), m.tail, sx * 0.95, 1.0, -1.6);
    part(tractor, box(0.12, 0.14, 0.03), sx > 0 ? m.indL : m.indR, sx * 0.72, 1.0, -1.6);
    part(tractor, box(0.1, 0.14, 0.03), m.reverse, sx * 0.6, 1.0, -1.6);
  }
  // 第五輪（聯結器）
  part(tractor, cyl(0.72, 0.72, 0.14, 24), m.black, 0, 1.25, 0.15);
  // 氣壓管線（紅、黃螺旋管）
  for (const [ox, mat] of [[0.18, m.hoseR], [-0.05, m.hoseY]]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * Math.PI * 12;
      pts.push(new THREE.Vector3(ox + Math.cos(a) * 0.09, 2.5 - t * 1.0 - Math.sin(t * Math.PI) * 0.25 + Math.sin(a) * 0.09, cabBackZ - 0.12 - t * 1.6));
    }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.022, 6); geos.push(tg);
    part(tractor, tg, mat, 0, 0, 0);
  }
  // 前保險桿、霧燈、車牌、拖車勾
  const bumperMat = cfg.bumper === 'chromeb' || US ? m.chrome : m.chassis;
  if (!G) part(tractor, rbox(2.5, 0.5, 0.36, 0.08), bumperMat, 0, 1.15, bumperZ);
  for (const sx of [1, -1]) {
    part(tractor, cyl(0.09, 0.09, 0.05, 16), m.head, sx * 0.85, 1.12, bumperZ + 0.17, Math.PI / 2);
  }
  const plate = plateTex(US ? 'KLC-7788' : 'KLA-0168'); own.push(plate);
  const plateMat = new THREE.MeshStandardMaterial({ map: plate, roughness: 0.4 }); own.push(plateMat);
  part(tractor, box(0.52, 0.13, 0.02), plateMat, 0, 1.08, bumperZ + 0.19);
  if (cfg.bumper === 'bull' && !G) {
    const z = bumperZ + 0.42;
    for (const x of [-1.0, -0.4, 0.4, 1.0]) part(tractor, cyl(0.06, 0.06, 1.5, 10), m.chrome, x, 1.75, z);
    for (const y of [1.4, 2.45]) part(tractor, cyl(0.06, 0.06, 2.25, 10), m.chrome, 0, y, z, 0, 0, Math.PI / 2);
  }

  // --- 駕駛室 ---
  if (!US) {
    if (!G) {
      part(C, rbox(2.5, 2.75, 2.25, 0.14, 4), paint, 0, 2.72, 4.22);
      part(C, rbox(2.44, 0.5, 2.15, 0.16, 4), paintPlain, 0, 4.25, 4.18); // 高頂
    }
    // 擋風玻璃（外框四條，中間看得穿）
    const wg = part(C, box(2.22, 1.15, 0.03), m.glass, 0, 3.42, 5.37, -0.1); windshield.push(wg);
    part(C, box(2.34, 0.08, 0.06), m.black, 0, 4.02, 5.31, -0.1);
    part(C, box(2.34, 0.1, 0.06), m.black, 0, 2.83, 5.39, -0.1);
    for (const sx of [1, -1]) part(C, box(0.09, 1.25, 0.06), m.black, sx * 1.15, 3.42, 5.36, -0.1);
    // 側窗、門縫、門把、踏板
    for (const sx of [1, -1]) {
      windshield.push(part(C, box(0.03, 0.85, 1.05), m.glass, sx * 1.255, 3.45, 4.75));
      if (G) continue; // 門縫、門把、踏板、後照鏡由 GLB 模型提供
      part(C, box(0.012, 2.3, 0.025), m.black, sx * 1.252, 2.6, 4.18);
      part(C, box(0.012, 2.3, 0.025), m.black, sx * 1.252, 2.6, 5.28);
      part(C, box(0.04, 0.06, 0.26), m.chrome, sx * 1.27, 2.8, 4.35);
      part(C, box(0.42, 0.06, 0.6), m.steel, sx * 1.12, 1.15, 4.4);
      part(C, box(0.4, 0.06, 0.6), m.steel, sx * 1.1, 0.72, 4.4);
      // 後照鏡
      part(C, box(0.42, 0.05, 0.05), m.black, sx * 1.45, 3.8, 5.12);
      part(C, rbox(0.13, 0.72, 0.32, 0.05), m.black, sx * 1.7, 3.42, 5.12);
      part(C, box(0.01, 0.62, 0.26), m.chrome, sx * 1.7, 3.42, 4.955);
      part(C, rbox(0.11, 0.3, 0.28, 0.04), m.black, sx * 1.66, 2.88, 5.12);
    }
    // 水箱罩、標誌、大燈、方向燈
    if (!G) {
      part(C, box(1.95, 1.05, 0.05), m.grille, 0, 2.18, 5.36);
      for (let i = 0; i < 5; i++) part(C, box(1.85, 0.05, 0.06), m.chrome, 0, 1.78 + i * 0.2, 5.39);
    }
    part(C, cyl(0.14, 0.14, 0.03, 24), m.chrome, 0, 2.78, 5.4, Math.PI / 2);
    for (const sx of [1, -1]) {
      part(C, rbox(0.58, 0.3, 0.08, 0.04), m.black, sx * 0.9, 1.6, 5.36);
      part(C, box(0.5, 0.2, 0.03), m.head, sx * 0.9, 1.6, 5.405);
      part(C, box(0.5, 0.03, 0.03), m.drl, sx * 0.9, 1.75, 5.41);
      part(C, box(0.12, 0.16, 0.03), sx > 0 ? m.indL : m.indR, sx * 1.2, 1.6, 5.4);
    }
    // 車頂黃色示寬燈
    if (!G) for (let i = 0; i < 5; i++) part(C, box(0.14, 0.06, 0.06), m.marker, -0.6 + i * 0.3, 4.5, 5.25);
    // 雨刷
    for (const px of [0.62, -0.42]) {
      const p = new THREE.Group(); p.position.set(px, 2.92, 5.44); C.add(p);
      part(p, box(0.95, 0.035, 0.035), m.black, -0.47, 0, 0);
      wipers.push(p);
    }
    // 車內：儀表板、方向盤、座椅
    part(C, box(2.3, 0.45, 0.6), m.interior, 0, 2.95, 4.95);
    cockpit(C, 0.6, 3.1, 4.64, 3.175, 2.4);
    for (const sx of [1, -1]) part(C, box(0.6, 0.9, 0.12), seatMat, sx * 0.6, 2.4, 3.6);
    part(C, box(2.3, 2.5, 0.05), m.interior, 0, 2.7, 3.15);
    steeringWheel = new THREE.Group(); steeringWheel.position.set(0.6, 3.3, 4.42); steeringWheel.rotation.x = 0.6; C.add(steeringWheel);
    const sw = new THREE.Group(); steeringWheel.add(sw);
    const tor = new THREE.TorusGeometry(0.23, 0.036, 10, 32); geos.push(tor);
    part(sw, tor, m.black, 0, 0, 0);
    part(sw, box(0.44, 0.04, 0.02), m.black, 0, 0, 0); part(sw, box(0.04, 0.22, 0.02), m.black, 0, -0.11, 0);
    steeringWheel = sw;
    camLocal = new THREE.Vector3(0.6, 3.82, 3.7); // 駕駛眼睛：坐高一點、離儀表板遠一點
    // 遮陽板、燈條、導流罩
    if (cfg.visor === 'on' && !G) part(C, box(2.45, 0.06, 0.48), paintPlain, 0, 4.1, 5.52, 0.25);
    if (cfg.lightbar === 'on' && !G) {
      part(C, rbox(2.0, 0.16, 0.22, 0.05), m.black, 0, 4.62, 5.12);
      for (let i = 0; i < 6; i++) part(C, box(0.26, 0.11, 0.03), m.bar, -0.8 + i * 0.32, 4.62, 5.24);
    }
    if (cfg.spoiler === 'on' && !G) part(C, rbox(2.4, 0.9, 1.9, 0.2), paintPlain, 0, 4.85, 4.0, -0.35);
    if (G) {
      // GLB 材質換成遊戲自己的（烤漆顏色、燈會亮、鍍鉻反光都跟著設定）
      const glbMat = (name, layer) => {
        if (/^PAINT/.test(name)) return paintPlain;
        if (name === 'chrome') return layer === 'tractor' && cfg.tanks !== 'chrome' ? m.alu : m.chrome;
        if (name === 'alu') return layer === 'tractor' && cfg.tanks === 'chrome' ? m.chrome : m.alu;
        if (name === 'headlight') return layer === 'kit_lightbar' ? m.bar : m.head;
        if (name === 'amber') return m.marker;
        if (name === 'tail') return m.tail;
        if (name === 'glass') return m.glass;
        if (name === 'grille') return m.grille;
        if (name === 'steel') return m.steel;
        if (name === 'frame') return m.chassis;
        if (name === 'rubber') return m.rubber;
        if (name === 'black') return m.black;
        return m.plastic;
      };
      addGLB(cfg, { cab: C, tractor }, glbMat);
    }
  } else {
    // 美式長鼻：駕駛室＋長引擎蓋
    part(C, rbox(2.4, 2.4, 1.9, 0.15, 4), paint, 0, 3.0, 2.5);
    part(C, rbox(2.0, 1.45, 2.75, 0.12, 4), paint, 0, 2.42, 4.85, 0.04);
    for (const sx of [1, -1]) part(C, rbox(0.42, 0.55, 1.7, 0.2), paintPlain, sx * 1.1, 1.6, 4.1);
    // 擋風玻璃（兩片）
    for (const sx of [1, -1]) windshield.push(part(C, box(1.02, 0.85, 0.03), m.glass, sx * 0.55, 3.62, 3.47, -0.16));
    part(C, box(0.06, 0.95, 0.06), m.black, 0, 3.62, 3.46, -0.16);
    part(C, box(2.2, 0.08, 0.06), m.black, 0, 4.06, 3.4, -0.16);
    part(C, box(2.2, 0.08, 0.06), m.black, 0, 3.18, 3.53, -0.16);
    for (const sx of [1, -1]) {
      windshield.push(part(C, box(0.03, 0.75, 0.95), m.glass, sx * 1.205, 3.62, 2.65));
      part(C, box(0.012, 2.0, 0.025), m.black, sx * 1.202, 2.95, 1.75);
      part(C, box(0.012, 2.0, 0.025), m.black, sx * 1.202, 2.95, 3.25);
      part(C, box(0.04, 0.06, 0.24), m.chrome, sx * 1.22, 3.05, 1.95);
      part(C, box(0.42, 0.06, 0.6), m.steel, sx * 1.12, 1.5, 2.5);
      part(C, box(0.4, 0.06, 0.6), m.steel, sx * 1.1, 1.0, 2.5);
      // 西海岸後照鏡
      part(C, cyl(0.025, 0.025, 1.0, 8), m.chrome, sx * 1.45, 3.4, 3.2);
      part(C, rbox(0.1, 0.75, 0.25, 0.04), m.chrome, sx * 1.5, 3.4, 3.2);
      // 空氣濾清器
      part(C, cyl(0.24, 0.24, 1.0, 20), m.chrome, sx * 1.33, 3.0, 3.75);
      // 大燈
      part(C, rbox(0.42, 0.26, 0.08, 0.04), m.black, sx * 0.98, 1.95, 5.97);
      part(C, box(0.36, 0.2, 0.03), m.head, sx * 0.98, 1.95, 6.02);
      part(C, box(0.36, 0.03, 0.03), m.drl, sx * 0.98, 2.1, 6.02);
      part(C, box(0.12, 0.12, 0.03), sx > 0 ? m.indL : m.indR, sx * 1.22, 1.78, 5.0);
    }
    // 大水箱罩
    part(C, box(1.32, 1.3, 0.08), m.chrome, 0, 2.3, 6.22);
    part(C, box(1.16, 1.14, 0.05), m.grille, 0, 2.3, 6.25);
    for (let i = 0; i < 9; i++) part(C, box(1.1, 0.035, 0.05), m.chrome, 0, 1.82 + i * 0.12, 6.27);
    part(C, box(0.3, 0.12, 0.04), m.chrome, 0, 3.0, 6.0);
    for (let i = 0; i < 5; i++) part(C, box(0.14, 0.06, 0.06), m.marker, -0.6 + i * 0.3, 4.24, 3.42);
    for (const px of [0.55, -0.55]) {
      const p = new THREE.Group(); p.position.set(px + 0.45, 3.2, 3.56); C.add(p);
      part(p, box(0.8, 0.03, 0.03), m.black, -0.4, 0, 0);
      wipers.push(p);
    }
    part(C, box(2.2, 0.45, 0.5), m.interior, 0, 3.15, 3.15);
    cockpit(C, 0.55, 3.28, 2.88, 3.375, 2.35);
    for (const sx of [1, -1]) part(C, box(0.6, 0.9, 0.12), seatMat, sx * 0.55, 2.7, 1.8);
    const swg = new THREE.Group(); swg.position.set(0.55, 3.52, 2.66); swg.rotation.x = 0.6; C.add(swg);
    const sw = new THREE.Group(); swg.add(sw);
    const tor = new THREE.TorusGeometry(0.24, 0.036, 10, 32); geos.push(tor);
    part(sw, tor, m.black, 0, 0, 0); part(sw, box(0.46, 0.04, 0.02), m.black, 0, 0, 0);
    steeringWheel = sw;
    camLocal = new THREE.Vector3(0.55, 4.02, 1.95);
    if (cfg.visor === 'on') part(C, box(2.3, 0.06, 0.45), paintPlain, 0, 4.18, 3.62, 0.25);
    if (cfg.lightbar === 'on') {
      part(C, rbox(2.0, 0.16, 0.22, 0.05), m.black, 0, 4.32, 3.3);
      for (let i = 0; i < 6; i++) part(C, box(0.26, 0.11, 0.03), m.bar, -0.8 + i * 0.32, 4.32, 3.42);
    }
    if (cfg.spoiler === 'on') part(C, rbox(2.3, 0.9, 1.7, 0.2), paintPlain, 0, 4.55, 2.4, -0.3);
  }
  // 直立排氣管（美式車頭也可以裝）
  if (cfg.stacks === 'on' && !G) {
    for (const sx of [1, -1]) {
      part(C, cyl(0.12, 0.12, 3.4, 16), m.chrome, sx * 1.12, 3.0, cabBackZ - 0.18);
      part(C, cyl(0.15, 0.12, 0.35, 16), m.chrome, sx * 1.12, 4.8, cabBackZ - 0.18, 0.25);
    }
  } else if (cfg.stacks !== 'on') {
    part(tractor, rbox(0.5, 0.45, 0.7, 0.1), m.steel, 1.0, 1.05, 3.1);
  }
  // 頭燈光束（晚上才開）；v26 大燈顏色
  m.head.emissive.set(HEAD_COL[cfg.headlight] || 0xfff6e0);
  const spots = [];
  const hz = US ? 6.05 : 5.42, hy = US ? 1.95 : 1.6;
  for (const sx of [1, -1]) {
    const sp = new THREE.SpotLight(HEAD_COL[cfg.headlight] || 0xfff2dd, 0, 90, 0.5, 0.55, 1.2);
    sp.position.set(sx * 0.9, hy, hz); sp.target.position.set(sx * 1.5, 0, hz + 30);
    C.add(sp, sp.target); spots.push(sp);
  }
  // v32：晚上看得到的大燈光錐（從燈往前斜下打到路面）＋路面上的光斑
  const beams = [];
  const beamMat = (base, tex) => { const mm = new THREE.MeshBasicMaterial({ color: HEAD_COL[cfg.headlight] || 0xfff2dd, map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }); mm.userData = {}; own.push(mm); return mm; };
  const coneTex = beamTexture('cone'), poolTex = beamTexture('pool');
  for (const sx of [1, -1]) {
    const len = 26, cg = new THREE.ConeGeometry(3.2, len, 20, 1, true); geos.push(cg);
    cg.translate(0, -len / 2, 0); // 尖端在燈上
    const cone = new THREE.Mesh(cg, beamMat(0.1, coneTex)); cone.userData.base = 0.1;
    cone.position.set(sx * 0.9, hy, hz + 0.05);
    cone.rotation.x = -Math.PI / 2 + Math.atan2(hy - 0.1, len * 0.95); // 往前、慢慢往下碰到地面
    cone.renderOrder = 3; cone.visible = false; cone.castShadow = false; C.add(cone); beams.push(cone);
  }
  const pg = new THREE.PlaneGeometry(7.5, 22); geos.push(pg); pg.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(pg, beamMat(0.45, poolTex)); pool.userData.base = 0.45;
  pool.position.set(0, 0.06, hz + 13); pool.renderOrder = 2; pool.visible = false; tractor.add(pool); beams.push(pool);

  // 前輪、後輪（雙輪）
  for (const sx of [1, -1]) {
    front.push(wheel(tractor, sx * 1.05, 3.8));
    wheel(tractor, sx * 0.92, 0.7, { dual: true });
    wheel(tractor, sx * 0.92, -0.7, { dual: true });
  }

  // 底盤燈
  let glowMat = null, glowLight = null;
  if (cfg.glow !== 'off') {
    glowMat = new THREE.MeshBasicMaterial({ color: GLOW_COLORS[cfg.glow], transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    own.push(glowMat);
    const gg = new THREE.PlaneGeometry(3.4, 8); geos.push(gg);
    const g = new THREE.Mesh(gg, glowMat); g.rotation.x = -Math.PI / 2; g.position.set(0, 0.06, 2); tractor.add(g);
    glowLight = new THREE.PointLight(GLOW_COLORS[cfg.glow], 25, 10, 1.6); glowLight.position.set(0, 0.45, 2); tractor.add(glowLight);
  }

  // ================= 拖車 =================
  const trailer = new THREE.Group(); trailer.rotation.order = 'YXZ';
  const tBody = new THREE.Group(); tBody.position.y = 1.3; trailer.add(tBody);
  const T = new THREE.Group(); T.position.y = -1.3; tBody.add(T);
  const tType = cfg.trailerType || 'box';
  const tSpins = [];
  const tWheel = (x, z) => { const g = wheel(trailer, x, z, { wide: true }); tSpins.push(spins.pop()); return g; };
  // 大樑、支撐腳、車軸
  for (const sx of [1, -1]) part(trailer, box(0.12, 0.4, 12.6), m.chassis, sx * 0.5, 1.15, -6.3);
  for (const sx of [1, -1]) {
    part(trailer, box(0.12, 0.85, 0.12), m.steel, sx * 0.85, 0.88, -1.9);
    part(trailer, box(0.3, 0.05, 0.3), m.steel, sx * 0.85, 0.45, -1.9);
  }
  for (const z of [-9.4, -10.7, -12.0]) {
    part(trailer, cyl(0.1, 0.1, 1.9, 10), m.chassis, 0, WHEEL_R, z, 0, 0, Math.PI / 2);
    for (const sx of [1, -1]) tWheel(sx * 1.0, z);
  }
  // 擋泥板、側邊防撞桿、尾燈、防撞桿
  for (const sx of [1, -1]) {
    part(trailer, rbox(0.55, 0.06, 4.0, 0.02), m.plastic, sx * 1.0, 1.2, -10.7);
    part(trailer, box(0.6, 0.5, 0.02), m.rubber, sx * 1.0, 0.62, -12.75);
    if (cfg.skirts === 'on') part(trailer, box(0.04, 0.72, 6.6), tSkirt, sx * 1.22, 0.86, -5.4); // 拖車空力側裙
    else { part(trailer, box(0.05, 0.12, 6.0), m.steel, sx * 1.2, 0.85, -5.4); part(trailer, box(0.05, 0.12, 6.0), m.steel, sx * 1.2, 1.1, -5.4); }
    part(trailer, box(0.7, 0.22, 0.08), m.black, sx * 0.85, 1.0, -12.95);
    part(trailer, box(0.28, 0.16, 0.03), m.tail, sx * 0.95, 1.0, -13.0);
    part(trailer, box(0.13, 0.16, 0.03), sx > 0 ? m.indL : m.indR, sx * 0.7, 1.0, -13.0);
    part(trailer, box(0.11, 0.16, 0.03), m.reverse, sx * 0.57, 1.0, -13.0);
    for (let i = 0; i < 5; i++) part(trailer, box(0.03, 0.06, 0.1), m.marker, sx * 1.22, 1.35, -1.5 - i * 2.6);
  }
  part(trailer, box(2.3, 0.14, 0.12), m.icc, 0, 0.6, -12.95);
  part(trailer, box(0.52, 0.13, 0.02), plateMat, 0, 0.82, -12.98);
  // 備胎
  const spare = new THREE.Mesh(W.tireWide, m.tire); spare.rotation.z = Math.PI / 2; spare.position.set(0, 0.75, -7.2); trailer.add(spare);

  const tBase = cfg.trailerColor;
  const tPaint = (ctx, w, h, withName) => {
    fillPaint(ctx, w, h, tBase, cfg.trailerColor2, cfg.trailerGradient);
    drawPattern(ctx, w, h, cfg.trailerPattern, cfg.trailerPatColor);
    if (withName) drawName(ctx, w, h, cfg.name, tBase);
  };
  const tMat = (s, extra = {}) => { const mm = new THREE.MeshStandardMaterial({ map: s.tex, roughness: 0.45, metalness: 0.15, ...extra }); own.push(mm); return mm; };
  let load = null;
  if (tType === 'box') {
    const sideS = surface(1024, 226, (c, w, h, redraw) => { tPaint(c, w, h, true); drawArtwork(c,w,h,cfg,'trailer',redraw); c.fillStyle = 'rgba(0,0,0,.08)'; for (let x = 0; x < w; x += 48) c.fillRect(x, 0, 2, h); });
    const endS = surface(256, 256, (c, w, h) => tPaint(c, w, h, false));
    const doorS = surface(256, 300, (c, w, h) => {
      c.fillStyle = tBase; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(w / 2 - 2, 0, 4, h);
      c.fillStyle = 'rgba(0,0,0,.25)'; for (const y of [30, 120, 210, 280]) { c.fillRect(4, y, 22, 10); c.fillRect(w - 26, y, 22, 10); }
    });
    const sideM = tMat(sideS, { normalMap: ribNormal(), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.38, metalness: 0.35 }), endM = tMat(endS), doorM = tMat(doorS);
    part(T, rbox(2.55, 3.0, 13.6, 0.06, 2), [sideM, sideM, endM, m.chassis, endM, doorM], 0, 2.95, -5.9);
    for (const sx of [1, -1]) {
      part(T, box(0.06, 0.1, 13.6), m.alu, sx * 1.27, 4.42, -5.9);
      part(T, box(0.06, 0.12, 13.6), m.alu, sx * 1.27, 1.5, -5.9);
    }
    for (const x of [-0.75, -0.35, 0.35, 0.75]) part(T, cyl(0.025, 0.025, 2.8, 8), m.chrome, x, 2.95, -12.73);
  } else if (tType === 'dump') {
    const sideS = surface(1024, 168, (c, w, h, redraw) => { tPaint(c, w, h, true); drawArtwork(c,w,h,cfg,'trailer',redraw); });
    const plainT = surface(64, 64, (c, w, h) => { c.fillStyle = tBase; c.fillRect(0, 0, w, h); });
    const sideM = tMat(sideS, { metalness: 0.3 }), pM = tMat(plainT, { metalness: 0.3 });
    part(T, box(2.45, 0.12, 11.0), m.steel, 0, 1.7, -6.7);
    for (const sx of [1, -1]) part(T, box(0.08, 1.8, 11.0), [sideM, sideM, pM, pM, pM, pM], sx * 1.22, 2.6, -6.7);
    part(T, box(2.5, 2.3, 0.1), pM, 0, 2.85, -1.2);
    part(T, box(2.5, 1.8, 0.1), pM, 0, 2.6, -12.2);
    for (const sx of [1, -1]) {
      for (let i = 0; i < 8; i++) part(T, box(0.06, 1.8, 0.1), pM, sx * 1.28, 2.6, -1.8 - i * 1.4);
      part(T, box(0.1, 0.1, 11.0), pM, sx * 1.28, 3.5, -6.7);
    }
    part(T, cyl(0.12, 0.12, 1.4, 12), m.chrome, 0, 2.0, -1.0);
    // 砂石堆
    const N = makeNoise(5);
    const hg = new THREE.PlaneGeometry(2.3, 10.6, 14, 50); hg.rotateX(-Math.PI / 2); geos.push(hg);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const ex = Math.max(0, 1 - (x / 1.15) ** 2), ez = Math.max(0, 1 - (z / 5.3) ** 6);
      p.setY(i, 1.05 * Math.pow(ex, 0.6) * ez * (0.8 + N.fbm(x * 1.5, z * 0.8, 3) * 0.5));
    }
    hg.computeVertexNormals();
    load = part(T, hg, m.gravel, 0, 1.8, -6.7);
  } else {
    // 平板車
    const railS = surface(1024, 64, (c, w, h) => tPaint(c, w, h, false));
    const headS = surface(512, 320, (c, w, h) => tPaint(c, w, h, true));
    const railM = tMat(railS), headM = tMat(headS);
    part(T, box(2.5, 0.16, 13.6), [m.chassis, m.chassis, m.wood, m.chassis, m.chassis, m.chassis], 0, 1.56, -5.9);
    for (const sx of [1, -1]) {
      part(T, box(0.1, 0.32, 13.6), railM, sx * 1.23, 1.46, -5.9);
      for (let i = 0; i < 10; i++) part(T, box(0.08, 0.5, 0.08), m.black, sx * 1.26, 1.85, 0.3 - i * 1.4);
    }
    part(T, box(2.5, 1.7, 0.12), headM, 0, 2.5, 0.75);
    load = new THREE.Group(); T.add(load);
    const crate = new THREE.MeshStandardMaterial({ map: m.wood.map, color: 0xd8c8a8, roughness: 0.85 }); own.push(crate);
    for (const z of [-1.6, -4.6, -7.6]) {
      part(load, box(2.2, 1.4, 2.6), crate, 0, 2.35, z);
      for (const dz of [-0.7, 0.7]) part(load, box(2.26, 1.44, 0.06), m.strap, 0, 2.36, z + dz);
    }
    for (let i = 0; i < 9; i++) part(load, cyl(0.12, 0.12, 4.0, 10), m.steel, -0.8 + (i % 5) * 0.4, 1.78 + Math.floor(i / 5) * 0.24, -11.0, Math.PI / 2);
  }
  if (load) load.visible = false;

  return {
    tractor, cab, trailer, trailerBody: tBody, front, spins, trailerSpins: tSpins, wipers, steeringWheel, spots, windshield,
    beams, camLocal, cabInner: C, frontZ: US ? 6.6 : 5.7, screenMats, mirrorLocal: US ? [new THREE.Vector3(1.5, 3.4, 3.2), new THREE.Vector3(-1.5, 3.4, 3.2)] : [new THREE.Vector3(1.45, 3.3, 5.1), new THREE.Vector3(-1.45, 3.3, 5.1)], paint, paintPlain, rimMat: cfg.rims === 'color' ? rimMat : null,
    chameleon: cham, glowMat, glowLight, rainbowGlow: cfg.glow === 'rainbow',
    setLoaded(v) { if (load) load.visible = v; },
    redrawDirt(d) { surfaces.forEach((s) => s.redraw(d)); },
    dispose() {
      tractor.removeFromParent(); trailer.removeFromParent();
      geos.forEach((g) => { if (!SHARED.has(g)) g.dispose(); });
      own.forEach((o) => o.dispose());
    },
  };
}
